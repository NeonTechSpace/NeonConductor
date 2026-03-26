import { describe, expect, it } from 'vitest';

import { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';


import type { ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import { kiloFrontierModelId } from '@/shared/kiloModels';

function createProvider(input: {
    id: ProviderListItem['id'];
    label: string;
    authMethod: ProviderListItem['authMethod'];
    authState: ProviderListItem['authState'];
}): ProviderListItem {
    return {
        id: input.id,
        label: input.label,
        supportsByok: true,
        isDefault: false,
        authMethod: input.authMethod,
        authState: input.authState,
        availableAuthMethods: input.authMethod === 'none' ? [] : [input.authMethod],
        connectionProfile: {
            providerId: input.id,
            optionProfileId: 'default',
            label: 'Default',
            options: [
                {
                    value: 'default',
                    label: 'Default',
                },
            ],
            resolvedBaseUrl: null,
        },
        apiKeyCta: {
            label: 'Create key',
            url: 'https://example.com',
        },
        features: {
            catalogStrategy: 'dynamic',
            supportsKiloRouting: false,
            supportsModelProviderListing: false,
            supportsConnectionOptions: true,
            supportsCustomBaseUrl: true,
            supportsOrganizationScope: false,
        },
    };
}

function createModel(input: {
    id: string;
    providerId: ProviderModelRecord['providerId'];
    label: string;
    supportsTools: boolean;
}): ProviderModelRecord {
    return {
        id: input.id,
        providerId: input.providerId,
        label: input.label,
        features: {
            supportsTools: input.supportsTools,
            supportsReasoning: true,
            supportsVision: false,
            supportsAudioInput: false,
            supportsAudioOutput: false,
            inputModalities: ['text'],
            outputModalities: ['text'],
        },
        runtime: {
            toolProtocol: 'openai_chat_completions',
            apiFamily: 'openai_compatible',
        },
    };
}

function createRun(input: {
    providerId: NonNullable<RunRecord['providerId']>;
    modelId: NonNullable<RunRecord['modelId']>;
}): RunRecord {
    return {
        id: 'run_test',
        sessionId: 'sess_test',
        profileId: 'profile_test',
        prompt: 'Inspect repo',
        status: 'completed',
        providerId: input.providerId,
        modelId: input.modelId,
        authMethod: 'api_key',
        createdAt: '2026-03-12T12:00:00.000Z',
        updatedAt: '2026-03-12T12:00:00.000Z',
    };
}

describe('useConversationRunTarget', () => {
    it('keeps incompatible models visible but resolves to a tool-capable model when the active mode requires native tools', () => {
        const state = useConversationRunTarget({
            providers: [
                createProvider({ id: 'openai', label: 'OpenAI', authMethod: 'api_key', authState: 'configured' }),
            ],
            providerModels: [
                createModel({
                    id: 'openai/gpt-5-no-tools',
                    providerId: 'openai',
                    label: 'GPT 5 No Tools',
                    supportsTools: false,
                }),
                createModel({
                    id: 'openai/gpt-5-tools',
                    providerId: 'openai',
                    label: 'GPT 5 Tools',
                    supportsTools: true,
                }),
            ],
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5-no-tools',
            },
            runs: [createRun({ providerId: 'openai', modelId: 'openai/gpt-5-no-tools' })],
            requiresTools: true,
        });

        expect(state.resolvedRunTarget).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5-tools',
        });
        expect(state.modelOptions.map((model) => model.id)).toEqual(['openai/gpt-5-no-tools', 'openai/gpt-5-tools']);
        expect(state.modelOptions.find((model) => model.id === 'openai/gpt-5-no-tools')?.compatibilityState).toBe(
            'incompatible'
        );
    });

    it('skips an incompatible latest run target when a compatible model exists', () => {
        const state = useConversationRunTarget({
            providers: [
                createProvider({ id: 'openai', label: 'OpenAI', authMethod: 'api_key', authState: 'configured' }),
            ],
            providerModels: [
                createModel({
                    id: 'openai/gpt-5-text',
                    providerId: 'openai',
                    label: 'GPT 5 Text',
                    supportsTools: false,
                }),
                createModel({
                    id: 'openai/gpt-5-tools',
                    providerId: 'openai',
                    label: 'GPT 5 Tools',
                    supportsTools: true,
                }),
            ],
            defaults: undefined,
            runs: [createRun({ providerId: 'openai', modelId: 'openai/gpt-5-text' })],
            requiresTools: true,
        });

        expect(state.resolvedRunTarget).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5-tools',
        });
    });

    it('keeps the fresh Kilo default when usable Kilo models exist even if another provider model is available', () => {
        const state = useConversationRunTarget({
            providers: [
                createProvider({ id: 'kilo', label: 'Kilo', authMethod: 'device_code', authState: 'authenticated' }),
                createProvider({ id: 'moonshot', label: 'Moonshot', authMethod: 'api_key', authState: 'configured' }),
            ],
            providerModels: [
                createModel({
                    id: kiloFrontierModelId,
                    providerId: 'kilo',
                    label: 'Kilo Auto Frontier',
                    supportsTools: true,
                }),
                createModel({
                    id: 'moonshot/kimi-k2',
                    providerId: 'moonshot',
                    label: 'Kimi K2',
                    supportsTools: true,
                }),
            ],
            defaults: {
                providerId: 'kilo',
                modelId: kiloFrontierModelId,
            },
            runs: [],
            requiresTools: false,
        });

        expect(state.resolvedRunTarget).toEqual({
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
        });
    });

    it('prefers the main-view draft over workspace and profile defaults when no session override exists', () => {
        const state = useConversationRunTarget({
            providers: [
                createProvider({ id: 'openai', label: 'OpenAI', authMethod: 'api_key', authState: 'configured' }),
                createProvider({ id: 'moonshot', label: 'Moonshot', authMethod: 'api_key', authState: 'configured' }),
            ],
            providerModels: [
                createModel({
                    id: 'openai/gpt-5',
                    providerId: 'openai',
                    label: 'GPT-5',
                    supportsTools: true,
                }),
                createModel({
                    id: 'moonshot/kimi-k2.5',
                    providerId: 'moonshot',
                    label: 'Kimi K2.5',
                    supportsTools: true,
                }),
            ],
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            workspacePreference: {
                profileId: 'profile_test',
                workspaceFingerprint: 'workspace_test',
                defaultTopLevelTab: 'chat',
                defaultProviderId: 'openai',
                defaultModelId: 'openai/gpt-5',
                updatedAt: '2026-03-12T12:00:00.000Z',
            },
            mainViewDraft: {
                providerId: 'moonshot',
                modelId: 'moonshot/kimi-k2.5',
            },
            runs: [],
            requiresTools: false,
        });

        expect(state.resolvedRunTarget).toEqual({
            providerId: 'moonshot',
            modelId: 'moonshot/kimi-k2.5',
        });
        expect(state.selectedProviderIdForComposer).toBe('moonshot');
        expect(state.selectedModelIdForComposer).toBe('moonshot/kimi-k2.5');
    });

    it('prefers the matching specialist default over workspace and shared fallback defaults for the active preset', () => {
        const state = useConversationRunTarget({
            providers: [
                createProvider({ id: 'kilo', label: 'Kilo', authMethod: 'device_code', authState: 'authenticated' }),
                createProvider({ id: 'openai', label: 'OpenAI', authMethod: 'api_key', authState: 'configured' }),
            ],
            providerModels: [
                createModel({
                    id: kiloFrontierModelId,
                    providerId: 'kilo',
                    label: 'Kilo Frontier',
                    supportsTools: true,
                }),
                createModel({
                    id: 'openai/gpt-5',
                    providerId: 'openai',
                    label: 'GPT-5',
                    supportsTools: true,
                }),
            ],
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            specialistDefaults: [
                {
                    topLevelTab: 'agent',
                    modeKey: 'code',
                    providerId: 'kilo',
                    modelId: kiloFrontierModelId,
                },
            ],
            workspacePreference: {
                profileId: 'profile_test',
                workspaceFingerprint: 'workspace_test',
                defaultTopLevelTab: 'agent',
                defaultProviderId: 'openai',
                defaultModelId: 'openai/gpt-5',
                updatedAt: '2026-03-12T12:00:00.000Z',
            },
            runs: [],
            topLevelTab: 'agent',
            modeKey: 'code',
            requiresTools: true,
        });

        expect(state.resolvedRunTarget).toEqual({
            providerId: 'kilo',
            modelId: kiloFrontierModelId,
        });
    });
});
