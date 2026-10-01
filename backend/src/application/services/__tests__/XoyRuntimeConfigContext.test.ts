import { describe, expect, it } from 'vitest';
import { prismaMock } from '../../../__tests__/setup';
import { XoyLicenseService } from '../XoyLicenseService';

const license = { id: 'license-a', name: 'Basic', plan: 'BASIC', status: 'ACTIVE', expiresAt: null, maxFingerprints: 1 };
const session = { id: 'session-a', deviceId: 'device-a', publicKey: { kty: 'EC', crv: 'P-256', x: 'x', y: 'y' }, device: { licenseId: 'license-a', status: 'ACTIVE', license } };

describe('runtime config context uses the current registered profile', () => {
    it('loads the session-owned public key and current license entitlement', async () => {
        prismaMock.xoyDeviceSession.findFirst.mockResolvedValue(session as any);
        prismaMock.xoyLicense.findUnique.mockResolvedValue(license as any);
        const context = await new XoyLicenseService().getRuntimeConfigContext('device-a', 'session-a');
        expect(prismaMock.xoyDeviceSession.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'session-a', deviceId: 'device-a', revokedAt: null } }));
        expect(context.publicKey).toEqual(session.publicKey);
        expect(context.entitlement.features.appeal).toBe(true);
        expect(context.entitlement.features.backupCampaign).toBe(false);
    });

    it('requires a session ID and a registered signing key', async () => {
        const service = new XoyLicenseService();
        await expect(service.getRuntimeConfigContext('device-a', '')).rejects.toThrow('SESSION_INVALID');
        expect(prismaMock.xoyDeviceSession.findFirst).not.toHaveBeenCalled();
        prismaMock.xoyDeviceSession.findFirst.mockResolvedValue({ ...session, publicKey: null } as any);
        await expect(service.getRuntimeConfigContext('device-a', 'session-a')).rejects.toThrow('SESSION_INVALID');
    });

    it('rejects revoked devices and expired licenses even with an existing session', async () => {
        const service = new XoyLicenseService();
        prismaMock.xoyDeviceSession.findFirst.mockResolvedValue({ ...session, device: { ...session.device, status: 'REVOKED' } } as any);
        await expect(service.getRuntimeConfigContext('device-a', 'session-a')).rejects.toThrow('SESSION_INVALID');
        prismaMock.xoyDeviceSession.findFirst.mockResolvedValue({ ...session, device: { ...session.device, license: { ...license, expiresAt: new Date(0) } } } as any);
        await expect(service.getRuntimeConfigContext('device-a', 'session-a')).rejects.toThrow('LICENSE_UNAVAILABLE');
    });
});
