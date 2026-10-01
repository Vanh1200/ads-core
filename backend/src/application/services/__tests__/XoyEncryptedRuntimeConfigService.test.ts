import crypto from 'crypto';
import { describe, expect, it } from 'vitest';
import { XoyEncryptedRuntimeConfigService } from '../XoyEncryptedRuntimeConfigService';

// Web Crypto independently decodes the wire format used by the Node encoder.
// Keep server tests runnable without requiring a sibling extension checkout.
async function clientFixture() {
    const keys = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const encryptionKeys = await crypto.webcrypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, false, ['deriveBits']);
    const token = `header.${Buffer.from(JSON.stringify({ scope: 'xoy-device', deviceId: 'device-a', sessionId: 'session-a' })).toString('base64url')}.signature`;
    const subtle = crypto.webcrypto.subtle;
    const codec = {
        async createRequest(accessToken: string, extensionVersion: string) {
            const exported = await subtle.exportKey('jwk', encryptionKeys.publicKey);
            const encryptionPublicKey = { kty: exported.kty!, crv: exported.crv!, x: exported.x!, y: exported.y! };
            const requestId = crypto.randomUUID();
            const payload = ['XOY-RUNTIME-CONFIG-V2', 'POST', '/api/xoy/runtime-config/v2',
                crypto.createHash('sha256').update(accessToken).digest('base64url'), extensionVersion, requestId, JSON.stringify(encryptionPublicKey)].join('\n');
            return { extensionVersion, requestId, encryptionPublicKey,
                signature: crypto.sign('sha256', Buffer.from(payload), { key: keys.privateKey, dsaEncoding: 'ieee-p1363' }).toString('base64url') };
        },
        async decrypt(envelope: any, options: { token: string; extensionVersion: string; requestId?: string }) {
            const binding = JSON.parse(Buffer.from(options.token.split('.')[1], 'base64url').toString());
            const exported = await subtle.exportKey('jwk', encryptionKeys.publicKey);
            const ownPublicKey = { kty: exported.kty!, crv: exported.crv!, x: exported.x!, y: exported.y! };
            const keyId = crypto.createHash('sha256').update(JSON.stringify(ownPublicKey)).digest('base64url');
            if (envelope.deviceId !== binding.deviceId || envelope.sessionId !== binding.sessionId || envelope.keyId !== keyId
                || envelope.extensionVersion !== options.extensionVersion || (options.requestId && envelope.requestId !== options.requestId)) throw new Error('Binding mismatch');
            const { ciphertext, ...header } = envelope;
            const aad = Buffer.from(JSON.stringify(header));
            const peer = await subtle.importKey('jwk', envelope.serverPublicKey, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
            const shared = await subtle.deriveBits({ name: 'ECDH', public: peer }, encryptionKeys.privateKey, 256);
            const baseKey = await subtle.importKey('raw', shared, 'HKDF', false, ['deriveKey']);
            const key = await subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: Buffer.from(envelope.salt, 'base64url'), info: aad }, baseKey, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
            const plaintext = await subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(envelope.iv, 'base64url'), additionalData: aad }, key, Buffer.from(ciphertext, 'base64url'));
            return JSON.parse(Buffer.from(plaintext).toString());
        },
    };
    const context = { deviceId: 'device-a', sessionId: 'session-a', publicKey: keys.publicKey.export({ format: 'jwk' }), entitlement: { features: { appeal: true, rename: true } } };
    const request = await codec.createRequest(token, '2.1.0');
    return { codec, context, token, request, encryptionKeys };
}

