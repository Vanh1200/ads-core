import crypto from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prismaMock } from '../../../__tests__/setup';
import { XoyLicenseService } from '../XoyLicenseService';

const license = { id: 'license-1', name: 'Khách A', telegramId: null, keyPrefix: 'XOY-TEST', keyHash: 'hash', keyEncrypted: 'key', plan: 'BASIC', maxFingerprints: 1, status: 'ACTIVE', expiresAt: null, createdAt: new Date(), updatedAt: new Date() };
const context = { os: 'mac', architecture: 'arm64', naclArchitecture: 'arm', logicalCpuCount: 10, memoryGiB: 16, webglVendor: 'Apple', webglRenderer: 'M5', canvasToken: 'canvas-a', webglProfile: {}, browserArchitecture: 'arm', browserBitness: '64', browserPlatform: 'macOS' };

function deviceKey() {
    return crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
}
function proofFor(privateKey: crypto.KeyObject, challengeId = 'challenge-1', nonce = 'nonce-1', installationId = 'profile-1', timestamp = Date.now()) {
    const payload = ['XOY-DEVICE-PROOF-V1', challengeId, nonce, installationId, String(timestamp)].join('\n');
    return { challengeId, nonce, timestamp, signature: crypto.sign('sha256', Buffer.from(payload), { key: privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
}
function nonceHash(nonce: string) { return crypto.createHmac('sha256', process.env.XOY_LICENSE_PEPPER || process.env.XOY_JWT_SECRET || process.env.JWT_SECRET || 'change-me-in-production').update(nonce).digest('hex'); }
function challenge(privateKey: crypto.KeyObject, overrides: any = {}) {
    const publicKey = privateKey.asymmetricKeyType ? crypto.createPublicKey(privateKey).export({ format: 'jwk' }) : {};
    return { id: 'challenge-1', licenseId: license.id, sessionId: null, purpose: 'ACTIVATE', installationId: 'profile-1', nonceHash: nonceHash('nonce-1'), deviceHash: 'internal-server-hash', deviceContext: context, publicKey, publicKeyHash: 'key-hash', extensionMetadata: {}, userAgent: 'Chrome', expiresAt: new Date(Date.now() + 60_000), usedAt: null, createdAt: new Date(), license, ...overrides };
}

beforeEach(() => { process.env.XOY_LICENSE_PEPPER = 'xoy-test-pepper'; });

describe('XoyLicenseService device proof protocol', () => {
    it('rejects a replayed nonce', async () => {
        const keys = deviceKey();
        prismaMock.xoyDeviceChallenge.findUnique.mockResolvedValue(challenge(keys.privateKey, { usedAt: new Date() }) as any);
        await expect(new XoyLicenseService().activate({ installationId: 'profile-1', deviceProof: proofFor(keys.privateKey) })).rejects.toThrow('CHALLENGE_REPLAYED');
    });

    it('logs and rejects an invalid device signature', async () => {
        const keys = deviceKey();
        prismaMock.xoyDeviceChallenge.findUnique.mockResolvedValue(challenge(keys.privateKey) as any);
        const badProof = proofFor(deviceKey().privateKey);
        await expect(new XoyLicenseService().activate({ installationId: 'profile-1', deviceProof: badProof })).rejects.toThrow('INVALID_DEVICE_PROOF');
        expect(prismaMock.xoyDeviceAudit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'DEVICE_PROOF_FAILED' }) }));
    });

    it('reactivates a revoked device when the slot is free', async () => {
        const keys = deviceKey();
        prismaMock.xoyDeviceChallenge.findUnique.mockResolvedValue(challenge(keys.privateKey) as any);
        prismaMock.xoyDeviceChallenge.updateMany.mockResolvedValue({ count: 1 } as any);
        prismaMock.xoyDevice.updateMany.mockResolvedValue({ count: 0 } as any);
        prismaMock.xoyDevice.findUnique.mockResolvedValue({ id: 'device-a', licenseId: license.id, deviceHash: 'internal-server-hash', deviceContext: context, publicKeyHash: 'old-key', status: 'REVOKED' } as any);
        prismaMock.xoyDevice.count.mockResolvedValue(0 as any);
        prismaMock.xoyDevice.update.mockResolvedValue({ id: 'device-a', licenseId: license.id, status: 'ACTIVE' } as any);
        prismaMock.xoyDeviceSession.findUnique.mockResolvedValue(null);
        prismaMock.xoyDeviceSession.create.mockResolvedValue({ id: 'session-a', deviceId: 'device-a' } as any);
        prismaMock.xoyDeviceSession.update.mockResolvedValue({ id: 'session-a' } as any);
        prismaMock.xoyLicense.findUnique.mockResolvedValue(license as any);

        await new XoyLicenseService().activate({ installationId: 'profile-1', deviceProof: proofFor(keys.privateKey) });
        expect(prismaMock.xoyDevice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ACTIVE', revokedAt: null }) }));
        expect(prismaMock.xoyDeviceAudit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'DEVICE_REACTIVATED' }) }));
    });

    it('does not create a new device when another machine has consumed the final slot', async () => {
        const keys = deviceKey();
        prismaMock.xoyDeviceChallenge.findUnique.mockResolvedValue(challenge(keys.privateKey) as any);
        prismaMock.xoyDeviceChallenge.updateMany.mockResolvedValue({ count: 1 } as any);
        prismaMock.xoyDevice.updateMany.mockResolvedValue({ count: 0 } as any);
        prismaMock.xoyDevice.findUnique.mockResolvedValue(null);
        prismaMock.xoyDevice.count.mockResolvedValue(1 as any);
        await expect(new XoyLicenseService().activate({ installationId: 'profile-1', deviceProof: proofFor(keys.privateKey) })).rejects.toThrow('DEVICE_LIMIT_REACHED');
        expect(prismaMock.xoyDevice.create).not.toHaveBeenCalled();
    });

    it('rejects a refresh when the device context belongs to another machine', async () => {
        prismaMock.xoyDeviceSession.findFirst.mockResolvedValue({ id: 'session-a', deviceId: 'device-a', refreshExpiresAt: new Date(Date.now() + 60_000), publicKey: { kty: 'EC' }, device: { licenseId: license.id, deviceHash: 'stored-hash', status: 'ACTIVE', license } } as any);
        await expect(new XoyLicenseService().createRefreshChallenge({ installationId: 'profile-1', refreshToken: 'token', deviceContext: context })).rejects.toThrow('DEVICE_CONTEXT_CHANGED');
        expect(prismaMock.xoyDeviceAudit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'DEVICE_CONTEXT_CHANGED' }) }));
    });

    it('updates the commercial plan, device limit and expiry while retaining active devices', async () => {
        prismaMock.xoyLicense.findUnique.mockResolvedValue(license as any);
        prismaMock.xoyDevice.updateMany.mockResolvedValue({ count: 0 } as any);
        prismaMock.xoyDevice.count.mockResolvedValue(1 as any);
        const updated = { ...license, plan: 'FULL', maxFingerprints: 4, expiresAt: new Date('2030-06-01') };
        prismaMock.xoyLicense.update.mockResolvedValue(updated as any);

        const result = await new XoyLicenseService().updateLicense(license.id, { plan: 'FULL', maxFingerprints: 4, expiresAt: '2030-06-01' });
        expect(result.plan).toBe('FULL');
        expect(prismaMock.xoyLicense.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ plan: 'FULL', maxFingerprints: 4 }) }));
        expect(prismaMock.xoyDeviceAudit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'LICENSE_UPDATED' }) }));
    });

    it('does not permit lowering the limit below active devices', async () => {
        prismaMock.xoyLicense.findUnique.mockResolvedValue({ ...license, maxFingerprints: 3 } as any);
        prismaMock.xoyDevice.updateMany.mockResolvedValue({ count: 0 } as any);
        prismaMock.xoyDevice.count.mockResolvedValue(2 as any);

        await expect(new XoyLicenseService().updateLicense(license.id, { maxFingerprints: 1 })).rejects.toThrow('đang có 2 thiết bị active');
        expect(prismaMock.xoyLicense.update).not.toHaveBeenCalled();
    });

    it('revokes every device session while retaining the license for later activation', async () => {
        prismaMock.xoyLicense.findUnique.mockResolvedValue({ id: license.id } as any);
        prismaMock.$transaction.mockResolvedValue([{ count: 2 }, { count: 4 }] as any);

        await expect(new XoyLicenseService().revokeAllDevices(license.id)).resolves.toEqual({ revokedDevices: 2 });
        expect(prismaMock.xoyDevice.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ licenseId: license.id }) }));
        expect(prismaMock.xoyDeviceSession.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ refreshTokenHash: null }) }));
        expect(prismaMock.xoyDeviceAudit.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: 'LICENSE_ALL_DEVICES_REVOKED' }) }));
    });
});
