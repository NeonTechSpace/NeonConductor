import { useWorkspaceConversationDeletionAction } from '@/web/components/workspaces/useWorkspaceConversationDeletionAction';
import { useWorkspaceCreationLifecycle } from '@/web/components/workspaces/useWorkspaceCreationLifecycle';
import { useWorkspaceRegistryRefreshAction } from '@/web/components/workspaces/useWorkspaceRegistryRefreshAction';
import { useWorkspacesSurfaceReadModel } from '@/web/components/workspaces/useWorkspacesSurfaceReadModel';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface WorkspacesSurfaceControllerInput {
    profileId: string;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
        updatedAt: string;
    }>;
    selectedWorkspaceFingerprint: string | undefined;
    onSelectedWorkspaceFingerprintChange: (workspaceFingerprint: string | undefined) => void;
    onCreateThreadForWorkspace: (workspaceFingerprint: string) => void;
}

export function useWorkspacesSurfaceController(input: WorkspacesSurfaceControllerInput) {
    const readModel = useWorkspacesSurfaceReadModel({
        profileId: input.profileId,
        workspaceRoots: input.workspaceRoots,
        selectedWorkspaceFingerprint: input.selectedWorkspaceFingerprint,
    });
    const workspaceCreationLifecycle = useWorkspaceCreationLifecycle({
        profileId: input.profileId,
    });
    const registryRefreshAction = useWorkspaceRegistryRefreshAction({
        profileId: input.profileId,
    });
    const workspaceConversationDeletionAction = useWorkspaceConversationDeletionAction({
        profileId: input.profileId,
    });

    return {
        ...readModel,
        isCreatingWorkspace: workspaceCreationLifecycle.isCreatingWorkspace,
        isRefreshingRegistry: registryRefreshAction.isRefreshingRegistry,
        isDeletingWorkspaceConversations: workspaceConversationDeletionAction.isDeletingWorkspaceConversations,
        createWorkspace: async (createWorkspaceInput: {
            absolutePath: string;
            label: string;
            defaultTopLevelTab: TopLevelTab;
            defaultProviderId: RuntimeProviderId;
            defaultModelId: string;
        }) => {
            const result = await workspaceCreationLifecycle.createWorkspaceRecord({
                profileId: input.profileId,
                absolutePath: createWorkspaceInput.absolutePath,
                label: createWorkspaceInput.label,
                defaultTopLevelTab: createWorkspaceInput.defaultTopLevelTab,
                defaultProviderId: createWorkspaceInput.defaultProviderId,
                defaultModelId: createWorkspaceInput.defaultModelId,
            });

            input.onSelectedWorkspaceFingerprintChange(result.workspaceRoot.fingerprint);
            input.onCreateThreadForWorkspace(result.workspaceRoot.fingerprint);
        },
        refreshRegistry: registryRefreshAction.refreshRegistry,
        deleteWorkspaceConversations: workspaceConversationDeletionAction.deleteWorkspaceConversations,
    };
}
