import { beforeEach, describe, expect, it, vi } from 'vitest';

const { listDiscoverySnapshotsByProfileMock, modelExistsMock } = vi.hoisted(() => ({
    listDiscoverySnapshotsByProfileMock: vi.fn(),
    modelExistsMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    providerCatalogStore: {
        listDiscoverySnapshotsByProfile: listDiscoverySnapshotsByProfileMock,
    },
    providerStore: {
        modelExists: modelExistsMock,
    },
}));

import { listKiloProviderOptions } from '@/app/backend/providers/service/kiloProviderOptionsReadModel';

describe('kiloProviderOptionsReadModel', () => {
    beforeEach(() => {
        listDiscoverySnapshotsByProfileMock.mockReset();
        modelExistsMock.mockReset();
        modelExistsMock.mockResolvedValue(true);
    });

    it('returns an empty list when the latest kilo providers snapshot is missing or errored', async () => {
        listDiscoverySnapshotsByProfileMock.mockResolvedValue([]);

        const missingSnapshotResult = await listKiloProviderOptions({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });

        expect(missingSnapshotResult.isOk()).toBe(true);
        if (missingSnapshotResult.isErr()) {
            throw new Error(missingSnapshotResult.error.message);
        }
        expect(missingSnapshotResult.value).toEqual([]);

        listDiscoverySnapshotsByProfileMock.mockResolvedValue([
            {
                profileId: 'profile_local_default',
                providerId: 'kilo',
                kind: 'providers',
                status: 'error',
                payload: {},
                fetchedAt: '2026-03-30T00:00:00.000Z',
            },
        ]);

        const erroredSnapshotResult = await listKiloProviderOptions({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });

        expect(erroredSnapshotResult.isOk()).toBe(true);
        if (erroredSnapshotResult.isErr()) {
            throw new Error(erroredSnapshotResult.error.message);
        }
        expect(erroredSnapshotResult.value).toEqual([]);
    });

    it('parses live-style provider snapshots and sorts the provider rows by label', async () => {
        listDiscoverySnapshotsByProfileMock.mockResolvedValue([
            {
                profileId: 'profile_local_default',
                providerId: 'kilo',
                kind: 'providers',
                status: 'ok',
                payload: {
                    providers: [
                        {
                            id: 'anthropic',
                            label: 'Anthropic',
                        },
                        {
                            id: 'openai',
                            displayName: 'OpenAI',
                        },
                    ],
                    modelsByProvider: [
                        {
                            providerId: 'openai',
                            modelIds: ['openai/gpt-5'],
                            raw: {
                                models: [
                                    {
                                        id: 'openai/gpt-5',
                                        pricing: {
                                            prompt: 0.000001,
                                            completion: 0.000003,
                                            cache_read: 0.0000002,
                                            cache_write: 0.0000005,
                                        },
                                        context_length: 128000,
                                        max_completion_tokens: 4096,
                                    },
                                ],
                            },
                        },
                        {
                            provider: 'anthropic',
                            modelIds: ['openai/gpt-5'],
                            raw: {
                                models: [
                                    {
                                        slug: 'openai/gpt-5',
                                        endpoint: {
                                            model: {
                                                contextLength: 64000,
                                                maxCompletionTokens: 8192,
                                            },
                                        },
                                        pricing: {
                                            inputPrice: 0.000002,
                                            outputPrice: 0.000004,
                                        },
                                    },
                                ],
                            },
                        },
                    ],
                },
                fetchedAt: '2026-03-30T00:00:00.000Z',
            },
        ]);

        const result = await listKiloProviderOptions({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value).toEqual([
            {
                providerId: 'anthropic',
                label: 'Anthropic',
                inputPrice: 0.000002,
                outputPrice: 0.000004,
                contextLength: 64000,
                maxCompletionTokens: 8192,
            },
            {
                providerId: 'openai',
                label: 'OpenAI',
                inputPrice: 0.000001,
                outputPrice: 0.000003,
                cacheReadPrice: 0.0000002,
                cacheWritePrice: 0.0000005,
                contextLength: 128000,
                maxCompletionTokens: 4096,
            },
        ]);
    });

    it('fails closed when the selected kilo model does not exist', async () => {
        modelExistsMock.mockResolvedValue(false);

        const result = await listKiloProviderOptions({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'openai/does-not-exist',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing kilo model to fail closed.');
        }
        expect(result.error.code).toBe('provider_model_missing');
    });
});
