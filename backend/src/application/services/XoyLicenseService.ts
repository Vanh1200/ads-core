import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../infrastructure/database/prisma';

const DEVICE_TOKEN_TTL = '15m';
const REFRESH_TOKEN_DAYS = 90;
const INACTIVE_DEVICE_DAYS = 45;
const MAX_FINGERPRINT_LENGTH = 160;
const MAX_USER_AGENT_LENGTH = 2_000;

function secret() { return process.env.XOY_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production'; }
function hash(value: string) { return crypto.createHmac('sha256', process.env.XOY_LICENSE_PEPPER || secret()).update(value.trim()).digest('hex'); }
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
function normalizeSignals(input: any) {
    const signals = input && typeof input === 'object' ? input : {};
    const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
    const textArray = (value: unknown, maxItems = 4) => Array.isArray(value)
        ? value.slice(0, maxItems).map((item) => number(item)).filter((item) => item !== null)
        : [];
    const webglCapabilities = signals.webglCapabilities && typeof signals.webglCapabilities === 'object' ? signals.webglCapabilities : {};
    return {
        os: optionalText(signals.os, 32), arch: optionalText(signals.arch, 32), naclArch: optionalText(signals.naclArch, 32),
        hardwareConcurrency: number(signals.hardwareConcurrency), deviceMemory: number(signals.deviceMemory),
        webglVendor: optionalText(signals.webglVendor, 255), webglRenderer: optionalText(signals.webglRenderer, 1_000),
        canvasFingerprint: optionalText(signals.canvasFingerprint, 64),
        webglCapabilities: {
            version: optionalText(webglCapabilities.version, 255),
            shadingLanguageVersion: optionalText(webglCapabilities.shadingLanguageVersion, 255),
            maxTextureSize: number(webglCapabilities.maxTextureSize),
            maxCubeMapTextureSize: number(webglCapabilities.maxCubeMapTextureSize),
            maxRenderbufferSize: number(webglCapabilities.maxRenderbufferSize),
            maxViewportDimensions: textArray(webglCapabilities.maxViewportDimensions, 2),
            extensionCount: number(webglCapabilities.extensionCount),
        },
        userAgentArchitecture: optionalText(signals.userAgentArchitecture, 64),
        userAgentBitness: optionalText(signals.userAgentBitness, 16),
        userAgentPlatform: optionalText(signals.userAgentPlatform, 64),
    };
}
function normalizeExtension(input: any) {
    const extension = input && typeof input === 'object' ? input : {};
    const manifestVersion = Number(extension.manifestVersion);
    return { id: optionalText(extension.id, 255), name: optionalText(extension.name, 255), version: optionalText(extension.version, 100), manifestVersion: Number.isInteger(manifestVersion) ? manifestVersion : null };
}
function featuresFor(plan: 'BASIC' | 'FULL') {
    const basic = plan === 'BASIC';
    return { appeal: true, verify: true, reactivate: true, rename: true, backupCampaign: !basic, backupPerformance: !basic };
}

export class XoyLicenseService {
    async createLicense(input: { name: string; telegramId?: string; plan?: 'BASIC' | 'FULL'; maxFingerprints?: number; expiresAt?: string | null }) {
        const name = requiredText(input.name, 'Tên khách');
        const plan = input.plan === 'FULL' ? 'FULL' : 'BASIC';
        const licenseKey = `XOY-${crypto.randomBytes(18).toString('base64url').toUpperCase()}`;
        const license = await prisma.xoyLicense.create({ data: {
            name, telegramId: optionalText(input.telegramId, 100), keyPrefix: licenseKey.slice(0, 12), keyHash: hash(licenseKey), keyEncrypted: encryptKey(licenseKey),
            plan, maxFingerprints: Math.max(1, Math.min(100, Number(input.maxFingerprints) || 3)), status: 'ISSUED', expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        } });
        return { license: this.adminLicense(license), licenseKey };
    }

    private adminLicense(license: any) {
        return { id: license.id, name: license.name, telegramId: license.telegramId, keyPrefix: license.keyPrefix, keyAvailable: Boolean(license.keyEncrypted), plan: license.plan, maxFingerprints: license.maxFingerprints, status: license.status, expiresAt: license.expiresAt, createdAt: license.createdAt };
    }

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

    private async expireInactiveDevices(licenseId: string) {
        const threshold = new Date(Date.now() - INACTIVE_DEVICE_DAYS * 24 * 60 * 60 * 1000);
        await prisma.xoyDevice.updateMany({ where: { licenseId, status: 'ACTIVE', lastSeenAt: { lt: threshold } }, data: { status: 'INACTIVE' } });
    }

    private deviceAccessToken(deviceId: string, sessionId: string, licenseId: string) {
        return jwt.sign({ scope: 'xoy-device', deviceId, sessionId, licenseId }, secret(), { expiresIn: DEVICE_TOKEN_TTL });
    }

    private async issueDeviceSession(device: any, session: any) {
        const refreshToken = newRefreshToken();
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        const now = new Date();
        const updatedSession = await prisma.xoyDeviceSession.update({ where: { id: session.id }, data: { deviceId: device.id, refreshTokenHash: hash(refreshToken), refreshExpiresAt, lastSeenAt: now, revokedAt: null } });
        await prisma.xoyDevice.update({ where: { id: device.id }, data: { status: 'ACTIVE', lastSeenAt: now, revokedAt: null } });
        return { accessToken: this.deviceAccessToken(device.id, updatedSession.id, device.licenseId), refreshToken, refreshExpiresAt: refreshExpiresAt.toISOString(), entitlement: await this.entitlement(device.licenseId) };
    }

    private async entitlement(licenseId: string) {
        const license = await prisma.xoyLicense.findUnique({ where: { id: licenseId } });
        if (!license) throw new Error('LICENSE_UNAVAILABLE');
        ensureUsableLicense(license);
        return { licenseName: license.name, plan: license.plan, maxFingerprints: license.maxFingerprints, expiresAt: license.expiresAt?.toISOString() || null, features: featuresFor(license.plan) };
    }

    private async upsertProfileSession(deviceId: string, installationId: string) {
        const existing = await prisma.xoyDeviceSession.findUnique({ where: { installationId } });
        if (existing) return prisma.xoyDeviceSession.update({ where: { id: existing.id }, data: { deviceId, revokedAt: null, lastSeenAt: new Date() } });
        return prisma.xoyDeviceSession.create({ data: { deviceId, installationId } });
    }

    private metadataData(input: any) {
        return { fingerprintSignals: normalizeSignals(input.fingerprintSignals), extensionMetadata: normalizeExtension(input.extension), userAgent: optionalText(input.userAgent, MAX_USER_AGENT_LENGTH) };
    }

    async activate(input: { licenseKey: string; installationId: string; fingerprint: string; fingerprintV2?: string; fingerprintSignals?: unknown; extension?: unknown; userAgent?: unknown }) {
        const licenseKey = requiredText(input.licenseKey, 'License key', 500);
        const installationId = requiredText(input.installationId, 'Installation ID', 255);
        const legacyFingerprint = requiredText(input.fingerprint, 'Fingerprint', MAX_FINGERPRINT_LENGTH);
        const fingerprint = optionalText(input.fingerprintV2, MAX_FINGERPRINT_LENGTH) || legacyFingerprint;
        const license = await prisma.xoyLicense.findUnique({ where: { keyHash: hash(licenseKey) } });
        if (!license) throw new Error('LICENSE_INVALID');
        ensureUsableLicense(license);
        await this.expireInactiveDevices(license.id);
        const metadata = this.metadataData(input);
        let device = await prisma.xoyDevice.findUnique({ where: { licenseId_fingerprint: { licenseId: license.id, fingerprint } } });
        // Fingerprint v2 adds stable rendering characteristics. A client that
        // proves its v1 fingerprint is allowed to upgrade the same physical
        // device record rather than consuming another licensed device slot.
        if (!device && legacyFingerprint !== fingerprint) {
            device = await prisma.xoyDevice.findUnique({ where: { licenseId_fingerprint: { licenseId: license.id, fingerprint: legacyFingerprint } } });
            if (device && device.status !== 'REVOKED') {
                device = await prisma.xoyDevice.update({ where: { id: device.id }, data: { fingerprint } });
            }
        }
        if (device?.status === 'REVOKED') throw new Error('DEVICE_REVOKED');
        if (!device) {
            const activeCount = await prisma.xoyDevice.count({ where: { licenseId: license.id, status: 'ACTIVE' } });
            if (activeCount >= license.maxFingerprints) throw new Error('DEVICE_LIMIT_REACHED');
            device = await prisma.xoyDevice.create({ data: { licenseId: license.id, fingerprint, ...metadata } });
        } else {
            if (device.status !== 'ACTIVE') {
                const activeCount = await prisma.xoyDevice.count({ where: { licenseId: license.id, status: 'ACTIVE' } });
                if (activeCount >= license.maxFingerprints) throw new Error('DEVICE_LIMIT_REACHED');
            }
            device = await prisma.xoyDevice.update({ where: { id: device.id }, data: { ...metadata, status: 'ACTIVE', lastSeenAt: new Date(), revokedAt: null } });
        }
        if (license.status === 'ISSUED') await prisma.xoyLicense.update({ where: { id: license.id }, data: { status: 'ACTIVE' } });
        return this.issueDeviceSession(device, await this.upsertProfileSession(device.id, installationId));
    }

    async refresh(input: { installationId: string; refreshToken: string; fingerprint: string; fingerprintV2?: string; fingerprintSignals?: unknown; extension?: unknown; userAgent?: unknown }) {
        const installationId = requiredText(input.installationId, 'Installation ID', 255);
        const legacyFingerprint = requiredText(input.fingerprint, 'Fingerprint', MAX_FINGERPRINT_LENGTH);
        const fingerprint = optionalText(input.fingerprintV2, MAX_FINGERPRINT_LENGTH) || legacyFingerprint;
        const session = await prisma.xoyDeviceSession.findFirst({ where: { installationId, refreshTokenHash: hash(requiredText(input.refreshToken, 'Refresh token', 1_000)), revokedAt: null }, include: { device: { include: { license: true } } } });
        if (!session || !session.refreshExpiresAt || session.refreshExpiresAt.getTime() <= Date.now()) throw new Error('SESSION_INVALID');
        ensureUsableLicense(session.device.license);
        if (session.device.status !== 'ACTIVE') throw new Error('SESSION_INVALID');
        let device: any = session.device;
        if (device.fingerprint !== fingerprint) {
            if (device.fingerprint === legacyFingerprint) {
                device = await prisma.xoyDevice.update({ where: { id: device.id }, data: { fingerprint } });
            } else {
            // Existing installs from the installationId-era are migrated on
            // their first refresh, without asking the customer to paste a key.
            if (!device.fingerprint.startsWith('legacy:')) throw new Error('FINGERPRINT_CHANGED');
            const matchingDevice = await prisma.xoyDevice.findUnique({ where: { licenseId_fingerprint: { licenseId: device.licenseId, fingerprint } } });
            if (matchingDevice?.status === 'REVOKED') throw new Error('DEVICE_REVOKED');
            if (matchingDevice) {
                device = matchingDevice;
                await prisma.xoyDevice.update({ where: { id: session.deviceId }, data: { status: 'INACTIVE' } });
            } else {
                device = await prisma.xoyDevice.update({ where: { id: device.id }, data: { fingerprint } });
            }
            }
        }
        device = await prisma.xoyDevice.update({ where: { id: device.id }, data: { ...this.metadataData(input), lastSeenAt: new Date() } });
        return this.issueDeviceSession(device, session);
    }

    private async currentDevice(deviceId: string, sessionId?: string) {
        // Tokens issued before the fingerprint/session migration lack
        // sessionId. Keep them usable until their short access-token lifetime
        // ends, then their normal refresh migrates to the new token shape.
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
        return prisma.xoyDevice.findMany({ where: { licenseId }, orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }], select: { id: true, fingerprint: true, fingerprintSignals: true, extensionMetadata: true, userAgent: true, status: true, firstSeenAt: true, lastSeenAt: true, revokedAt: true, sessions: { where: { revokedAt: null }, select: { id: true, installationId: true, firstSeenAt: true, lastSeenAt: true } } } });
    }

    async revokeDevice(licenseId: string, deviceId: string) {
        const device = await prisma.xoyDevice.findFirst({ where: { id: deviceId, licenseId } });
        if (!device) throw new Error('NOT_FOUND: Không tìm thấy fingerprint');
        const now = new Date();
        await prisma.$transaction([prisma.xoyDevice.update({ where: { id: device.id }, data: { status: 'REVOKED', revokedAt: now } }), prisma.xoyDeviceSession.updateMany({ where: { deviceId: device.id, revokedAt: null }, data: { revokedAt: now, refreshTokenHash: null, refreshExpiresAt: null } })]);
    }

    async getEntitlement(deviceId: string, sessionId?: string) { return this.entitlement((await this.currentDevice(deviceId, sessionId)).device.licenseId); }
}

export const xoyLicenseService = new XoyLicenseService();
