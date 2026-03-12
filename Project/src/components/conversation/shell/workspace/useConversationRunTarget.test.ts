import { describe, expect, it } from 'vitest';

import { useConversationRunTarget } from '@/web/components/conversation/shell/workspace/useConversationRunTarget';

import type { ProviderModelRecord, RunRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

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
        endpointProfile: {
            value: 'default',
            label: 'Default',
        },
        endpointProfiles: [
            {
                value: 'default',
                label: 'Default',
            },
        ],
        apiKeyCta: {
            label: 'Create key',
            url: 'https://example.com',
        },
        features: {
            catalogStrategy: 'dynamic',
            supportsKiloRouting: false,
            supportsModelProviderListing: false,
            supportsEndpointProfiles: true,
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
        supportsTools: input.supportsTools,
        supportsReasoning: true,
        supportsVision: false,
        supportsAudioInput: false,
        supportsAudioOutput: false,
        inputModalities: ['text'],
        outputModalities: ['text'],
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
    it('filters non-tool-capable models when the active mode requires native tools', () => {
        const state = useConversationRunTarget({
            providers: [createProvider({ id: 'openai', label: 'OpenAI', authMethod: 'api_key', authState: 'configured' })],
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
        expect(state.modelOptions.map((model) => model.id)).toEqual(['openai/gpt-5-tools']);
    });
});