describe('runtime config v2 encryption', () => {
    it('round-trips through Web Crypto with unchanged Google config', async () => {
        const { codec, context, token, request, encryptionKeys } = await clientFixture();
        const envelope = new XoyEncryptedRuntimeConfigService().create(context, token, request);
        expect(envelope.schemaVersion).toBe(2);
        expect(envelope).not.toHaveProperty('rpc');
        expect(envelope).not.toHaveProperty('protocol');
        expect(JSON.stringify(envelope)).not.toContain('/_/rpc/');
        expect(JSON.stringify(envelope)).not.toContain('tagToCategory');
        const config = await codec.decrypt(envelope, { token, extensionVersion: '2.1.0', requestId: request.requestId });
        expect(config.schemaVersion).toBe(1);
        expect(config.protocol.tagToCategory[236]).toBe(5);
        expect(config.rpc.appealPreflightSignals.buildVersion).not.toBe(config.rpc.appealSubmitSignals.buildVersion);
        expect(config.features).toEqual(context.entitlement.features);
        expect(encryptionKeys.privateKey.extractable).toBe(false);
        await expect(crypto.webcrypto.subtle.exportKey('jwk', encryptionKeys.privateKey)).rejects.toThrow();
    });

    it('uses a fresh encryption key, salt and IV for each response', async () => {
        const { context, token, request } = await clientFixture();
        const service = new XoyEncryptedRuntimeConfigService();
        const first = service.create(context, token, request);
        const second = service.create(context, token, request);
        expect(first.serverPublicKey).not.toEqual(second.serverPublicKey);
        expect(first.salt).not.toBe(second.salt);
        expect(first.iv).not.toBe(second.iv);
        expect(first.ciphertext).not.toBe(second.ciphertext);
    });

    it('binds the recipient key and extension version to the device signature and access token', async () => {
        const { context, token, request } = await clientFixture();
        const other = await clientFixture();
        const service = new XoyEncryptedRuntimeConfigService();
        for (const input of [
            { ...request, extensionVersion: '2.1.1' },
            { ...request, requestId: crypto.randomUUID() },
            { ...request, encryptionPublicKey: other.request.encryptionPublicKey },
            { ...request, signature: other.request.signature },
        ]) expect(() => service.create(context, token, input)).toThrow('INVALID_DEVICE_PROOF');
        expect(() => service.create(context, token + 'other', request)).toThrow('INVALID_DEVICE_PROOF');
    });

    it('rejects private key material, unexpected fields and malformed requests', async () => {
        const { context, token, request } = await clientFixture();
        const service = new XoyEncryptedRuntimeConfigService();
        expect(() => service.create(context, token, { ...request, encryptionPublicKey: { ...request.encryptionPublicKey, d: 'private' } })).toThrow();
        expect(() => service.create(context, token, { ...request, extra: 'field' })).toThrow();
        expect(() => service.create(context, token, { ...request, signature: 'bad' })).toThrow();
    });

    it('rejects altered ciphertext or authenticated metadata', async () => {
        const { codec, context, token, request } = await clientFixture();
        const envelope = new XoyEncryptedRuntimeConfigService().create(context, token, request);
        const options = { token, extensionVersion: '2.1.0' };
        for (const tampered of [
            { ...envelope, ciphertext: (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1) },
            { ...envelope, issuedAt: '2026-01-01T00:00:00.000Z' },
            { ...envelope, iv: crypto.randomBytes(12).toString('base64url') },
            { ...envelope, salt: crypto.randomBytes(32).toString('base64url') },
        ]) await expect(codec.decrypt(tampered, options)).rejects.toThrow();
        await expect(codec.decrypt(envelope, { ...options, requestId: crypto.randomUUID() })).rejects.toThrow();
        await expect(codec.decrypt(envelope, { ...options, extensionVersion: '2.1.1' })).rejects.toThrow();
    });

    it('rejects a different device/profile/session while allowing access-token rotation in one session', async () => {
        const { codec, context, token, request } = await clientFixture();
        const envelope = new XoyEncryptedRuntimeConfigService().create(context, token, request);
        const other = await clientFixture();
        await expect(other.codec.decrypt(envelope, { token, extensionVersion: '2.1.0' })).rejects.toThrow();
        const rotatedToken = token.replace('.signature', '.rotated');
        await expect(codec.decrypt(envelope, { token: rotatedToken, extensionVersion: '2.1.0' })).resolves.toHaveProperty('schemaVersion', 1);
        const newSessionToken = `header.${Buffer.from(JSON.stringify({ scope: 'xoy-device', deviceId: 'device-a', sessionId: 'session-b' })).toString('base64url')}.signature`;
        await expect(codec.decrypt(envelope, { token: newSessionToken, extensionVersion: '2.1.0' })).rejects.toThrow();
    });
});
