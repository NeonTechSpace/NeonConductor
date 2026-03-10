import { useState } from 'react';

import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { patchWorktreeCaches } from '@/web/components/conversation/shell/workspace/worktreeCache';
import { trpc } from '@/web/trpc/client';

import type { PermissionRecord } from '@/app/backend/persistence/types';
import type {
    ConversationSetThreadExecutionEnvironmentInput,
    EntityId,
    PermissionResolution,
} from '@/app/backend/runtime/contracts';

interface UseConversationWorkspaceActionsInput {
    profileId: string;
    listThreadsInput: {
        profileId: string;
        activeTab: 'chat' | 'agent' | 'orchestrator';
        showAllModes: boolean;
        groupView: 'workspace' | 'branch';
        scope?: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        sort?: 'latest' | 'alphabetical';
    };
    mutations: ReturnType<typeof useConversationMutations>;
    onResolvePermission: () => void;
}

export function useConversationWorkspaceActions(input: UseConversationWorkspaceActionsInput) {
    const utils = trpc.useUtils();
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'success' | 'error' | 'info'>('info');

    return {
        feedbackMessage,
        feedbackTone,
        clearFeedback: () => {
            setFeedbackMessage(undefined);
            setFeedbackTone('info');
        },
        async resolvePermission(payload: {
            requestId: PermissionRecord['id'];
            resolution: PermissionResolution;
            selectedApprovalResource?: string;
        }) {
            input.onResolvePermission();
            await input.mutations.resolvePermissionMutation.mutateAsync({
                profileId: input.profileId,
                requestId: payload.requestId,
                resolution: payload.resolution,
                ...(payload.selectedApprovalResource
                    ? { selectedApprovalResource: payload.selectedApprovalResource }
                    : {}),
            });
            utils.permission.listPending.setData(undefined, (current) => {
                if (!current) {
                    return current;
                }

                return {
                    requests: current.requests.filter((request) => request.id !== payload.requestId),
                };
            });
        },
        async configureThreadExecution(payload: {
            threadId: EntityId<'thr'>;
            executionInput: Pick<
                ConversationSetThreadExecutionEnvironmentInput,
                'mode' | 'executionBranch' | 'baseBranch' | 'worktreeId'
            >;
        }) {
            const selectedWorktreeId =
                payload.executionInput.mode === 'worktree' && isEntityId(payload.executionInput.worktreeId, 'wt')
                    ? payload.executionInput.worktreeId
                    : undefined;
            try {
                const result = await input.mutations.configureThreadWorktreeMutation.mutateAsync({
                    profileId: input.profileId,
                    threadId: payload.threadId,
                    mode: payload.executionInput.mode,
                    ...(payload.executionInput.executionBranch
                        ? { executionBranch: payload.executionInput.executionBranch }
                        : {}),
                    ...(payload.executionInput.baseBranch ? { baseBranch: payload.executionInput.baseBranch } : {}),
                    ...(selectedWorktreeId ? { worktreeId: selectedWorktreeId } : {}),
                });
                patchWorktreeCaches({
                    utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    thread: result.thread,
                    ...(result.worktree ? { worktree: result.worktree } : {}),
                });
                setFeedbackTone('success');
                setFeedbackMessage('Execution environment updated.');
            } catch (error: unknown) {
                setFeedbackTone('error');
                setFeedbackMessage(error instanceof Error ? error.message : 'Execution environment update failed.');
                throw error;
            }
        },
        async refreshWorktree(worktreeId: `wt_${string}`) {
            try {
                const result = await input.mutations.refreshWorktreeMutation.mutateAsync({
                    profileId: input.profileId,
                    worktreeId,
                });
                if (!result.refreshed || !result.worktree) {
                    const message = result.reason === 'not_found'
                        ? 'Managed worktree no longer exists.'
                        : 'Managed worktree refresh failed.';
                    setFeedbackTone('error');
                    setFeedbackMessage(message);
                    return;
                }
                patchWorktreeCaches({
                    utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    worktree: result.worktree,
                });
                setFeedbackTone('success');
                setFeedbackMessage('Managed worktree status refreshed.');
            } catch (error: unknown) {
                setFeedbackTone('error');
                setFeedbackMessage(error instanceof Error ? error.message : 'Managed worktree refresh failed.');
                throw error;
            }
        },
        async removeWorktree(worktreeId: `wt_${string}`) {
            try {
                const result = await input.mutations.removeWorktreeMutation.mutateAsync({
                    profileId: input.profileId,
                    worktreeId,
                    removeFiles: true,
                });
                if (!result.removed || !result.worktreeId) {
                    setFeedbackTone('error');
                    setFeedbackMessage(result.message ?? 'Managed worktree removal failed.');
                    return;
                }
                patchWorktreeCaches({
                    utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    removedWorktreeIds: [result.worktreeId],
                });
                setFeedbackTone('success');
                setFeedbackMessage('Managed worktree removed.');
            } catch (error: unknown) {
                setFeedbackTone('error');
                setFeedbackMessage(error instanceof Error ? error.message : 'Managed worktree removal failed.');
                throw error;
            }
        },
        async removeOrphanedWorktrees(workspaceFingerprint: string | undefined) {
            try {
                const result = await input.mutations.removeOrphanedWorktreesMutation.mutateAsync({
                    profileId: input.profileId,
                    ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
                });
                if (result.removedWorktreeIds.length > 0) {
                    patchWorktreeCaches({
                        utils,
                        profileId: input.profileId,
                        listThreadsInput: input.listThreadsInput,
                        removedWorktreeIds: result.removedWorktreeIds,
                    });
                }
                setFeedbackTone('success');
                setFeedbackMessage('Removed orphaned managed worktrees.');
            } catch (error: unknown) {
                setFeedbackTone('error');
                setFeedbackMessage(error instanceof Error ? error.message : 'Orphaned worktree cleanup failed.');
                throw error;
            }
        },
    };
}
