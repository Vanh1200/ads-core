import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../infrastructure/database/prisma';

const DEVICE_TOKEN_TTL = '15m';
const REFRESH_TOKEN_DAYS = 90;
const INACTIVE_DEVICE_DAYS = 45;
const CHALLENGE_TTL_MS = 60_000;
const MAX_USER_AGENT_LENGTH = 2_000;
const TRIAL_DAYS = 7;

function secret() { return process.env.XOY_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production'; }
function hash(value: string) { return crypto.createHmac('sha256', process.env.XOY_LICENSE_PEPPER || secret()).update(value.trim()).digest('hex'); }
function canonicalJson(value: any): string {
    if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
    return JSON.stringify(value);
}
function deviceHash(value: unknown) { return crypto.createHmac('sha256', process.env.XOY_DEVICE_HASH_SECRET || process.env.XOY_LICENSE_PEPPER || secret()).update(canonicalJson(value)).digest('hex'); }
function encryptionKey() { return crypto.createHash('sha256').update(process.env.XOY_LICENSE_ENCRYPTION_KEY || secret()).digest(); }
function encryptKey(value: string) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    return `${iv.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}.${encrypted.toString('base64url')}`;
}
function decryptKey(value: string) {
    const [ivValue, tagValue, encryptedValue] = value.split('.');
    if (!ivValue || !tagValue || !encryptedValue) throw new Error('LICENSE_KEY_UNAVAILABLE');
    const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([decipher.update(Buffer.from(encryptedValue, 'base64url')), decipher.final()]).toString('utf8');
}
function newRefreshToken() { return crypto.randomBytes(48).toString('base64url'); }
function requiredText(value: unknown, label: string, max = 255) {
    const text = String(value || '').trim();
    if (!text || text.length > max) throw new Error(`BAD_REQUEST: ${label} không hợp lệ`);
    return text;
}
function optionalText(value: unknown, max = 255) {
    const text = String(value || '').trim();
    return text ? text.slice(0, max) : null;
}
function ensureUsableLicense(license: any) {
    if (!['ISSUED', 'ACTIVE'].includes(license.status)) throw new Error('LICENSE_UNAVAILABLE');
    if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) throw new Error('LICENSE_UNAVAILABLE');
}
function normalizeDeviceContext(input: any) {
    const context = input && typeof input === 'object' ? input : {};
    const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
    const numberArray = (value: unknown, maxItems = 4) => Array.isArray(value) ? value.slice(0, maxItems).map(number).filter((item) => item !== null) : [];
    const webgl = context.webglProfile && typeof context.webglProfile === 'object' ? context.webglProfile : {};
    const result = {
        os: optionalText(context.os, 32), architecture: optionalText(context.architecture, 32), naclArchitecture: optionalText(context.naclArchitecture, 32),
        logicalCpuCount: number(context.logicalCpuCount), memoryGiB: number(context.memoryGiB),
        webglVendor: optionalText(context.webglVendor, 255), webglRenderer: optionalText(context.webglRenderer, 1_000), canvasToken: optionalText(context.canvasToken, 64),
        webglProfile: {
            version: optionalText(webgl.version, 255), shadingLanguageVersion: optionalText(webgl.shadingLanguageVersion, 255),
            maxTextureSize: number(webgl.maxTextureSize), maxCubeMapTextureSize: number(webgl.maxCubeMapTextureSize),
            maxRenderbufferSize: number(webgl.maxRenderbufferSize), maxViewportDimensions: numberArray(webgl.maxViewportDimensions, 2), extensionCount: number(webgl.extensionCount),
        },
        browserArchitecture: optionalText(context.browserArchitecture, 64), browserBitness: optionalText(context.browserBitness, 16), browserPlatform: optionalText(context.browserPlatform, 64),
    };
    if (!result.os || !result.architecture || !result.logicalCpuCount || !result.memoryGiB) throw new Error('BAD_REQUEST: Device context không hợp lệ');
    return result;
}
function normalizeExtension(input: any) {
    const extension = input && typeof input === 'object' ? input : {};
    const manifestVersion = Number(extension.manifestVersion);
    return { id: optionalText(extension.id, 255), name: optionalText(extension.name, 255), version: optionalText(extension.version, 100), manifestVersion: Number.isInteger(manifestVersion) ? manifestVersion : null };
}
function normalizePublicKey(input: any) {
    const key = input && typeof input === 'object' ? input : {};
    if (key.kty !== 'EC' || key.crv !== 'P-256' || !optionalText(key.x, 128) || !optionalText(key.y, 128)) throw new Error('BAD_REQUEST: Device public key không hợp lệ');
    return { kty: 'EC', crv: 'P-256', x: String(key.x), y: String(key.y), ext: true };
}
function publicKeyHash(publicKey: unknown) { return crypto.createHash('sha256').update(canonicalJson(publicKey)).digest('hex'); }
function proofPayload({ challengeId, nonce, installationId, timestamp }: any) { return ['XOY-DEVICE-PROOF-V1', challengeId, nonce, installationId, String(timestamp)].join('\n'); }
function featuresFor(plan: 'BASIC' | 'FULL') {
    const basic = plan === 'BASIC';
    return { appeal: true, verify: true, reactivate: true, rename: true, backupCampaign: !basic, backupPerformance: !basic };
}
function trialExpiresAt() { return new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000); }
function optionalExpiry(value: unknown) {
    if (!value) return null;
    const expiry = new Date(String(value));
    if (Number.isNaN(expiry.getTime())) throw new Error('BAD_REQUEST: Thời hạn không hợp lệ');
    return expiry;
}

