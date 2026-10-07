import crypto from 'crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { prismaMock } from '../../../__tests__/setup';
import { XoyLicenseService } from '../XoyLicenseService';

beforeEach(() => { process.env.XOY_LICENSE_PEPPER = 'recovery-test-pepper'; });

async function fixture() {
    prismaMock.xoyDeviceChallenge.create.mockClear();
    const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const publicKey = keys.publicKey.export({ format: 'jwk' });
    const license = { id: 'license', status: 'ACTIVE', plan: 'BASIC', expiresAt: null };
    const deviceContext = { os: 'mac', architecture: 'arm64', logicalCpuCount: 10, memoryGiB: 16 };
    const service = new XoyLicenseService();
    prismaMock.xoyLicense.findUnique.mockResolvedValue(license as any);
    prismaMock.xoyDeviceChallenge.create.mockResolvedValue({ id: 'challenge', expiresAt: new Date(Date.now() + 60_000) } as any);
    // Get the actual normalized context/key through the existing activation protocol.
    await service.createActivationChallenge({ installationId: 'profile', licenseKey: 'license-key', deviceContext, devicePublicKey: publicKey });
    const metadata = prismaMock.xoyDeviceChallenge.create.mock.calls[0][0].data;
    prismaMock.xoyDeviceChallenge.create.mockClear();
    const session = { id: 'session', installationId: 'profile', deviceId: 'device', revokedAt: null,
        refreshTokenHash: 'current-token-hash', refreshExpiresAt: new Date(Date.now() + 90 * 86400_000),
        publicKey: metadata.publicKey, publicKeyHash: metadata.publicKeyHash,
        device: { id: 'device', status: 'ACTIVE', deviceHash: metadata.deviceHash, licenseId: 'license', license } };
    prismaMock.xoyDeviceSession.findFirst.mockResolvedValue(null);
    prismaMock.xoyDeviceSession.findUnique.mockResolvedValue(session as any);
    const request = { installationId: 'profile', refreshToken: 'obsolete', recoverSession: true, devicePublicKey: publicKey, deviceContext };
    return { service, keys, session, request, license };
}

async function recoveryProof(f: Awaited<ReturnType<typeof fixture>>) {
    const issued = await f.service.createRefreshChallenge(f.request);
    const data = prismaMock.xoyDeviceChallenge.create.mock.calls[0][0].data;
    prismaMock.xoyDeviceChallenge.findUnique.mockResolvedValue({ ...data, id: issued.challengeId, usedAt: null, license: f.license } as any);
    prismaMock.xoyDeviceChallenge.updateMany.mockResolvedValue({ count: 1 });
    const timestamp = Date.now();
    const payload = ['XOY-DEVICE-PROOF-V1', issued.challengeId, issued.nonce, 'profile', String(timestamp)].join('\n');
    return { installationId: 'profile', deviceProof: { challengeId: issued.challengeId, nonce: issued.nonce, timestamp,
        signature: crypto.sign('sha256', Buffer.from(payload), { key: f.keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') } };
}

describe('refresh recovery with a registered device key', () => {
    it('keeps normal refresh working with a matching token and registered signature', async () => {
        const f = await fixture();
        f.request.recoverSession = false;
        prismaMock.xoyDeviceSession.findFirst.mockResolvedValue(f.session as any);
        const proof = await recoveryProof(f);
        expect(prismaMock.xoyDeviceSession.findUnique).not.toHaveBeenCalled();
        prismaMock.xoyDeviceSession.update.mockResolvedValue(f.session as any);
        await expect(f.service.refresh(proof)).resolves.toHaveProperty('refreshToken');
    });

    it('issues only a challenge on token mismatch and issues tokens after verifying the registered signature', async () => {
        const f = await fixture();
        const proof = await recoveryProof(f);
        expect(prismaMock.xoyDeviceSession.update).not.toHaveBeenCalled();
        prismaMock.xoyDeviceSession.update.mockResolvedValue(f.session as any);
        await expect(f.service.refresh(proof)).resolves.toHaveProperty('refreshToken');
        expect(prismaMock.xoyDeviceSession.update).toHaveBeenCalledTimes(1);
    });

    it('does not fall back to profile lookup without an explicit recovery request', async () => {
        const f = await fixture();
        await expect(f.service.createRefreshChallenge({ ...f.request, recoverSession: false })).rejects.toThrow('SESSION_INVALID');
        expect(prismaMock.xoyDeviceSession.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a different profile key before issuing a challenge', async () => {
        const f = await fixture();
        const otherKey = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
        await expect(f.service.createRefreshChallenge({ ...f.request, devicePublicKey: otherKey })).rejects.toThrow('SESSION_INVALID');
        expect(prismaMock.xoyDeviceChallenge.create).not.toHaveBeenCalled();
    });

    it('rejects an expired, revoked, disabled or unknown profile', async () => {
        for (const update of [{ refreshExpiresAt: new Date(0) }, { revokedAt: new Date() }, { refreshTokenHash: null }, { publicKey: null }, { deviceStatus: 'REVOKED' }, { missing: true }]) {
            const f = await fixture();
            const { deviceStatus, missing, ...fields } = update as any;
            prismaMock.xoyDeviceSession.findUnique.mockResolvedValue(missing ? null : { ...f.session, ...fields,
                device: { ...f.session.device, status: deviceStatus || 'ACTIVE' } } as any);
            await expect(f.service.createRefreshChallenge(f.request)).rejects.toThrow('SESSION_INVALID');
            expect(prismaMock.xoyDeviceChallenge.create).not.toHaveBeenCalled();
        }
    });

    it('rejects changed device context and unavailable licenses', async () => {
        const f = await fixture();
        await expect(f.service.createRefreshChallenge({ ...f.request, deviceContext: { ...f.request.deviceContext, architecture: 'x64' } })).rejects.toThrow('DEVICE_CONTEXT_CHANGED');
        f.session.device.license.status = 'REVOKED';
        await expect(f.service.createRefreshChallenge(f.request)).rejects.toThrow('LICENSE_UNAVAILABLE');
        expect(prismaMock.xoyDeviceChallenge.create).not.toHaveBeenCalled();
    });

    it('rejects a forged signature without writing any new token', async () => {
        const f = await fixture();
        const proof = await recoveryProof(f);
        proof.deviceProof.signature = 'forged';
        await expect(f.service.refresh(proof)).rejects.toThrow('INVALID_DEVICE_PROOF');
        expect(prismaMock.xoyDeviceSession.update).not.toHaveBeenCalled();
    });

    it('rechecks revocation, expiry and key replacement after a challenge was issued', async () => {
        for (const update of [{ revokedAt: new Date() }, { refreshExpiresAt: new Date(0) }, { publicKey: { kty: 'EC', crv: 'P-256', x: 'changed', y: 'changed' } }]) {
            const f = await fixture();
            const proof = await recoveryProof(f);
            prismaMock.xoyDeviceSession.findUnique.mockResolvedValue({ ...f.session, ...update } as any);
            await expect(f.service.refresh(proof)).rejects.toThrow('SESSION_INVALID');
            expect(prismaMock.xoyDeviceSession.update).not.toHaveBeenCalled();
        }
    });
});
