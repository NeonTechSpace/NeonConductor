import { afterEach, describe, expect, it, vi } from 'vitest';

import { syncKiloCatalog } from '@/app/backend/providers/adapters/kilo/catalog';

function stubDiscoveryFetch(
    modelsPayload: unknown,
    providersPayload: unknown = { data: [] },
    modelsByProviderPayload: unknown = { data: [] }
) {
    vi.stubGlobal(
        'fetch',
        vi.fn((url: string) => {
            if (url.endsWith('/models')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => modelsPayload,
                });
            }

            if (url.endsWith('/providers')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => providersPayload,
                });
            }

            if (url.endsWith('/models-by-provider')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => modelsByProviderPayload,
                });
            }

            return Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not Found',
                json: () => ({}),
            });
        })
    );
}

describe('syncKiloCatalog', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('returns sync_failed when every discovered model is rejected during runtime classification', async () => {
        stubDiscoveryFetch({
            data: [
                {
                    id: 'minimax/minimax-native',
                    name: 'MiniMax Native',
                    owned_by: 'minimax',
                    supported_parameters: ['tools'],
                    architecture: {
                        input_modalities: ['text'],
                        output_modalities: ['text'],
                    },
                    provider_native_id: 'minimax_openai_compat',
                    pricing: {},
                },
            ],
        });

        const result = await syncKiloCatalog({
            profileId: 'profile_test',
            authMethod: 'api_key',
            apiKey: 'kilo-token',
        });

        expect(result).toMatchObject({
            ok: false,
            reason: 'sync_failed',
        });
        if (result.ok) {
            throw new Error('Expected Kilo sync to fail when every model is rejected.');
        }
        expect(result.detail).toContain('rejected every discovered model');
    });

    it('keeps accepted models and records rejected-model diagnostics in discovery payloads', async () => {
        stubDiscoveryFetch(
            {
                data: [
                    {
                        id: 'minimax/minimax-m2.5:free',
                        name: 'MiniMax M2.5',
                        owned_by: 'minimax',
                        supported_parameters: ['tools'],
                        architecture: {
                            input_modalities: ['text'],
                            output_modalities: ['text'],
                        },
                        pricing: {},
                    },
                    {
                        id: 'provider/native-only',
                        name: 'Provider Native Only',
                        supported_parameters: ['tools'],
                        architecture: {
                            input_modalities: ['text'],
                            output_modalities: ['text'],
                        },
                        provider_native_id: 'native_only',
                        pricing: {},
                    },
                ],
            },
            { data: [{ id: 'minimax', label: 'MiniMax' }] },
            { data: [{ provider: 'minimax', models: ['minimax/minimax-m2.5:free'] }] }
        );

        const result = await syncKiloCatalog({
            profileId: 'profile_test',
            authMethod: 'api_key',
            apiKey: 'kilo-token',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error(result.detail ?? 'Expected Kilo sync to succeed.');
        }

        expect(result.models).toHaveLength(1);
        expect(result.models[0]?.modelId).toBe('minimax/minimax-m2.5:free');
        expect(result.providerPayload['rejectedModels']).toEqual([
            expect.objectContaining({
                modelId: 'provider/native-only',
                reason: 'provider_native',
            }),
        ]);
        expect(result.modelPayload['rejectedModels']).toEqual([
            expect.objectContaining({
                modelId: 'provider/native-only',
                reason: 'provider_native',
            }),
        ]);
    });
});
