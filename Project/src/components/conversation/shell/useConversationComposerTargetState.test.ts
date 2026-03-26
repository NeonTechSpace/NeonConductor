import { describe, expect, it } from 'vitest';

import { useConversationComposerTargetState } from '@/web/components/conversation/shell/useConversationComposerTargetState';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderControlSnapshot, ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeShellBootstrap } from '@/shared/contracts';

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
}): ProviderModelRecord {
    return {
        id: input.id,
        providerId: input.providerId,
        label: input.label,
        features: {
            supportsTools: true,
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

function createProviderControl(): ProviderControlSnapshot {
    return {
        entries: [
            {
                provider: createProvider({
                    id: 'openai',
                    label: 'OpenAI',
                    authMethod: 'api_key',
                    authState: 'configured',
                }),
                models: [createModel({ id: 'openai/gpt-5', providerId: 'openai', label: 'GPT-5' })],
                catalogState: {
                    reason: null,
                    invalidModelCount: 0,
                },
            },
            {
                provider: createProvider({
                    id: 'kilo',
                    label: 'Kilo',
                    authMethod: 'device_code',
                    authState: 'authenticated',
                }),
                models: [createModel({ id: 'kilo/frontier', providerId: 'kilo', label: 'Kilo Frontier' })],
                catalogState: {
                    reason: null,
                    invalidModelCount: 0,
                },
            },
        ],
        defaults: {
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        },
        specialistDefaults: [],
    };
}

function createShellBootstrapData(): RuntimeShellBootstrap {
    return {
        lastSequence: 0,
        providerControl: createProviderControl(),
        threadTags: [],
        executionPreset: 'standard',
        workspaceRoots: [],
        workspacePreferences: [
            {
                profileId: 'profile_test',
                workspaceFingerprint: 'ws_selected',
                defaultTopLevelTab: 'chat',
                defaultProviderId: 'openai',
                defaultModelId: 'openai/gpt-5',
                updatedAt: '2026-03-21T10:00:00.000Z',
            },
            {
                profileId: 'profile_test',
                workspaceFingerprint: 'ws_thread',
                defaultTopLevelTab: 'chat',
                defaultProviderId: 'kilo',
                defaultModelId: 'kilo/frontier',
                updatedAt: '2026-03-21T10:00:00.000Z',
            },
        ],
        sandboxes: [],
    };
}

describe('useConversationComposerTargetState', () => {
    it('prefers the selected thread workspace preference over the shell-selected workspace preference', () => {
        const state = useConversationComposerTargetState({
            shellBootstrapData: createShellBootstrapData(),
            selectedWorkspaceFingerprint: 'ws_selected',
            selectedThreadWorkspaceFingerprint: 'ws_thread',
            mainViewDraftTarget: undefined,
            sessionOverride: undefined,
            runs: [],
            topLevelTab: 'chat',
            modeKey: 'chat',
            requiresNativeTools: false,
            imageAttachmentsAllowed: true,
        });

        expect(state.resolvedRunTarget).toEqual({
            providerId: 'kilo',
            modelId: 'kilo/frontier',
        });
    });
});