type ChallengeInput = { installationId: string; deviceContext: unknown; extension?: unknown; userAgent?: unknown };
type DeviceProof = { challengeId: string; nonce: string; timestamp: number; signature: string };

export class XoyLicenseService {
    async createLicense(input: { name: string; telegramId?: string; plan?: 'BASIC' | 'FULL'; maxFingerprints?: number; expiresAt?: string | null; trialDays?: number }) {
        const name = requiredText(input.name, 'Tên khách');
        const plan = input.plan === 'FULL' ? 'FULL' : 'BASIC';
        if (input.trialDays !== undefined && Number(input.trialDays) !== TRIAL_DAYS) throw new Error('BAD_REQUEST: Chỉ hỗ trợ gói dùng thử 7 ngày');
        const expiresAt = Number(input.trialDays) === TRIAL_DAYS ? trialExpiresAt() : optionalExpiry(input.expiresAt);
        const licenseKey = `XOY-${crypto.randomBytes(18).toString('base64url').toUpperCase()}`;
        const license = await prisma.xoyLicense.create({ data: {
            name, telegramId: optionalText(input.telegramId, 100), keyPrefix: licenseKey.slice(0, 12), keyHash: hash(licenseKey), keyEncrypted: encryptKey(licenseKey),
            plan, maxFingerprints: Math.max(1, Math.min(100, Number(input.maxFingerprints) || 3)), status: 'ISSUED', expiresAt,
        } });
        return { license: this.adminLicense(license), licenseKey };
    }
    private adminLicense(license: any) { return { id: license.id, name: license.name, telegramId: license.telegramId, keyPrefix: license.keyPrefix, keyAvailable: Boolean(license.keyEncrypted), plan: license.plan, maxFingerprints: license.maxFingerprints, status: license.status, expiresAt: license.expiresAt, createdAt: license.createdAt }; }
    async listLicenses() {
        const licenses = await prisma.xoyLicense.findMany({ orderBy: { createdAt: 'desc' }, include: { _count: { select: { devices: { where: { status: 'ACTIVE' } } } } } });
        return licenses.map((license) => ({ ...this.adminLicense(license), activeFingerprints: license._count.devices }));
    }
    async getLicenseKey(licenseId: string) {
        const license = await prisma.xoyLicense.findUnique({ where: { id: licenseId }, select: { keyEncrypted: true } });
        if (!license) throw new Error('NOT_FOUND: Không tìm thấy license');
        if (!license.keyEncrypted) throw new Error('LICENSE_KEY_UNAVAILABLE');
        return { licenseKey: decryptKey(license.keyEncrypted) };
    }
    async updateLicense(licenseId: string, input: { plan?: 'BASIC' | 'FULL'; maxFingerprints?: number; expiresAt?: string | null }) {
        const license = await prisma.xoyLicense.findUnique({ where: { id: licenseId } });
        if (!license) throw new Error('NOT_FOUND: Không tìm thấy license');

        const data: any = {};
        const auditChanges: Record<string, unknown> = {};
        if (input.plan !== undefined) {
            if (!['BASIC', 'FULL'].includes(input.plan)) throw new Error('BAD_REQUEST: Gói license không hợp lệ');
            data.plan = input.plan;
            if (license.plan !== input.plan) auditChanges.plan = { from: license.plan, to: input.plan };
        }
        if (input.maxFingerprints !== undefined) {
            const maxFingerprints = Number(input.maxFingerprints);
            if (!Number.isInteger(maxFingerprints) || maxFingerprints < 1 || maxFingerprints > 100) {
                throw new Error('BAD_REQUEST: Số thiết bị phải từ 1 đến 100');
            }
            await this.expireInactiveDevices(licenseId);
            const activeDevices = await prisma.xoyDevice.count({ where: { licenseId, status: 'ACTIVE' } });
            if (maxFingerprints < activeDevices) {
                throw new Error(`BAD_REQUEST: License đang có ${activeDevices} thiết bị active. Thu hồi thiết bị trước khi giảm giới hạn.`);
            }
            data.maxFingerprints = maxFingerprints;
            if (license.maxFingerprints !== maxFingerprints) auditChanges.maxFingerprints = { from: license.maxFingerprints, to: maxFingerprints };
        }
        if (Object.prototype.hasOwnProperty.call(input, 'expiresAt')) {
            const rawExpiry = input.expiresAt;
            let expiresAt: Date | null = null;
            if (rawExpiry) {
                expiresAt = new Date(rawExpiry);
                if (Number.isNaN(expiresAt.getTime())) throw new Error('BAD_REQUEST: Thời hạn không hợp lệ');
            }
            data.expiresAt = expiresAt;
            const previous = license.expiresAt?.toISOString() || null;
            const next = expiresAt?.toISOString() || null;
            if (previous !== next) auditChanges.expiresAt = { from: previous, to: next };
        }
        if (Object.keys(data).length === 0) return this.adminLicense(license);
        const updated = await prisma.xoyLicense.update({ where: { id: licenseId }, data });
        if (Object.keys(auditChanges).length) await this.audit(licenseId, 'LICENSE_UPDATED', auditChanges);
        return this.adminLicense(updated);
    }
    private async audit(licenseId: string, eventType: string, details: unknown, deviceId?: string) { await prisma.xoyDeviceAudit.create({ data: { licenseId, deviceId, eventType, details: details as any } }); }
    private async expireInactiveDevices(licenseId: string) {
        const threshold = new Date(Date.now() - INACTIVE_DEVICE_DAYS * 24 * 60 * 60 * 1000);
        await prisma.xoyDevice.updateMany({ where: { licenseId, status: 'ACTIVE', lastSeenAt: { lt: threshold } }, data: { status: 'INACTIVE' } });
    }
    private deviceAccessToken(deviceId: string, sessionId: string, licenseId: string) { return jwt.sign({ scope: 'xoy-device', deviceId, sessionId, licenseId }, secret(), { expiresIn: DEVICE_TOKEN_TTL }); }
    private async entitlement(licenseId: string) {
        const license = await prisma.xoyLicense.findUnique({ where: { id: licenseId } });
        if (!license) throw new Error('LICENSE_UNAVAILABLE');
        ensureUsableLicense(license);
        return { licenseName: license.name, plan: license.plan, maxFingerprints: license.maxFingerprints, expiresAt: license.expiresAt?.toISOString() || null, features: featuresFor(license.plan) };
    }
    private async upsertProfileSession(deviceId: string, installationId: string, publicKey: any, keyHash: string) {
        const existing = await prisma.xoyDeviceSession.findUnique({ where: { installationId } });
        if (existing) {
            const keyChanged = Boolean(existing.publicKeyHash && existing.publicKeyHash !== keyHash);
            const session = await prisma.xoyDeviceSession.update({ where: { id: existing.id }, data: { deviceId, publicKey, publicKeyHash: keyHash, revokedAt: null, lastSeenAt: new Date() } });
            return { session, keyChanged };
        }
        return { session: await prisma.xoyDeviceSession.create({ data: { deviceId, installationId, publicKey, publicKeyHash: keyHash } }), keyChanged: false };
    }
    private async issueDeviceSession(device: any, session: any) {
        const refreshToken = newRefreshToken();
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        const now = new Date();
        const updatedSession = await prisma.xoyDeviceSession.update({ where: { id: session.id }, data: { deviceId: device.id, refreshTokenHash: hash(refreshToken), refreshExpiresAt, lastSeenAt: now, revokedAt: null } });
        await prisma.xoyDevice.update({ where: { id: device.id }, data: { status: 'ACTIVE', lastSeenAt: now, revokedAt: null } });
        return { accessToken: this.deviceAccessToken(device.id, updatedSession.id, device.licenseId), refreshToken, refreshExpiresAt: refreshExpiresAt.toISOString(), entitlement: await this.entitlement(device.licenseId) };
    }
    private metadata(input: ChallengeInput) {
        const deviceContext = normalizeDeviceContext(input.deviceContext);
        return { deviceContext, deviceHash: deviceHash(deviceContext), extensionMetadata: normalizeExtension(input.extension), userAgent: optionalText(input.userAgent, MAX_USER_AGENT_LENGTH) };
    }
    private async createChallenge(data: { licenseId: string; sessionId?: string; purpose: 'ACTIVATE' | 'REFRESH'; installationId: string; deviceHash: string; deviceContext: any; publicKey: any; extensionMetadata: any; userAgent: string | null }) {
        const nonce = crypto.randomBytes(32).toString('base64url');
        const challenge = await prisma.xoyDeviceChallenge.create({ data: {
            licenseId: data.licenseId, sessionId: data.sessionId, purpose: data.purpose, installationId: data.installationId, nonceHash: hash(nonce), deviceHash: data.deviceHash,
            deviceContext: data.deviceContext, publicKey: data.publicKey, publicKeyHash: publicKeyHash(data.publicKey), extensionMetadata: data.extensionMetadata, userAgent: data.userAgent, expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
        } });
        return { challengeId: challenge.id, nonce, expiresAt: challenge.expiresAt.toISOString() };
    }
    async createActivationChallenge(input: ChallengeInput & { licenseKey: string; devicePublicKey: unknown }) {
        const license = await prisma.xoyLicense.findUnique({ where: { keyHash: hash(requiredText(input.licenseKey, 'License key', 500)) } });
        if (!license) throw new Error('LICENSE_INVALID');
        ensureUsableLicense(license);
        const installationId = requiredText(input.installationId, 'Installation ID', 255);
        const data = this.metadata(input);
        return this.createChallenge({ licenseId: license.id, purpose: 'ACTIVATE', installationId, ...data, publicKey: normalizePublicKey(input.devicePublicKey) });
    }
    async createRefreshChallenge(input: ChallengeInput & { refreshToken: string }) {
        const installationId = requiredText(input.installationId, 'Installation ID', 255);
        const session = await prisma.xoyDeviceSession.findFirst({ where: { installationId, refreshTokenHash: hash(requiredText(input.refreshToken, 'Refresh token', 1_000)), revokedAt: null }, include: { device: { include: { license: true } } } });
        if (!session || !session.refreshExpiresAt || session.refreshExpiresAt.getTime() <= Date.now() || session.device.status !== 'ACTIVE') throw new Error('SESSION_INVALID');
        ensureUsableLicense(session.device.license);
        const data = this.metadata(input);
        if (data.deviceHash !== session.device.deviceHash) {
            await this.audit(session.device.licenseId, 'DEVICE_CONTEXT_CHANGED', { received: data.deviceContext }, session.deviceId);
            throw new Error('DEVICE_CONTEXT_CHANGED');
        }
        if (!session.publicKey) throw new Error('SESSION_INVALID');
        return this.createChallenge({ licenseId: session.device.licenseId, sessionId: session.id, purpose: 'REFRESH', installationId, ...data, publicKey: session.publicKey });
    }
    private async consumeChallenge(input: { installationId: string; deviceProof: DeviceProof }, purpose: 'ACTIVATE' | 'REFRESH') {
        const installationId = requiredText(input.installationId, 'Installation ID', 255);
        const proof = input.deviceProof || {} as DeviceProof;
        const challengeId = requiredText(proof.challengeId, 'Challenge ID', 255);
        const nonce = requiredText(proof.nonce, 'Challenge nonce', 255);
        const timestamp = Number(proof.timestamp);
        const signature = requiredText(proof.signature, 'Device proof', 1_000);
        const challenge = await prisma.xoyDeviceChallenge.findUnique({ where: { id: challengeId }, include: { license: true } });
        if (!challenge || challenge.purpose !== purpose || challenge.installationId !== installationId || challenge.nonceHash !== hash(nonce)) throw new Error('INVALID_DEVICE_PROOF');
        if (challenge.usedAt) throw new Error('CHALLENGE_REPLAYED');
        // The client timestamp is part of the signed payload, but must not be
        // used as a clock check: Windows VPS instances can drift substantially
        // from the server clock. The server-issued, one-time challenge already
        // provides the replay boundary through its expiry and atomic usedAt
        // update, independent of the client's wall clock.
        if (challenge.expiresAt.getTime() <= Date.now() || !Number.isFinite(timestamp)) {
            await this.audit(challenge.licenseId, 'DEVICE_PROOF_FAILED', { reason: 'expired', purpose });
            throw new Error('CHALLENGE_EXPIRED');
        }
        let verified = false;
        try { verified = crypto.verify('sha256', Buffer.from(proofPayload({ challengeId, nonce, installationId, timestamp })), { key: challenge.publicKey as any, format: 'jwk', dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')); } catch (_) { verified = false; }
        if (!verified) {
            await this.audit(challenge.licenseId, 'DEVICE_PROOF_FAILED', { reason: 'signature', purpose });
            throw new Error('INVALID_DEVICE_PROOF');
        }
        const consumed = await prisma.xoyDeviceChallenge.updateMany({ where: { id: challenge.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
        if (consumed.count !== 1) throw new Error('CHALLENGE_REPLAYED');
        ensureUsableLicense(challenge.license);
        return challenge;
    }
    async activate(input: { installationId: string; deviceProof: DeviceProof }) {
        const challenge = await this.consumeChallenge(input, 'ACTIVATE');
        await this.expireInactiveDevices(challenge.licenseId);
        let device = await prisma.xoyDevice.findUnique({ where: { licenseId_deviceHash: { licenseId: challenge.licenseId, deviceHash: challenge.deviceHash } } });
        const metadata: any = { deviceContext: challenge.deviceContext, extensionMetadata: challenge.extensionMetadata, userAgent: challenge.userAgent };
        if (!device) {
            const activeCount = await prisma.xoyDevice.count({ where: { licenseId: challenge.licenseId, status: 'ACTIVE' } });
            if (activeCount >= challenge.license.maxFingerprints) throw new Error('DEVICE_LIMIT_REACHED');
            device = await prisma.xoyDevice.create({ data: { licenseId: challenge.licenseId, deviceHash: challenge.deviceHash, ...metadata } });
        } else {
            if (device.status !== 'ACTIVE') {
                const activeCount = await prisma.xoyDevice.count({ where: { licenseId: challenge.licenseId, status: 'ACTIVE' } });
                if (activeCount >= challenge.license.maxFingerprints) throw new Error('DEVICE_LIMIT_REACHED');
                if (device.status === 'REVOKED') await this.audit(challenge.licenseId, 'DEVICE_REACTIVATED', { previousStatus: 'REVOKED' }, device.id);
            }
            if (canonicalJson(device.deviceContext) !== canonicalJson(challenge.deviceContext)) await this.audit(challenge.licenseId, 'DEVICE_CONTEXT_UPDATED', { deviceContext: challenge.deviceContext }, device.id);
            device = await prisma.xoyDevice.update({ where: { id: device.id }, data: { ...metadata, status: 'ACTIVE', lastSeenAt: new Date(), revokedAt: null } });
        }
        if (challenge.license.status === 'ISSUED') await prisma.xoyLicense.update({ where: { id: challenge.license.id }, data: { status: 'ACTIVE' } });
        const profile = await this.upsertProfileSession(device.id, challenge.installationId, challenge.publicKey, challenge.publicKeyHash);
        if (profile.keyChanged) await this.audit(challenge.licenseId, 'PROFILE_PUBLIC_KEY_UPDATED', { publicKeyHash: challenge.publicKeyHash }, device.id);
        return this.issueDeviceSession(device, profile.session);
    }
    async refresh(input: { installationId: string; deviceProof: DeviceProof }) {
        const challenge = await this.consumeChallenge(input, 'REFRESH');
        if (!challenge.sessionId) throw new Error('SESSION_INVALID');
        const session = await prisma.xoyDeviceSession.findUnique({ where: { id: challenge.sessionId }, include: { device: { include: { license: true } } } });
        if (!session || session.revokedAt || session.device.status !== 'ACTIVE') throw new Error('SESSION_INVALID');
        ensureUsableLicense(session.device.license);
        return this.issueDeviceSession(session.device, session);
    }
    private async currentDevice(deviceId: string, sessionId?: string) {
        const session = await prisma.xoyDeviceSession.findFirst({ where: { ...(sessionId ? { id: sessionId } : {}), deviceId, revokedAt: null }, include: { device: { include: { license: true } } } });
        if (!session || session.device.status !== 'ACTIVE') throw new Error('SESSION_INVALID');
        ensureUsableLicense(session.device.license);
        return session;
    }
    async heartbeat(deviceId: string, sessionId?: string) {
        const session = await this.currentDevice(deviceId, sessionId);
        const now = new Date();
        await prisma.$transaction([prisma.xoyDeviceSession.update({ where: { id: session.id }, data: { lastSeenAt: now } }), prisma.xoyDevice.update({ where: { id: deviceId }, data: { lastSeenAt: now } })]);
        return this.entitlement(session.device.licenseId);
    }
    async listDevices(licenseId: string) {
        await this.expireInactiveDevices(licenseId);
        return prisma.xoyDevice.findMany({ where: { licenseId }, orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }], select: { id: true, deviceContext: true, extensionMetadata: true, userAgent: true, status: true, firstSeenAt: true, lastSeenAt: true, revokedAt: true, sessions: { where: { revokedAt: null }, select: { id: true, installationId: true, firstSeenAt: true, lastSeenAt: true } } } });
    }
    async listDeviceAudits(licenseId: string) { return prisma.xoyDeviceAudit.findMany({ where: { licenseId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, deviceId: true, eventType: true, details: true, createdAt: true } }); }
    async revokeDevice(licenseId: string, deviceId: string) {
        const device = await prisma.xoyDevice.findFirst({ where: { id: deviceId, licenseId } });
        if (!device) throw new Error('NOT_FOUND: Không tìm thấy thiết bị');
        const now = new Date();
        await prisma.$transaction([prisma.xoyDevice.update({ where: { id: device.id }, data: { status: 'REVOKED', revokedAt: now } }), prisma.xoyDeviceSession.updateMany({ where: { deviceId: device.id, revokedAt: null }, data: { revokedAt: now, refreshTokenHash: null, refreshExpiresAt: null } })]);
        await this.audit(licenseId, 'DEVICE_REVOKED', {}, device.id);
    }
    async revokeAllDevices(licenseId: string) {
        const license = await prisma.xoyLicense.findUnique({ where: { id: licenseId }, select: { id: true } });
        if (!license) throw new Error('NOT_FOUND: Không tìm thấy license');
        const now = new Date();
        const [devices] = await prisma.$transaction([
            prisma.xoyDevice.updateMany({ where: { licenseId, status: { not: 'REVOKED' } }, data: { status: 'REVOKED', revokedAt: now } }),
            prisma.xoyDeviceSession.updateMany({ where: { device: { licenseId }, revokedAt: null }, data: { revokedAt: now, refreshTokenHash: null, refreshExpiresAt: null } }),
        ]);
        await this.audit(licenseId, 'LICENSE_ALL_DEVICES_REVOKED', { deviceCount: devices.count });
        return { revokedDevices: devices.count };
    }
    async revokeLicensePermanently(licenseId: string) {
        const license = await prisma.xoyLicense.findUnique({ where: { id: licenseId }, select: { id: true, status: true } });
        if (!license) throw new Error('NOT_FOUND: Không tìm thấy license');
        const now = new Date();
        const [, devices] = await prisma.$transaction([
            prisma.xoyLicense.update({ where: { id: licenseId }, data: { status: 'REVOKED' } }),
            prisma.xoyDevice.updateMany({ where: { licenseId, status: { not: 'REVOKED' } }, data: { status: 'REVOKED', revokedAt: now } }),
            prisma.xoyDeviceSession.updateMany({ where: { device: { licenseId }, revokedAt: null }, data: { revokedAt: now, refreshTokenHash: null, refreshExpiresAt: null } }),
        ]);
        await this.audit(licenseId, 'LICENSE_PERMANENTLY_REVOKED', { previousStatus: license.status, revokedDevices: devices.count });
        return { status: 'REVOKED', revokedDevices: devices.count };
    }
    async getEntitlement(deviceId: string, sessionId?: string) { return this.entitlement((await this.currentDevice(deviceId, sessionId)).device.licenseId); }
}

export const xoyLicenseService = new XoyLicenseService();
