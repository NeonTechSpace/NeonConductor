import { useState } from 'react';

import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { patchSandboxCaches } from '@/web/components/conversation/shell/workspace/sandboxCache';
import {
    workspaceActionMutationFailure,
    workspaceActionMutationSuccess,
} from '@/web/components/conversation/shell/workspace/workspaceActionMutationResult';
import { trpc } from '@/web/trpc/client';

import type { PermissionRecord } from '@/app/backend/persistence/types';

import type {
    ConversationSetThreadExecutionEnvironmentInput,
    EntityId,
    PermissionResolution,
} from '@/shared/contracts';

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
            executionInput: Pick<ConversationSetThreadExecutionEnvironmentInput, 'mode' | 'sandboxId'>;
        }) {
            const selectedSandboxId =
                payload.executionInput.mode === 'sandbox' && isEntityId(payload.executionInput.sandboxId, 'sb')
                    ? payload.executionInput.sandboxId
                    : undefined;
            try {
                const result = await input.mutations.configureThreadSandboxMutation.mutateAsync({
                    profileId: input.profileId,
                    threadId: payload.threadId,
                    mode: payload.executionInput.mode,
                    ...(selectedSandboxId ? { sandboxId: selectedSandboxId } : {}),
                });
                patchSandboxCaches({
                    utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    thread: result.thread,
                    ...(result.sandbox ? { sandbox: result.sandbox } : {}),
                });
                setFeedbackTone('success');
                setFeedbackMessage('Execution environment updated.');
                return workspaceActionMutationSuccess();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Execution environment update failed.';
                setFeedbackTone('error');
                setFeedbackMessage(message);
                return workspaceActionMutationFailure(message);
            }
        },
        async refreshSandbox(sandboxId: `sb_${string}`) {
            try {
                const result = await input.mutations.refreshSandboxMutation.mutateAsync({
                    profileId: input.profileId,
                    sandboxId,
                });
                if (!result.refreshed || !result.sandbox) {
                    const message =
                        result.reason === 'not_found'
                            ? 'Managed sandbox no longer exists.'
                            : 'Managed sandbox refresh failed.';
                    setFeedbackTone('error');
                    setFeedbackMessage(message);
                    return workspaceActionMutationFailure(message);
                }
                patchSandboxCaches({
                    utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    sandbox: result.sandbox,
                });
                setFeedbackTone('success');
                setFeedbackMessage('Managed sandbox status refreshed.');
                return workspaceActionMutationSuccess();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Managed sandbox refresh failed.';
                setFeedbackTone('error');
                setFeedbackMessage(message);
                return workspaceActionMutationFailure(message);
            }
        },
        async removeSandbox(sandboxId: `sb_${string}`) {
            try {
                const result = await input.mutations.removeSandboxMutation.mutateAsync({
                    profileId: input.profileId,
                    sandboxId,
                    removeFiles: true,
                });
                if (!result.removed || !result.sandboxId) {
                    const message = result.message ?? 'Managed sandbox removal failed.';
                    setFeedbackTone('error');
                    setFeedbackMessage(message);
                    return workspaceActionMutationFailure(message);
                }
                patchSandboxCaches({
                    utils,
                    profileId: input.profileId,
                    listThreadsInput: input.listThreadsInput,
                    removedSandboxIds: [result.sandboxId],
                });
                setFeedbackTone('success');
                setFeedbackMessage('Managed sandbox removed.');
                return workspaceActionMutationSuccess();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Managed sandbox removal failed.';
                setFeedbackTone('error');
                setFeedbackMessage(message);
                return workspaceActionMutationFailure(message);
            }
        },
        async removeOrphanedSandboxes(workspaceFingerprint: string | undefined) {
            try {
                const result = await input.mutations.removeOrphanedSandboxesMutation.mutateAsync({
                    profileId: input.profileId,
                    ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
                });
                if (result.removedSandboxIds.length > 0) {
                    patchSandboxCaches({
                        utils,
                        profileId: input.profileId,
                        listThreadsInput: input.listThreadsInput,
                        removedSandboxIds: result.removedSandboxIds,
                    });
                }
                setFeedbackTone('success');
                setFeedbackMessage('Removed orphaned managed sandboxes.');
                return workspaceActionMutationSuccess();
            } catch (error: unknown) {
                const message = error instanceof Error ? error.message : 'Orphaned sandbox cleanup failed.';
                setFeedbackTone('error');
                setFeedbackMessage(message);
                return workspaceActionMutationFailure(message);
            }
        },
    };
}
