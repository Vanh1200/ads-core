import { describe, expect, it } from 'vitest';
import { prismaMock } from '../../../__tests__/setup';
import { XoyLicenseService } from '../XoyLicenseService';

const activeLicense = {
    id: 'license-1', name: 'Khách A', telegramId: '@khacha', keyPrefix: 'XOY-TEST', keyHash: 'hash', keyEncrypted: 'key',
    plan: 'BASIC', maxFingerprints: 3, status: 'ACTIVE', expiresAt: null, createdAt: new Date(), updatedAt: new Date(),
};

describe('XoyLicenseService', () => {
    it('creates an issued Basic license without any customer password or email', async () => {
        prismaMock.xoyLicense.create.mockImplementation((({ data }: any) => ({ id: 'license-1', createdAt: new Date(), updatedAt: new Date(), ...data }) as any) as any);
        const result = await new XoyLicenseService().createLicense({ name: 'Khách A', telegramId: '@khacha', plan: 'BASIC', maxFingerprints: 3, expiresAt: null });

        expect(result.licenseKey).toMatch(/^XOY-/);
        expect(result.license.status).toBe('ISSUED');
        expect(result.license.plan).toBe('BASIC');
        expect(prismaMock.xoyLicense.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.not.objectContaining({ managerEmail: expect.anything(), managerPasswordHash: expect.anything() }) }));
    });

    it('reuses the same fingerprint without consuming another slot and creates a profile session', async () => {
        const device = { ...activeLicense, id: 'device-1', licenseId: 'license-1', fingerprint: 'xoy_soft_same', status: 'ACTIVE' };
        prismaMock.xoyLicense.findUnique.mockResolvedValue(activeLicense as any);
        prismaMock.xoyDevice.findUnique.mockResolvedValue(device as any);
        prismaMock.xoyDevice.update.mockResolvedValue(device as any);
        prismaMock.xoyDeviceSession.findUnique.mockResolvedValue(null);
        prismaMock.xoyDeviceSession.create.mockResolvedValue({ id: 'session-2', deviceId: 'device-1', installationId: 'profile-2' } as any);
        prismaMock.xoyDeviceSession.update.mockResolvedValue({ id: 'session-2' } as any);

        const result = await new XoyLicenseService().activate({
            licenseKey: 'XOY-TEST', installationId: 'profile-2', fingerprint: 'xoy_soft_same',
            fingerprintSignals: { os: 'mac', arch: 'arm64', naclArch: 'arm', hardwareConcurrency: 10, deviceMemory: 16, webglVendor: 'Apple', webglRenderer: 'Apple M5' },
            extension: { id: 'extension-id', name: 'XOY ADS', version: '1.7.4', manifestVersion: 3 }, userAgent: 'Chrome test',
        });

        expect(prismaMock.xoyDevice.count).not.toHaveBeenCalled();
        expect(result.entitlement.features).toEqual(expect.objectContaining({ appeal: true, verify: true, reactivate: true, backupCampaign: false, backupPerformance: false, rename: false }));
        expect(prismaMock.xoyDeviceSession.create).toHaveBeenCalledWith({ data: { deviceId: 'device-1', installationId: 'profile-2' } });
        expect(prismaMock.xoyDevice.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ fingerprintSignals: expect.objectContaining({ os: 'mac', deviceMemory: 16 }), userAgent: 'Chrome test' }) }));
    });
});
