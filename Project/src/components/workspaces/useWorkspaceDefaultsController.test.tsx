import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULTS_SAVE_ERROR_MESSAGE, DEFAULTS_SAVE_SUCCESS_MESSAGE } from '@/web/components/workspaces/useWorkspaceDefaultsController';

const defaultsTestState = vi.hoisted(() => ({
    shellBootstrapSetDataMock: vi.fn(),
    setWorkspacePreferenceMutateAsyncMock: vi.fn(),
    useUtilsMock: vi.fn(),
    useMutationMock: vi.fn(),
    workspacePreferenceMutationConfig: { current: undefined as any },
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: defaultsTestState.useUtilsMock,
        runtime: {
            setWorkspacePreference: {
                useMutation: defaultsTestState.useMutationMock,
            },
        },
    },
}));

import { useWorkspaceDefaultsController } from '@/web/components/workspaces/useWorkspaceDefaultsController';

let latestController: ReturnType<typeof useWorkspaceDefaultsController> | undefined;

function DefaultsControllerProbe() {
    latestController = useWorkspaceDefaultsController({
        profileId: 'profile_default',
        workspaceFingerprint: 'ws_123',
        providers: [
            {
                id: 'openai',
                label: 'OpenAI',
                authState: 'authenticated',
                authMethod: 'api_key',
                connectionProfile: {
                    providerId: 'openai',
                    optionProfileId: 'default',
                    label: 'Default',
                    options: [{ value: 'default', label: 'Default' }],
                    resolvedBaseUrl: null,
                },
                apiKeyCta: { label: 'Create key', url: 'https://example.com' },
                isDefault: true,
                availableAuthMethods: ['api_key'],
                features: {
                    supportsKiloRouting: false,
                    catalogStrategy: 'dynamic',
                    supportsModelProviderListing: true,
                    supportsConnectionOptions: false,
                    supportsCustomBaseUrl: false,
                    supportsOrganizationScope: true,
                },
                supportsByok: true,
            },
        ],
        providerModels: [
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
        ],
        defaults: {
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        },
        workspacePreference: {
            profileId: 'profile_default',
            workspaceFingerprint: 'ws_123',
            defaultTopLevelTab: 'chat',
            defaultProviderId: 'openai',
            defaultModelId: 'openai/gpt-5',
            updatedAt: '2026-03-25T10:00:00.000Z',
        },
    });

    return (
        <div
            data-top-level-tab={latestController.topLevelTab}
            data-provider-id={latestController.providerId ?? ''}
            data-model-id={latestController.selectedModelId}
            data-feedback={latestController.feedbackMessage ?? ''}
        />
    );
}

describe('useWorkspaceDefaultsController', () => {
    beforeEach(() => {
        latestController = undefined;
        defaultsTestState.shellBootstrapSetDataMock.mockClear();
        defaultsTestState.setWorkspacePreferenceMutateAsyncMock.mockClear();
        defaultsTestState.useUtilsMock.mockClear();
        defaultsTestState.useMutationMock.mockClear();
        defaultsTestState.workspacePreferenceMutationConfig.current = undefined;
        defaultsTestState.useUtilsMock.mockReturnValue({
            runtime: {
                getShellBootstrap: {
                    setData: defaultsTestState.shellBootstrapSetDataMock,
                },
            },
        });
        defaultsTestState.useMutationMock.mockImplementation((config: any) => {
            defaultsTestState.workspacePreferenceMutationConfig.current = config;
            return {
                isPending: false,
                mutateAsync: defaultsTestState.setWorkspacePreferenceMutateAsyncMock,
            };
        });
        defaultsTestState.setWorkspacePreferenceMutateAsyncMock.mockImplementation(async (input: any) => {
            const workspacePreference = {
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                defaultTopLevelTab: input.defaultTopLevelTab,
                defaultProviderId: input.defaultProviderId,
                defaultModelId: input.defaultModelId,
                updatedAt: '2026-03-25T12:00:00.000Z',
            };

            defaultsTestState.workspacePreferenceMutationConfig.current?.onSuccess?.({
                workspacePreference,
            });

            return { workspacePreference };
        });
    });

    it('projects the initial default draft and patches cache after save', async () => {
        const html = renderToStaticMarkup(<DefaultsControllerProbe />);

        expect(html).toContain('data-top-level-tab="chat"');
        expect(html).toContain('data-provider-id="openai"');
        expect(html).toContain('data-model-id="openai/gpt-5"');
        expect(html).toContain('data-feedback=""');
        expect(DEFAULTS_SAVE_SUCCESS_MESSAGE).toBe('Saved the defaults Neon will use for new threads in this workspace.');
        expect(DEFAULTS_SAVE_ERROR_MESSAGE).toBe('Could not save workspace defaults.');

        await latestController?.saveDefaults();

        expect(defaultsTestState.setWorkspacePreferenceMutateAsyncMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceFingerprint: 'ws_123',
            defaultTopLevelTab: 'chat',
            defaultProviderId: 'openai',
            defaultModelId: 'openai/gpt-5',
        });
        expect(defaultsTestState.shellBootstrapSetDataMock).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.any(Function)
        );
    });
});
