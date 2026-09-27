import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import prisma from '../../infrastructure/database/prisma';

const DEVICE_TOKEN_TTL = '15m';
const REFRESH_TOKEN_DAYS = 90;
const INACTIVE_DEVICE_DAYS = 45;

function secret() {
    return process.env.XOY_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production';
}

function hash(value: string) {
    return crypto.createHmac('sha256', process.env.XOY_LICENSE_PEPPER || secret())
        .update(value.trim())
        .digest('hex');
}

function newRefreshToken() {
    return crypto.randomBytes(48).toString('base64url');
}

function ensureActiveLicense(license: any) {
    if (license.status !== 'ACTIVE') throw new Error('LICENSE_UNAVAILABLE');
    if (license.expiresAt && license.expiresAt.getTime() <= Date.now()) throw new Error('LICENSE_UNAVAILABLE');
}

export class XoyLicenseService {
    async createLicense(input: { name: string; managerEmail: string; managerPassword: string; maxDevices?: number; expiresAt?: string | null }) {
        if (!input.name || !input.managerEmail || !input.managerPassword) throw new Error('BAD_REQUEST: Name, manager email and password are required');
        const licenseKey = `XOY-${crypto.randomBytes(18).toString('base64url').toUpperCase()}`;
        const prefix = licenseKey.slice(0, 12);
        const license = await prisma.xoyLicense.create({
            data: {
                name: input.name.trim(),
                keyPrefix: prefix,
                keyHash: hash(licenseKey),
                managerEmail: input.managerEmail.trim().toLowerCase(),
                managerPasswordHash: await bcrypt.hash(input.managerPassword, 12),
                maxDevices: Math.max(1, Math.min(100, Number(input.maxDevices) || 3)),
                expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
            },
        });
        // This is the only time the raw key is available from the database flow.
        return { license: { id: license.id, name: license.name, keyPrefix: license.keyPrefix, maxDevices: license.maxDevices, expiresAt: license.expiresAt }, licenseKey };
    }

    async listLicenses() {
        return prisma.xoyLicense.findMany({
            orderBy: { createdAt: 'desc' },
            select: { id: true, name: true, keyPrefix: true, managerEmail: true, maxDevices: true, status: true, expiresAt: true, createdAt: true, _count: { select: { devices: { where: { status: 'ACTIVE' } } } } },
        });
    }

    private async expireInactiveDevices(licenseId: string) {
        const threshold = new Date(Date.now() - INACTIVE_DEVICE_DAYS * 24 * 60 * 60 * 1000);
        await prisma.xoyDevice.updateMany({
            where: { licenseId, status: 'ACTIVE', lastSeenAt: { lt: threshold } },
            data: { status: 'INACTIVE', refreshTokenHash: null, refreshExpiresAt: null },
        });
    }

    private deviceAccessToken(device: any) {
        return jwt.sign({ scope: 'xoy-device', deviceId: device.id, licenseId: device.licenseId }, secret(), { expiresIn: DEVICE_TOKEN_TTL });
    }

