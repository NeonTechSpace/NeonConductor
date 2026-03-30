import type {
    ThreadEntrySubmitResult,
    WorkspaceLifecycleResult,
} from '@/web/components/conversation/sidebar/sidebarTypes';
import {
    type CreateWorkspaceRecordInput,
    type CreateWorkspaceRecordResult,
    submitWorkspaceStarterThreadLifecycle,
    useWorkspaceCreationLifecycle,
} from '@/web/components/workspaces/useWorkspaceCreationLifecycle';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface UseSidebarWorkspaceCreateControllerInput {
    profileId: string;
    onCreateThread: (input: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }) => Promise<ThreadEntrySubmitResult>;
}

export async function submitSidebarWorkspaceLifecycle(input: {
    createWorkspaceRecord: (input: CreateWorkspaceRecordInput) => Promise<CreateWorkspaceRecordResult>;
    onCreateThread: UseSidebarWorkspaceCreateControllerInput['onCreateThread'];
    profileId: string;
    absolutePath: string;
    label: string;
    defaultTopLevelTab: TopLevelTab;
    defaultProviderId: RuntimeProviderId | undefined;
    defaultModelId: string;
}): Promise<WorkspaceLifecycleResult> {
    return submitWorkspaceStarterThreadLifecycle({
        profileId: input.profileId,
        absolutePath: input.absolutePath,
        label: input.label,
        defaultTopLevelTab: input.defaultTopLevelTab,
        defaultProviderId: input.defaultProviderId,
        defaultModelId: input.defaultModelId,
        createWorkspaceRecord: input.createWorkspaceRecord,
        onCreateThread: input.onCreateThread,
    });
}

export function useSidebarWorkspaceCreateController(input: UseSidebarWorkspaceCreateControllerInput) {
    const workspaceCreationLifecycle = useWorkspaceCreationLifecycle({
        profileId: input.profileId,
    });

    return {
        busy: workspaceCreationLifecycle.isCreatingWorkspace,
        async submitWorkspaceCreate(workspaceInput: {
            absolutePath: string;
            label: string;
            defaultTopLevelTab: TopLevelTab;
            defaultProviderId: RuntimeProviderId | undefined;
            defaultModelId: string;
        }) {
            return submitWorkspaceStarterThreadLifecycle({
                profileId: input.profileId,
                absolutePath: workspaceInput.absolutePath,
                label: workspaceInput.label,
                defaultTopLevelTab: workspaceInput.defaultTopLevelTab,
                defaultProviderId: workspaceInput.defaultProviderId,
                defaultModelId: workspaceInput.defaultModelId,
                createWorkspaceRecord: workspaceCreationLifecycle.createWorkspaceRecord,
                onCreateThread: input.onCreateThread,
            });
        },
    };
}
