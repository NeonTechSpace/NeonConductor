import { afterEach, describe, expect, it, vi } from 'vitest';

import { KiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient/client';

describe('KiloGatewayClient', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns a network Result error when the request fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() => {
                throw new Error('network down');
            })
        );

        const client = new KiloGatewayClient({
            gatewayBaseUrl: 'https://gateway.test',
            apiBaseUrl: 'https://api.test',
            timeoutMs: 100,
        });
        const result = await client.getModels();

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected gateway request to fail.');
        }

        expect(result.error).toMatchObject({
            code: 'network_error',
            category: 'network',
            endpoint: 'https://gateway.test/models',
            message: 'network down',
        });
    });

    it('returns a schema Result error when the payload parser rejects the response', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        data: {},
                    }),
                })
            )
        );

        const client = new KiloGatewayClient({
            gatewayBaseUrl: 'https://gateway.test',
            apiBaseUrl: 'https://api.test',
            timeoutMs: 100,
        });
        const result = await client.createDeviceCode();

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected invalid device-auth payload to fail.');
        }

        expect(result.error).toMatchObject({
            code: 'schema_error',
            category: 'schema',
            endpoint: '/api/device-auth/codes',
        });
        expect(result.error.message).toContain('missing required fields');
    });

    it('accepts nested device-auth payload aliases used by newer kilo responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        result: {
                            deviceAuth: {
                                deviceCode: 'device-code-123',
                                userCode: 'USER-CODE-123',
                                verificationUrl: 'https://kilo.example/verify',
                                poll_interval_seconds: 7,
                                expiresIn: 600,
                            },
                        },
                    }),
                })
            )
        );

        const client = new KiloGatewayClient({
            gatewayBaseUrl: 'https://gateway.test',
            apiBaseUrl: 'https://api.test',
            timeoutMs: 100,
        });
        const result = await client.createDeviceCode();

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected aliased device-auth payload to parse.');
        }

        expect(result.value).toMatchObject({
            code: 'device-code-123',
            userCode: 'USER-CODE-123',
            verificationUri: 'https://kilo.example/verify',
            pollIntervalSeconds: 7,
        });
    });
});