    private async issueDeviceSession(device: any) {
        const refreshToken = newRefreshToken();
        const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 24 * 60 * 60 * 1000);
        const updated = await prisma.xoyDevice.update({
            where: { id: device.id },
            data: { status: 'ACTIVE', lastSeenAt: new Date(), refreshTokenHash: hash(refreshToken), refreshExpiresAt, revokedAt: null },
        });
        return {
            accessToken: this.deviceAccessToken(updated),
            refreshToken,
            refreshExpiresAt: refreshExpiresAt.toISOString(),
            entitlement: await this.entitlement(updated.licenseId),
        };
    }

    private async entitlement(licenseId: string) {
        const license = await prisma.xoyLicense.findUnique({ where: { id: licenseId } });
        if (!license) throw new Error('LICENSE_UNAVAILABLE');
        ensureActiveLicense(license);
        return {
            licenseName: license.name,
            maxDevices: license.maxDevices,
            expiresAt: license.expiresAt?.toISOString() || null,
            features: { all: true },
        };
    }

    async activate(input: { licenseKey: string; installationId: string; displayName?: string; extensionVersion?: string }) {
        if (!input.licenseKey || !input.installationId) throw new Error('BAD_REQUEST: License key and installation ID are required');
        const license = await prisma.xoyLicense.findUnique({ where: { keyHash: hash(input.licenseKey) } });
        if (!license) throw new Error('LICENSE_INVALID');
        ensureActiveLicense(license);
        await this.expireInactiveDevices(license.id);

        const existing = await prisma.xoyDevice.findUnique({
            where: { licenseId_installationId: { licenseId: license.id, installationId: input.installationId } },
        });
        // An active installation keeps its existing slot. A previously revoked
        // or inactive installation may be activated again only after a slot is
        // available; update that row rather than attempting a duplicate insert.
        if (existing?.status === 'ACTIVE') {
            await prisma.xoyDevice.update({ where: { id: existing.id }, data: { displayName: input.displayName || existing.displayName, extensionVersion: input.extensionVersion } });
            return this.issueDeviceSession(existing);
        }

        const activeCount = await prisma.xoyDevice.count({ where: { licenseId: license.id, status: 'ACTIVE' } });
        if (activeCount >= license.maxDevices) throw new Error('DEVICE_LIMIT_REACHED');

        const device = existing
            ? await prisma.xoyDevice.update({
                where: { id: existing.id },
                data: { displayName: input.displayName || existing.displayName, extensionVersion: input.extensionVersion, status: 'ACTIVE', revokedAt: null },
            })
            : await prisma.xoyDevice.create({
                data: { licenseId: license.id, installationId: input.installationId, displayName: input.displayName || 'Chrome profile', extensionVersion: input.extensionVersion },
            });
        return this.issueDeviceSession(device);
    }

    async refresh(input: { installationId: string; refreshToken: string }) {
        const device = await prisma.xoyDevice.findFirst({
            where: { installationId: input.installationId, refreshTokenHash: hash(input.refreshToken), status: 'ACTIVE' },
            include: { license: true },
        });
        if (!device || !device.refreshExpiresAt || device.refreshExpiresAt.getTime() <= Date.now()) throw new Error('SESSION_INVALID');
        ensureActiveLicense(device.license);
        return this.issueDeviceSession(device);
    }

    async heartbeat(deviceId: string) {
        const device = await prisma.xoyDevice.findUnique({ where: { id: deviceId }, include: { license: true } });
        if (!device || device.status !== 'ACTIVE') throw new Error('SESSION_INVALID');
        ensureActiveLicense(device.license);
        await prisma.xoyDevice.update({ where: { id: deviceId }, data: { lastSeenAt: new Date() } });
        return this.entitlement(device.licenseId);
    }

    async managerLogin(email: string, password: string) {
        const license = await prisma.xoyLicense.findUnique({ where: { managerEmail: email.trim().toLowerCase() } });
        if (!license || !(await bcrypt.compare(password, license.managerPasswordHash))) throw new Error('MANAGER_LOGIN_INVALID');
        ensureActiveLicense(license);
        return { token: jwt.sign({ scope: 'xoy-manager', licenseId: license.id }, secret(), { expiresIn: '15m' }) };
    }

    async listDevices(licenseId: string) {
        await this.expireInactiveDevices(licenseId);
        return prisma.xoyDevice.findMany({
            where: { licenseId },
            orderBy: [{ status: 'asc' }, { lastSeenAt: 'desc' }],
            select: { id: true, displayName: true, extensionVersion: true, status: true, firstSeenAt: true, lastSeenAt: true },
        });
    }

    async revokeDevice(licenseId: string, deviceId: string) {
        const device = await prisma.xoyDevice.findFirst({ where: { id: deviceId, licenseId } });
        if (!device) throw new Error('NOT_FOUND: Device not found');
        await prisma.xoyDevice.update({ where: { id: device.id }, data: { status: 'REVOKED', revokedAt: new Date(), refreshTokenHash: null, refreshExpiresAt: null } });
    }

    async getEntitlement(deviceId: string) {
        const device = await prisma.xoyDevice.findUnique({ where: { id: deviceId }, include: { license: true } });
        if (!device || device.status !== 'ACTIVE') throw new Error('SESSION_INVALID');
        ensureActiveLicense(device.license);
        return this.entitlement(device.licenseId);
    }
}

export const xoyLicenseService = new XoyLicenseService();
