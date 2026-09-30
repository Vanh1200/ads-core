import { afterEach, describe, expect, it } from 'vitest';
import { XoyRuntimeConfigService } from '../XoyRuntimeConfigService';

const originalEnvironment = { ...process.env };

afterEach(() => {
    process.env = { ...originalEnvironment };
});

describe('XoyRuntimeConfigService', () => {
    it('returns version-bound protocol data filtered by licensed features', () => {
        process.env.XOY_DISABLED_FEATURES = 'rename';
        const config = new XoyRuntimeConfigService().create({ features: { appeal: true, rename: true } }, '1.7.9');

        expect(config.schemaVersion).toBe(1);
        expect(config.features).toEqual({ appeal: true, rename: false });
        expect(config.extensionVersion).toBe('1.7.9');
        expect(config.rpc.appealSubmit.path).toContain('/_/rpc/');
        expect(config.protocol.tagToCategory[61]).toBe(8);
        expect(config).not.toHaveProperty('expiresAt');
    });

    it('rejects an extension older than the configured minimum version', () => {
        process.env.XOY_MIN_EXTENSION_VERSION = '1.8.0';
        expect(() => new XoyRuntimeConfigService().create({ features: {} }, '1.7.9'))
            .toThrow('EXTENSION_UPDATE_REQUIRED:1.8.0');
    });
});
