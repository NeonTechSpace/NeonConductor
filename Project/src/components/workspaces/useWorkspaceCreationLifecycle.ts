import { patchWorkspacePreferenceCache, patchWorkspaceRootCaches } from '@/web/components/workspaces/workspacesSurfaceCacheProjector';
import { trpc } from '@/web/trpc/client';

import type {
    ThreadEntrySubmitResult,
    WorkspaceLifecycleResult,
} from '@/web/components/conversation/sidebar/sidebarTypes';

import type { WorkspaceRootRecord } from '@/shared/contracts';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

export interface WorkspaceCreateLifecycleInput {
    absolutePath: string;
    label: string;
    defaultTopLevelTab: TopLevelTab;
    defaultProviderId: RuntimeProviderId | undefined;
    defaultModelId: string;
}

export interface CreateWorkspaceRecordInput extends WorkspaceCreateLifecycleInput {
    profileId: string;
}

export interface CreateWorkspaceRecordResult {
    workspaceRoot: WorkspaceRootRecord;
}

export interface WorkspaceStarterThreadLifecycleInput extends CreateWorkspaceRecordInput {
    createWorkspaceRecord: (input: CreateWorkspaceRecordInput) => Promise<CreateWorkspaceRecordResult>;
    onCreateThread: (input: {
        workspaceFingerprint: string;
        workspaceAbsolutePath: string;
        title: string;
        topLevelTab: TopLevelTab;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }) => Promise<ThreadEntrySubmitResult>;
}

export async function submitWorkspaceStarterThreadLifecycle(
    input: WorkspaceStarterThreadLifecycleInput
): Promise<WorkspaceLifecycleResult> {
    try {
        const result = await input.createWorkspaceRecord({
            profileId: input.profileId,
            absolutePath: input.absolutePath,
            label: input.label,
            defaultTopLevelTab: input.defaultTopLevelTab,
            defaultProviderId: input.defaultProviderId,
            defaultModelId: input.defaultModelId,
        });

        const starterThreadResult = await input.onCreateThread({
            workspaceFingerprint: result.workspaceRoot.fingerprint,
            workspaceAbsolutePath: result.workspaceRoot.absolutePath,
            title: '',
            topLevelTab: input.defaultTopLevelTab,
            ...(input.defaultProviderId && input.defaultModelId
                ? {
                      providerId: input.defaultProviderId,
                      modelId: input.defaultModelId,
                  }
                : {}),
        });

        if (starterThreadResult.kind === 'failed') {
            return {
                kind: 'created_without_starter_thread',
                workspaceRoot: result.workspaceRoot,
                draftState: {
                    workspaceFingerprint: result.workspaceRoot.fingerprint,
                    title: '',
                    topLevelTab: input.defaultTopLevelTab,
                    providerId: input.defaultProviderId,
                    modelId: input.defaultModelId,
                },
                message: starterThreadResult.message,
            };
        }

        return {
            kind: 'created_with_starter_thread',
            workspaceRoot: result.workspaceRoot,
            threadEntryResult: starterThreadResult,
        };
    } catch (error) {
        return {
            kind: 'failed',
            message: error instanceof Error ? error.message : 'Workspace could not be created.',
        };
    }
}

export function useWorkspaceCreationLifecycle(input: { profileId: string }) {
    const utils = trpc.useUtils();
    const registerWorkspaceRootMutation = trpc.runtime.registerWorkspaceRoot.useMutation();
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            patchWorkspacePreferenceCache({
                utils,
                profileId: input.profileId,
                workspacePreference,
            });
        },
    });

    const createWorkspaceRecord = async (
        createWorkspaceInput: CreateWorkspaceRecordInput
    ): Promise<CreateWorkspaceRecordResult> => {
        const result = await registerWorkspaceRootMutation.mutateAsync({
            profileId: createWorkspaceInput.profileId,
            absolutePath: createWorkspaceInput.absolutePath,
            label: createWorkspaceInput.label,
        });

        patchWorkspaceRootCaches({
            utils,
            profileId: createWorkspaceInput.profileId,
            workspaceRoot: result.workspaceRoot,
        });

        await setWorkspacePreferenceMutation.mutateAsync({
            profileId: createWorkspaceInput.profileId,
            workspaceFingerprint: result.workspaceRoot.fingerprint,
            defaultTopLevelTab: createWorkspaceInput.defaultTopLevelTab,
            ...(createWorkspaceInput.defaultProviderId
                ? {
                      defaultProviderId: createWorkspaceInput.defaultProviderId,
                      defaultModelId: createWorkspaceInput.defaultModelId,
                  }
                : {}),
        });

        return result;
    };

    return {
        isCreatingWorkspace: registerWorkspaceRootMutation.isPending || setWorkspacePreferenceMutation.isPending,
        createWorkspaceRecord,
    };
}
