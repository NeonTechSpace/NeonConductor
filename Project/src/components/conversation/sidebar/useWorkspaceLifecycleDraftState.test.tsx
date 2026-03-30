import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useWorkspaceLifecycleDraftState } from '@/web/components/conversation/sidebar/useWorkspaceLifecycleDraftState';
import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

const useWorkspaceEnvironmentPreviewMock = vi.fn((_input: unknown) => ({
    isLoading: false,
    errorMessage: undefined,
    snapshot: undefined,
}));

vi.mock('@/web/components/workspaces/useWorkspaceEnvironmentPreview', () => ({
    useWorkspaceEnvironmentPreview: (input: unknown) => useWorkspaceEnvironmentPreviewMock(input),
}));

function LifecycleProbe(props: {
    profileId: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
}) {
    const result = useWorkspaceLifecycleDraftState({
        profileId: props.profileId,
        providers: props.providers,
        providerModels: props.providerModels,
        workspacePreferences: [],
        defaults: undefined,
        desktopBridge: undefined,
    });

    return <span data-state={result.environmentPreview.isLoading ? 'loading' : 'ready'} />;
}

describe('useWorkspaceLifecycleDraftState', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('routes the lifecycle environment preview through the shared hook', () => {
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

        renderToStaticMarkup(
            <LifecycleProbe profileId='profile_default' providers={providers} providerModels={providerModels} />
        );

        expect(useWorkspaceEnvironmentPreviewMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            absolutePath: '',
        });
    });
});
