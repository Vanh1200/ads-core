import crypto from 'crypto';
import http from 'http';
import { AddressInfo } from 'net';
import express from 'express';
import jwt from 'jsonwebtoken';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import router from '../xoy.routes';
import { errorHandler } from '../../../infrastructure/middleware/errorHandler';
import { xoyLicenseService } from '../../../application/services/XoyLicenseService';

const signingKeys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const recipient = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).publicKey.export({ format: 'jwk' });
const secret = 'runtime-config-route-test';
const entitlement = { features: { appeal: true, backupCampaign: false } };
let server: http.Server;
let baseUrl: string;
const originalSecret = process.env.XOY_JWT_SECRET;

function accessToken(licenseId = 'legacy-license') {
    return jwt.sign({ scope: 'xoy-device', deviceId: 'device-a', sessionId: 'session-a', licenseId }, secret, { expiresIn: '15m' });
}
function requestBody(token: string) {
    const request = {
        extensionVersion: '2.1.0', requestId: crypto.randomUUID(),
        encryptionPublicKey: { kty: recipient.kty!, crv: recipient.crv!, x: recipient.x!, y: recipient.y! },
    };
    const payload = ['XOY-RUNTIME-CONFIG-V2', 'POST', '/api/xoy/runtime-config/v2',
        crypto.createHash('sha256').update(token).digest('base64url'), request.extensionVersion,
        request.requestId, JSON.stringify(request.encryptionPublicKey)].join('\n');
    return { ...request, signature: crypto.sign('sha256', Buffer.from(payload), { key: signingKeys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
}

beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/xoy', router);
    app.use(errorHandler);
    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/xoy`;
});
beforeEach(() => {
    process.env.XOY_JWT_SECRET = secret;
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(xoyLicenseService, 'getEntitlement').mockResolvedValue(entitlement as any);
    vi.spyOn(xoyLicenseService, 'getRuntimeConfigContext').mockResolvedValue({
        deviceId: 'device-a', sessionId: 'session-a', publicKey: signingKeys.publicKey.export({ format: 'jwk' }), entitlement,
    } as any);
});
afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    if (originalSecret === undefined) delete process.env.XOY_JWT_SECRET;
    else process.env.XOY_JWT_SECRET = originalSecret;
});

describe('runtime config HTTP compatibility and authorization', () => {
    it('keeps the v1 endpoint and its plaintext schema available for delivered licenses', async () => {
        const response = await fetch(`${baseUrl}/runtime-config`, { headers: { Authorization: `Bearer ${accessToken()}`, 'X-XOY-Extension-Version': '1.7.9' } });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        const config: any = await response.json();
        expect(config.schemaVersion).toBe(1);
        expect(config.extensionVersion).toBe('1.7.9');
        expect(config.rpc.appealList.path).toContain('/_/rpc/');
    });

    it('returns ciphertext only on v2 for a valid signed request', async () => {
        const token = accessToken();
        const response = await fetch(`${baseUrl}/runtime-config/v2`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody(token)) });
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('no-store');
        const envelope: any = await response.json();
        expect(envelope.schemaVersion).toBe(2);
        expect(envelope.ciphertext).toEqual(expect.any(String));
        expect(envelope).not.toHaveProperty('rpc');
        expect(envelope).not.toHaveProperty('features');
    });

    it('rejects a bearer token alone without the registered device signature', async () => {
        const token = accessToken();
        const body = requestBody(token);
        body.signature = crypto.randomBytes(64).toString('base64url');
        const response = await fetch(`${baseUrl}/runtime-config/v2`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        expect(response.status).toBe(400);
        expect(await response.json()).toHaveProperty('code', 'INVALID_DEVICE_PROOF');
    });

    it('rejects unauthenticated and currently revoked sessions', async () => {
        const unauthenticated = await fetch(`${baseUrl}/runtime-config/v2`, { method: 'POST' });
        expect(unauthenticated.status).toBe(401);
        vi.mocked(xoyLicenseService.getRuntimeConfigContext).mockRejectedValueOnce(new Error('SESSION_INVALID'));
        const token = accessToken();
        const response = await fetch(`${baseUrl}/runtime-config/v2`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(requestBody(token)) });
        expect(response.status).toBe(401);
        expect(await response.json()).toHaveProperty('code', 'SESSION_INVALID');
    });

    it('keeps v1 available to new licenses with either extension version', async () => {
        for (const version of ['1.7.9', '2.1.0']) {
            const response = await fetch(`${baseUrl}/runtime-config`, { headers: {
                Authorization: `Bearer ${accessToken('community-license')}`, 'X-XOY-Extension-Version': version,
            } });
            expect(response.status).toBe(200);
            const config: any = await response.json();
            expect(config.schemaVersion).toBe(1);
            expect(config.extensionVersion).toBe(version);
        }
    });
});
