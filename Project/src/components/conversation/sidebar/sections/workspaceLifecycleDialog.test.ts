import { describe, expect, it } from 'vitest';

import { resolveWorkspaceLifecycleDraft } from '@/web/components/conversation/sidebar/sections/workspaceLifecycleDialog';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

describe('resolveWorkspaceLifecycleDraft', () => {
    it('creates a fresh empty draft seeded from the resolved workspace defaults snapshot', () => {
        const providers: ProviderListItem[] = [
            {
                id: 'kilo',
                label: 'Kilo',
                authState: 'authenticated',
                authMethod: 'device_code',
                connectionProfile: {
                    providerId: 'kilo',
                    optionProfileId: 'gateway',
                    label: 'Gateway',
                    options: [{ value: 'gateway', label: 'Gateway' }],
                    resolvedBaseUrl: null,
                },
                apiKeyCta: { label: 'Create key', url: 'https://example.com' },
                isDefault: true,
                availableAuthMethods: ['device_code'],
                features: {
                    supportsKiloRouting: true,
                    catalogStrategy: 'dynamic',
                    supportsModelProviderListing: true,
                    supportsConnectionOptions: false,
                    supportsCustomBaseUrl: false,
                    supportsOrganizationScope: true,
                },
                supportsByok: false,
            },
        ];
        const providerModels: ProviderModelRecord[] = [
            {
                id: 'kilo/gpt-5',
                providerId: 'kilo',
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
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'openai_compatible',
                },
            },
        ];

        const draft = resolveWorkspaceLifecycleDraft({
            providers,
            providerModels,
            workspacePreferences: [],
            defaults: {
                providerId: 'kilo',
                modelId: 'kilo/gpt-5',
            },
        });

        expect(draft).toEqual({
            label: '',
            absolutePath: '',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'kilo',
            defaultModelId: 'kilo/gpt-5',
        });
    });
});
