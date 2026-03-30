import { describe, expect, it } from 'vitest';

import {
    buildProviderApiKeySetEventPayload,
    buildProviderAuthCancelledEventPayload,
    buildProviderAuthCompletedEventPayload,
    buildProviderAuthPolledEventPayload,
    buildProviderAuthRefreshedEventPayload,
    buildProviderAuthStartedEventPayload,
    buildProviderAuthClearedEventPayload,
    buildProviderConnectionProfileSetEventPayload,
    buildProviderExecutionPreferenceSetEventPayload,
    buildProviderKiloRoutingSetEventPayload,
    buildProviderOrganizationSetEventPayload,
    buildProviderSyncEventPayload,
} from '@/app/backend/trpc/routers/provider/providerMutationEventProjector';
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

const authState = {
    profileId: 'profile_default',
    providerId: 'openai',
    authMethod: 'api_key',
    authState: 'authenticated',
    updatedAt: '2026-03-30T10:00:00.000Z',
} as ProviderAuthStateRecord;

describe('providerMutationEventProjector', () => {
    it('builds auth lifecycle event payloads with the current router shape', () => {
        expect(
            buildProviderAuthStartedEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                method: 'device_code',
                flowId: 'flow_1',
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            method: 'device_code',
            flowId: 'flow_1',
        });

        expect(
            buildProviderAuthPolledEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                flowId: 'flow_1',
                flowStatus: 'pending',
                authState: 'pending',
                state: authState,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            flowId: 'flow_1',
            flowStatus: 'pending',
            authState: 'pending',
            state: authState,
        });

        expect(
            buildProviderAuthCompletedEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                flowId: 'flow_1',
                flowStatus: 'completed',
                authState: 'authenticated',
                state: authState,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            flowId: 'flow_1',
            flowStatus: 'completed',
            authState: 'authenticated',
            state: authState,
        });

        expect(
            buildProviderAuthCancelledEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                flowId: 'flow_1',
                state: authState,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            flowId: 'flow_1',
            state: authState,
        });

        expect(
            buildProviderAuthRefreshedEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                authState: 'authenticated',
                state: authState,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            authState: 'authenticated',
            state: authState,
        });

        expect(
            buildProviderApiKeySetEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                state: authState,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            state: authState,
        });

        expect(
            buildProviderAuthClearedEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                state: authState,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            state: authState,
        });
    });

    it('builds provider upsert event payloads without altering readback truth', () => {
        const connectionProfile = {
            providerId: 'openai',
            optionProfileId: 'default',
            label: 'Default',
            options: [],
            resolvedBaseUrl: null,
        } as ProviderConnectionProfileResult;
        const accountContext = {
            profileId: 'profile_default',
            providerId: 'openai',
            authState,
        } as ProviderAccountContextResult;
        const syncResult: ProviderSyncResult = {
            ok: true,
            status: 'synced',
            providerId: 'openai',
            modelCount: 1,
        };
        const preference: KiloModelRoutingPreference = {
            profileId: 'profile_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
            routingMode: 'pinned',
            pinnedProviderId: 'openai',
        };

        expect(
            buildProviderConnectionProfileSetEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                value: 'default',
                connectionProfile,
                defaults: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
                models,
                provider,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            value: 'default',
            connectionProfile,
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            models,
            provider,
        });

        expect(
            buildProviderExecutionPreferenceSetEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                executionPreference: {
                    providerId: 'openai',
                    mode: 'realtime_websocket',
                    canUseRealtimeWebSocket: true,
                },
                provider,
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'openai',
            executionPreference: {
                providerId: 'openai',
                mode: 'realtime_websocket',
                canUseRealtimeWebSocket: true,
            },
            provider,
        });

        expect(
            buildProviderOrganizationSetEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
                organizationId: 'org_1',
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
            profileId: 'profile_default',
            providerId: 'openai',
            organizationId: 'org_1',
            accountContext,
            authState,
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            models,
            provider,
        });

        expect(
            buildProviderKiloRoutingSetEventPayload({
                profileId: 'profile_default',
                providerId: 'kilo',
                modelId: 'openai/gpt-5',
                preference,
                providers: [{ providerId: 'openai', label: 'OpenAI' }],
            })
        ).toEqual({
            profileId: 'profile_default',
            providerId: 'kilo',
            modelId: 'openai/gpt-5',
            routingMode: 'pinned',
            sort: null,
            pinnedProviderId: 'openai',
            preference,
            providers: [{ providerId: 'openai', label: 'OpenAI' }],
        });

        expect(
            buildProviderSyncEventPayload({
                profileId: 'profile_default',
                providerId: 'openai',
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
            profileId: 'profile_default',
            providerId: 'openai',
            ok: true,
            status: 'synced',
            reason: 'catalog_empty_after_normalization',
            detail: 'No models after normalization',
            modelCount: 1,
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            models,
            provider,
        });
    });
});
