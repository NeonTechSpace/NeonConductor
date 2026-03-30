import { describe, expect, it } from 'vitest';

import { buildProviderConnectionProfileMutationReadback, buildProviderModelRoutingPreferenceMutationReadback, buildProviderOrganizationMutationReadback, buildProviderSyncMutationReadback } from '@/app/backend/trpc/routers/provider/providerMutationReadbackProjector';
import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderAccountContextResult } from '@/app/backend/providers/auth/types';
import type { ProviderConnectionProfileResult, ProviderListItem, ProviderSyncResult } from '@/app/backend/providers/service/types';
import type { KiloModelRoutingPreference } from '@/app/backend/runtime/contracts';

const provider: ProviderListItem = {
    id: 'openai',
    label: 'OpenAI',
    supportsByok: true,
    isDefault: true,
    authMethod: 'api_key',
    authState: 'authenticated',
    availableAuthMethods: ['api_key'],
    connectionProfile: {
        providerId: 'openai',
        optionProfileId: 'default',
        label: 'Default',
        options: [],
        resolvedBaseUrl: null,
    },
    apiKeyCta: {
        label: 'Create key',
        url: 'https://example.com',
    },
    features: {
        catalogStrategy: 'dynamic',
        supportsKiloRouting: false,
        supportsModelProviderListing: true,
        supportsConnectionOptions: false,
        supportsCustomBaseUrl: false,
        supportsOrganizationScope: false,
    },
};

const models: ProviderModelRecord[] = [
    {
        id: 'openai/gpt-5',
        providerId: 'openai',
        label: 'GPT-5',
        features: {
            supportsTools: true,
            supportsReasoning: true,
            supportsVision: true,
            supportsAudioInput: false,
            supportsAudioOutput: false,
            inputModalities: ['text'],
            outputModalities: ['text'],
        },
        runtime: {
            toolProtocol: 'openai_chat_completions',
            apiFamily: 'openai_compatible',
        },
    },
];

describe('providerMutationReadbackProjector', () => {
    it('builds connection-profile readback without changing the payload shape', () => {
        const connectionProfile = {
            providerId: 'openai',
            optionProfileId: 'default',
            label: 'Default',
            options: [],
            resolvedBaseUrl: null,
        } as ProviderConnectionProfileResult;

        expect(
            buildProviderConnectionProfileMutationReadback({
                connectionProfile,
                defaults: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
                models,
                provider,
            })
        ).toEqual({
            connectionProfile,
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            models,
            provider,
        });
    });

    it('builds organization readback with account context, auth state, defaults, and models', () => {
        const authState = {
            profileId: 'profile_default',
            providerId: 'openai',
            authMethod: 'api_key',
            authState: 'authenticated',
            updatedAt: '2026-03-30T10:00:00.000Z',
        } as ProviderAuthStateRecord;
        const accountContext = {
            profileId: 'profile_default',
            providerId: 'openai',
            authState,
        } as ProviderAccountContextResult;

        expect(
            buildProviderOrganizationMutationReadback({
                accountContext,
                authState,
                defaults: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
                models,
                provider,
            })
        ).toEqual({
            ...accountContext,
            authState,
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            models,
            provider,
        });
    });

    it('builds sync readback while preserving empty-catalog fallout fields', () => {
        const syncResult: ProviderSyncResult = {
            ok: true,
            status: 'synced',
            providerId: 'openai',
            modelCount: 1,
            reason: 'catalog_sync_failed',
            detail: 'Normalized fallback',
        };

        expect(
            buildProviderSyncMutationReadback({
                syncResult,
                defaults: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
                models,
                provider,
                emptyCatalogState: {
                    reason: 'catalog_empty_after_normalization',
                    detail: 'No models after normalization',
                },
            })
        ).toEqual({
            ...syncResult,
            reason: 'catalog_empty_after_normalization',
            detail: 'No models after normalization',
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            models,
            provider,
        });
    });

    it('builds Kilo routing readback without mutating the provider-option list', () => {
        const preference: KiloModelRoutingPreference = {
            profileId: 'profile_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        };

        expect(
            buildProviderModelRoutingPreferenceMutationReadback({
                preference,
                providers: [{ providerId: 'openai', label: 'OpenAI' }],
            })
        ).toEqual({
            preference,
            providers: [{ providerId: 'openai', label: 'OpenAI' }],
        });
    });
});
