import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

const controllerTestState = vi.hoisted(() => {
    const readModel = {
        providers: [{ id: 'openai', label: 'OpenAI' }],
        providerModels: [{ id: 'model_alpha', label: 'Model Alpha' }],
        runtimeDefaults: { providerId: 'openai', modelId: 'model_alpha' },
        selectedWorkspace: {
            fingerprint: 'wsf_alpha',
            label: 'Alpha Workspace',
            absolutePath: 'C:/alpha',
            updatedAt: '2026-03-24T00:00:00.000Z',
        },
        selectedWorkspacePreference: {
            workspaceFingerprint: 'wsf_alpha',
            defaultTopLevelTab: 'agent' as TopLevelTab,
            defaultProviderId: 'openai' as RuntimeProviderId,
            defaultModelId: 'model_alpha',
            preferredVcs: 'jj',
            preferredPackageManager: 'pnpm',
        },
        selectedWorkspaceThreads: [{ id: 'thr_1' }],
        selectedWorkspaceSessions: [{ id: 'sess_1', threadId: 'thr_1' }],
        selectedWorkspaceSandboxes: [{ id: 'sandbox_1' }],
        selectedWorkspaceRegistry: {
            resolved: {
                modes: [],
                rulesets: [],
                skillfiles: [],
            },
        },
    };

    const createWorkspaceRecordMock = vi.fn().mockResolvedValue({
        workspaceRoot: {
            fingerprint: 'wsf_created',
            label: 'Created Workspace',
            absolutePath: 'C:/created',
            updatedAt: '2026-03-24T00:00:00.000Z',
        },
    });

    const refreshRegistryMock = vi.fn().mockResolvedValue(undefined);
    const deleteWorkspaceConversationsMock = vi.fn().mockResolvedValue(undefined);
    const createWorkspaceLifecycleMock = vi.fn(() => ({
        isCreatingWorkspace: false,
        createWorkspaceRecord: createWorkspaceRecordMock,
    }));
    const readModelMock = vi.fn(() => readModel);
    const refreshActionMock = vi.fn(() => ({
        isRefreshingRegistry: false,
        refreshRegistry: refreshRegistryMock,
    }));
    const deletionActionMock = vi.fn(() => ({
        isDeletingWorkspaceConversations: false,
        deleteWorkspaceConversations: deleteWorkspaceConversationsMock,
    }));

    return {
        readModel,
        createWorkspaceRecordMock,
        refreshRegistryMock,
        deleteWorkspaceConversationsMock,
        createWorkspaceLifecycleMock,
        readModelMock,
        refreshActionMock,
        deletionActionMock,
    };
});

vi.mock('@/web/components/workspaces/useWorkspacesSurfaceReadModel', () => ({
    useWorkspacesSurfaceReadModel: controllerTestState.readModelMock,
}));

vi.mock('@/web/components/workspaces/useWorkspaceCreationLifecycle', () => ({
    useWorkspaceCreationLifecycle: controllerTestState.createWorkspaceLifecycleMock,
}));

vi.mock('@/web/components/workspaces/useWorkspaceRegistryRefreshAction', () => ({
    useWorkspaceRegistryRefreshAction: controllerTestState.refreshActionMock,
}));

vi.mock('@/web/components/workspaces/useWorkspaceConversationDeletionAction', () => ({
    useWorkspaceConversationDeletionAction: controllerTestState.deletionActionMock,
}));

import { useWorkspacesSurfaceController } from '@/web/components/workspaces/useWorkspacesSurfaceController';

let lastControllerState: ReturnType<typeof useWorkspacesSurfaceController> | undefined;

describe('useWorkspacesSurfaceController', () => {
    beforeEach(() => {
        lastControllerState = undefined;
        controllerTestState.createWorkspaceRecordMock.mockClear();
        controllerTestState.refreshRegistryMock.mockClear();
        controllerTestState.deleteWorkspaceConversationsMock.mockClear();
        controllerTestState.createWorkspaceLifecycleMock.mockClear();
        controllerTestState.readModelMock.mockClear();
        controllerTestState.refreshActionMock.mockClear();
        controllerTestState.deletionActionMock.mockClear();
    });

    it('composes the surface read model and action seams without changing the public contract', async () => {
        const onSelectedWorkspaceFingerprintChange = vi.fn();
        const onCreateThreadForWorkspace = vi.fn();

        function InputProbe() {
            lastControllerState = useWorkspacesSurfaceController({
                profileId: 'profile_default',
                workspaceRoots: [
                    {
                        fingerprint: 'wsf_alpha',
                        label: 'Alpha Workspace',
                        absolutePath: 'C:/alpha',
                        updatedAt: '2026-03-24T00:00:00.000Z',
                    },
                ],
                selectedWorkspaceFingerprint: 'wsf_alpha',
                onSelectedWorkspaceFingerprintChange,
                onCreateThreadForWorkspace,
            });
            return null;
        }

        renderToStaticMarkup(<InputProbe />);

        expect(controllerTestState.readModelMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceRoots: [
                {
                    fingerprint: 'wsf_alpha',
                    label: 'Alpha Workspace',
                    absolutePath: 'C:/alpha',
                    updatedAt: '2026-03-24T00:00:00.000Z',
                },
            ],
            selectedWorkspaceFingerprint: 'wsf_alpha',
        });
        expect(controllerTestState.createWorkspaceLifecycleMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(controllerTestState.refreshActionMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(controllerTestState.deletionActionMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(lastControllerState?.providers).toEqual(controllerTestState.readModel.providers);
        expect(lastControllerState?.selectedWorkspace?.fingerprint).toBe('wsf_alpha');
        expect(lastControllerState?.isCreatingWorkspace).toBe(false);
        expect(lastControllerState?.isRefreshingRegistry).toBe(false);
        expect(lastControllerState?.isDeletingWorkspaceConversations).toBe(false);

        await lastControllerState?.createWorkspace({
            absolutePath: 'C:/created',
            label: 'Created Workspace',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'openai',
            defaultModelId: 'model_alpha',
        });

        expect(controllerTestState.createWorkspaceRecordMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            absolutePath: 'C:/created',
            label: 'Created Workspace',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'openai',
            defaultModelId: 'model_alpha',
        });
        expect(onSelectedWorkspaceFingerprintChange).toHaveBeenCalledWith('wsf_created');
        expect(onCreateThreadForWorkspace).toHaveBeenCalledWith('wsf_created');

        await lastControllerState?.refreshRegistry('wsf_alpha');
        expect(controllerTestState.refreshRegistryMock).toHaveBeenCalledWith('wsf_alpha');

        await lastControllerState?.deleteWorkspaceConversations('wsf_alpha');
        expect(controllerTestState.deleteWorkspaceConversationsMock).toHaveBeenCalledWith('wsf_alpha');
    });
});
