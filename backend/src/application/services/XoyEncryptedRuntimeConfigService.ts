import crypto from 'crypto';
import { z } from 'zod';
import { xoyRuntimeConfigService } from './XoyRuntimeConfigService';

const DOMAIN = 'XOY-RUNTIME-CONFIG-V2';
const ALGORITHM = 'ECDH-P256-HKDF-SHA256-A256GCM';
const coordinate = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const requestSchema = z.object({
    extensionVersion: z.string().regex(/^\d+\.\d+\.\d+(?:\.\d+)?$/).max(40),
    requestId: z.string().uuid(),
    encryptionPublicKey: z.object({ kty: z.literal('EC'), crv: z.literal('P-256'), x: coordinate, y: coordinate }).strict(),
    signature: z.string().regex(/^[A-Za-z0-9_-]{86}$/),
}).strict();

type ConfigContext = { deviceId: string; sessionId: string; publicKey: any; entitlement: any };

// Fixed serialization is shared with the Web Crypto client, including field order.
function proofPayload(token: string, request: z.infer<typeof requestSchema>) {
    const tokenHash = crypto.createHash('sha256').update(token).digest('base64url');
    return [DOMAIN, 'POST', '/api/xoy/runtime-config/v2', tokenHash, request.extensionVersion,
        request.requestId, JSON.stringify(request.encryptionPublicKey)].join('\n');
}

export class XoyEncryptedRuntimeConfigService {
    create(context: ConfigContext, token: string, input: unknown) {
        const parsed = requestSchema.parse(input);
        // Normalize property order: JSON input may have been serialized differently.
        const request = { ...parsed, encryptionPublicKey: {
            kty: parsed.encryptionPublicKey.kty, crv: parsed.encryptionPublicKey.crv,
            x: parsed.encryptionPublicKey.x, y: parsed.encryptionPublicKey.y,
        } };
        let verified = false;
        try {
            verified = crypto.verify('sha256', Buffer.from(proofPayload(token, request)),
                { key: context.publicKey, format: 'jwk', dsaEncoding: 'ieee-p1363' },
                Buffer.from(request.signature, 'base64url'));
        } catch (_) { /* never reveal signature or key details */ }
        if (!verified) throw new Error('INVALID_DEVICE_PROOF');

        let recipient: crypto.KeyObject;
        try { recipient = crypto.createPublicKey({ key: request.encryptionPublicKey, format: 'jwk' }); }
        catch (_) { throw new Error('BAD_REQUEST: Invalid config encryption key'); }
        const config = xoyRuntimeConfigService.create(context.entitlement, request.extensionVersion);
        const ephemeral = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
        const exported = ephemeral.publicKey.export({ format: 'jwk' });
        const envelope = {
            schemaVersion: 2,
            algorithm: ALGORITHM,
            requestId: request.requestId,
            extensionVersion: request.extensionVersion,
            deviceId: context.deviceId,
            sessionId: context.sessionId,
            keyId: crypto.createHash('sha256').update(JSON.stringify(request.encryptionPublicKey)).digest('base64url'),
            issuedAt: new Date().toISOString(),
            serverPublicKey: { kty: exported.kty!, crv: exported.crv!, x: exported.x!, y: exported.y! },
            salt: crypto.randomBytes(32).toString('base64url'),
            iv: crypto.randomBytes(12).toString('base64url'),
        };
        const aad = Buffer.from(JSON.stringify(envelope));
        const shared = crypto.diffieHellman({ privateKey: ephemeral.privateKey, publicKey: recipient });
        const key = Buffer.from(crypto.hkdfSync('sha256', shared, Buffer.from(envelope.salt, 'base64url'), aad, 32));
        const cipher = crypto.createCipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64url'));
        cipher.setAAD(aad);
        const ciphertext = Buffer.concat([cipher.update(JSON.stringify(config), 'utf8'), cipher.final(), cipher.getAuthTag()]);
        // Only envelope metadata and ciphertext leave this service. No shared key
        // is returned or persisted, and every response uses a fresh server key/IV.
        return { ...envelope, ciphertext: ciphertext.toString('base64url') };
    }
}

export const xoyEncryptedRuntimeConfigService = new XoyEncryptedRuntimeConfigService();
