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

    it('parses nested user profile payloads used by newer kilo responses', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        data: {
                            user: {
                                id: 'acct_nested',
                                name: 'Nested User',
                                email: 'nested@example.com',
                            },
                            organizations: [
                                {
                                    id: 'org_nested',
                                    name: 'Nested Org',
                                    is_active: true,
                                },
                            ],
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
        const result = await client.getProfile({ accessToken: 'token' });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected nested kilo profile payload to parse.');
        }

        expect(result.value).toMatchObject({
            accountId: 'acct_nested',
            displayName: 'Nested User',
            emailMasked: 'nested@example.com',
            organizations: [
                {
                    organizationId: 'org_nested',
                    name: 'Nested Org',
                    isActive: true,
                },
            ],
        });
    });

    it('prefers masked and root identity fields over nested raw aliases', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        data: {
                            id: 'acct_root',
                            displayName: 'Root Display',
                            emailMasked: 'r***@example.com',
                            user: {
                                id: 'acct_nested',
                                name: 'Nested User',
                                displayName: 'Nested Display',
                                email: 'nested@example.com',
                                emailMasked: 'n***@example.com',
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
        const result = await client.getProfile({ accessToken: 'token' });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected mixed kilo profile payload to parse.');
        }

        expect(result.value).toMatchObject({
            accountId: 'acct_root',
            displayName: 'Root Display',
            emailMasked: 'r***@example.com',
        });
    });

    it('dedupes duplicate model ids while keeping the last payload data', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        data: [
                            {
                                id: 'kilo/auto',
                                name: 'Kilo Auto Free',
                                owned_by: 'openai',
                                supported_parameters: [],
                                architecture: {
                                    input_modalities: ['text'],
                                    output_modalities: ['text'],
                                },
                            },
                            {
                                id: 'kilo/auto',
                                name: 'Kilo Auto Free',
                                owned_by: 'anthropic',
                                supported_parameters: ['reasoning'],
                                architecture: {
                                    input_modalities: ['text'],
                                    output_modalities: ['text'],
                                },
                            },
                        ],
                    }),
                })
            )
        );

        const client = new KiloGatewayClient({
            gatewayBaseUrl: 'https://gateway.test',
            apiBaseUrl: 'https://api.test',
            timeoutMs: 100,
        });
        const result = await client.getModels();

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected duplicate kilo models payload to parse.');
        }

        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toMatchObject({
            id: 'kilo/auto',
            upstreamProvider: 'anthropic',
            supportedParameters: ['reasoning'],
        });
    });
});
