import { describe, expect, it } from 'vitest';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderControlSnapshot, ProviderListItem } from '@/app/backend/providers/service/types';

import { resolveContextPreviewTarget } from '@/web/components/settings/contextSettings/contextTargetPreview';

function createProvider(input: {
    id: ProviderListItem['id'];
    label: string;
}): ProviderListItem {
    return {
        id: input.id,
        label: input.label,
        supportsByok: true,
        isDefault: false,
        authMethod: 'api_key',
        authState: 'configured',
        availableAuthMethods: ['api_key'],
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

describe('resolveContextPreviewTarget', () => {
    it('returns the shared provider/model defaults when they resolve to real provider control entries', () => {
        const provider = createProvider({ id: 'openai', label: 'OpenAI' });
        const model = createModel({ id: 'openai/gpt-5', providerId: 'openai', label: 'GPT-5' });
        const providerControl: ProviderControlSnapshot = {
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
            specialistDefaults: [],
            entries: [
                {
                    provider,
                    models: [model],
                    catalogState: {
                        reason: null,
                        invalidModelCount: 0,
                    },
                },
            ],
        };

        expect(
            resolveContextPreviewTarget({
                profileId: 'profile_default',
                providerControl,
            })
        ).toEqual({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            defaultProvider: provider,
            defaultModel: model,
            previewQueryInput: {
                profileId: 'profile_default',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            },
        });
    });

    it('returns undefined when the shared defaults do not point at a real provider model target', () => {
        const provider = createProvider({ id: 'openai', label: 'OpenAI' });
        const providerControl: ProviderControlSnapshot = {
            defaults: {
                providerId: 'openai',
                modelId: 'openai/gpt-4.1',
            },
            specialistDefaults: [],
            entries: [
                {
                    provider,
                    models: [],
                    catalogState: {
                        reason: null,
                        invalidModelCount: 0,
                    },
                },
            ],
        };

        expect(
            resolveContextPreviewTarget({
                profileId: 'profile_default',
                providerControl,
            })
        ).toBeUndefined();
    });
});
