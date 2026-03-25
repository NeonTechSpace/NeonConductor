import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { resetPersistenceForTests } from '@/app/backend/persistence/db';
import { getProviderMetadataAdapter } from '@/app/backend/providers/metadata/adapters';
import type { ProviderCatalogSyncSuccess } from '@/app/backend/providers/types';

function expectConforms(result: ProviderCatalogSyncSuccess) {
    expect(result.ok).toBe(true);
    expect(result.models.length).toBeGreaterThan(0);

    for (const model of result.models) {
        expect(model.modelId.length).toBeGreaterThan(0);
        expect(model.label.length).toBeGreaterThan(0);
        expect(typeof model.isFree).toBe('boolean');
        expect(typeof model.features.supportsTools).toBe('boolean');
        expect(typeof model.features.supportsReasoning).toBe('boolean');
        expect(Array.isArray(model.features.inputModalities)).toBe(true);
        expect(Array.isArray(model.features.outputModalities)).toBe(true);
        expect(typeof model.pricing).toBe('object');
        expect(typeof model.raw).toBe('object');
    }
}

afterEach(() => {
    vi.unstubAllGlobals();
});

beforeEach(() => {
    resetPersistenceForTests();
});

describe('provider metadata adapter conformance', () => {
    it('openai adapter returns models with required catalog fields', async () => {
        const adapter = getProviderMetadataAdapter('openai');
        const result = await adapter.fetchCatalog({
            profileId: 'profile_test',
            authMethod: 'oauth_pkce',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error('Expected OpenAI metadata fetch to succeed for oauth_pkce curated catalog.');
        }
        expectConforms(result);
    });

    it('zai adapter returns models with required catalog fields', async () => {
        const adapter = getProviderMetadataAdapter('zai');
        const result = await adapter.fetchCatalog({
            profileId: 'profile_test',
            authMethod: 'api_key',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error('Expected Z.AI metadata fetch to succeed for static catalog.');
        }
        expectConforms(result);
    });

    it('moonshot adapter returns models with required catalog fields', async () => {
        const adapter = getProviderMetadataAdapter('moonshot');
        const result = await adapter.fetchCatalog({
            profileId: 'profile_test',
            authMethod: 'api_key',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error('Expected Moonshot metadata fetch to succeed for static catalog.');
        }
        expectConforms(result);
    });

    it('kilo adapter returns models with required catalog fields', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: 'kilo/auto',
                                    name: 'Kilo Auto',
                                    owned_by: 'kilo',
                                    context_length: 200000,
                                    supported_parameters: ['tools', 'reasoning'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/providers')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [{ id: 'openai', label: 'OpenAI' }],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            providers: [
                                {
                                    provider: 'openai',
                                    models: ['openai/gpt-5'],
                                },
                            ],
                        }),
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

        const adapter = getProviderMetadataAdapter('kilo');
        const result = await adapter.fetchCatalog({
            profileId: 'profile_test',
            authMethod: 'api_key',
            apiKey: 'kilo-test-token',
        });

        expect(result.ok).toBe(true);
        if (!result.ok) {
            throw new Error('Expected Kilo metadata fetch to succeed.');
        }
        expectConforms(result);
    });
});
