import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { submitWorkspaceCreateRequest } from '@/web/components/workspaces/workspaceCreateDialogSubmit';
import { WorkspaceCreateDialog } from '@/web/components/workspaces/workspaceCreateDialog';
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

describe('submitWorkspaceCreateRequest', () => {
    it('closes the dialog after a successful create', async () => {
        const onCreateWorkspace = vi.fn(() => Promise.resolve());
        const onClose = vi.fn();

        const result = await submitWorkspaceCreateRequest({
            onCreateWorkspace,
            onClose,
            createWorkspaceInput: {
                absolutePath: 'C:/workspace',
                label: 'Workspace',
                defaultTopLevelTab: 'agent',
                defaultProviderId: 'openai',
                defaultModelId: 'openai/gpt-5',
            },
        });

        expect(result).toBeUndefined();
        expect(onCreateWorkspace).toHaveBeenCalledOnce();
        expect(onClose).toHaveBeenCalledOnce();
    });

    it('returns the failure message and keeps the dialog open when create fails', async () => {
        const onCreateWorkspace = vi.fn(() => Promise.reject(new Error('Create failed.')));
        const onClose = vi.fn();

        const result = await submitWorkspaceCreateRequest({
            onCreateWorkspace,
            onClose,
            createWorkspaceInput: {
                absolutePath: 'C:/workspace',
                label: 'Workspace',
                defaultTopLevelTab: 'agent',
                defaultProviderId: 'openai',
                defaultModelId: 'openai/gpt-5',
            },
        });

        expect(result).toBe('Create failed.');
        expect(onClose).not.toHaveBeenCalled();
    });
});

describe('WorkspaceCreateDialog', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('routes the create workspace preview through the shared hook', () => {
        const providers: ProviderListItem[] = [
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
        ];
        const providerModels: ProviderModelRecord[] = [
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

        renderToStaticMarkup(
            <WorkspaceCreateDialog
                open
                profileId='profile_default'
                providers={providers}
                providerModels={providerModels}
                defaults={{
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                }}
                isSaving={false}
                onClose={vi.fn()}
                onCreateWorkspace={vi.fn(() => Promise.resolve())}
            />
        );

        expect(useWorkspaceEnvironmentPreviewMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            absolutePath: '',
        });
    });
});
