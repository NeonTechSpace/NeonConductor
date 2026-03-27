import { useState } from 'react';

import { useConversationMutations } from '@/web/components/conversation/shell/actions/useConversationMutations';
import {
    configureConversationThreadExecution,
    refreshManagedSandbox,
    removeManagedSandbox,
    removeOrphanedManagedSandboxes,
} from '@/web/components/conversation/shell/workspace/executionTargetActionsController';
import { resolveConversationPermission } from '@/web/components/conversation/shell/workspace/permissionResolutionController';
import type { WorkspaceActionMutationResult } from '@/web/components/conversation/shell/workspace/workspaceActionMutationResult';
import { applyWorkspaceActionOutcome } from '@/web/components/conversation/shell/workspace/workspaceActionOutcomeHandler';
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

    const commitActionOutcome = (result: WorkspaceActionMutationResult) => {
        const feedback = applyWorkspaceActionOutcome({
            utils,
            profileId: input.profileId,
            listThreadsInput: input.listThreadsInput,
            result,
        });
        if (feedback) {
            setFeedbackTone(feedback.tone);
            setFeedbackMessage(feedback.message);
        }
        return result;
    };

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
            const result = await resolveConversationPermission({
                profileId: input.profileId,
                onResolvePermission: input.onResolvePermission,
                mutateAsync: input.mutations.resolvePermissionMutation.mutateAsync,
                payload,
            });
            return commitActionOutcome(result);
        },
        async configureThreadExecution(payload: {
            threadId: EntityId<'thr'>;
            executionInput: Pick<ConversationSetThreadExecutionEnvironmentInput, 'mode' | 'sandboxId'>;
        }) {
            const result = await configureConversationThreadExecution({
                profileId: input.profileId,
                threadId: payload.threadId,
                executionInput: payload.executionInput,
                mutateAsync: input.mutations.configureThreadSandboxMutation.mutateAsync,
            });
            return commitActionOutcome(result);
        },
        async refreshSandbox(sandboxId: `sb_${string}`) {
            const result = await refreshManagedSandbox({
                profileId: input.profileId,
                sandboxId,
                mutateAsync: input.mutations.refreshSandboxMutation.mutateAsync,
            });
            return commitActionOutcome(result);
        },
        async removeSandbox(sandboxId: `sb_${string}`) {
            const result = await removeManagedSandbox({
                profileId: input.profileId,
                sandboxId,
                mutateAsync: input.mutations.removeSandboxMutation.mutateAsync,
            });
            return commitActionOutcome(result);
        },
        async removeOrphanedSandboxes(workspaceFingerprint: string | undefined) {
            const result = await removeOrphanedManagedSandboxes({
                profileId: input.profileId,
                ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
                mutateAsync: input.mutations.removeOrphanedSandboxesMutation.mutateAsync,
            });
            return commitActionOutcome(result);
        },
    };
}
