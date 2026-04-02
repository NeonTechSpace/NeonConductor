import { trpc } from '@/web/trpc/client';

export function useConversationMutations() {
    return {
        compactSessionMutation: trpc.context.compactSession.useMutation(),
        createThreadMutation: trpc.conversation.createThread.useMutation(),
        deleteWorkspaceThreadsMutation: trpc.conversation.deleteWorkspaceThreads.useMutation(),
        setThreadFavoriteMutation: trpc.conversation.setThreadFavorite.useMutation(),
        upsertTagMutation: trpc.conversation.upsertTag.useMutation(),
        setThreadTagsMutation: trpc.conversation.setThreadTags.useMutation(),
        createSessionMutation: trpc.session.create.useMutation(),
        startRunMutation: trpc.session.startRun.useMutation(),
        editSessionMutation: trpc.session.edit.useMutation(),
        branchFromMessageMutation: trpc.session.branchFromMessage.useMutation(),
        branchFromMessageWithWorkflowMutation: trpc.session.branchFromMessageWithWorkflow.useMutation(),
        planStartMutation: trpc.plan.start.useMutation(),
        planAnswerMutation: trpc.plan.answerQuestion.useMutation(),
        planReviseMutation: trpc.plan.revise.useMutation(),
        planGenerateDraftMutation: trpc.plan.generateDraft.useMutation(),
        planCancelMutation: trpc.plan.cancel.useMutation(),
        planApproveMutation: trpc.plan.approve.useMutation(),
        planImplementMutation: trpc.plan.implement.useMutation(),
        orchestratorAbortMutation: trpc.orchestrator.abort.useMutation(),
        setEditPreferenceMutation: trpc.conversation.setEditPreference.useMutation(),
        resolvePermissionMutation: trpc.permission.resolve.useMutation(),
        configureThreadSandboxMutation: trpc.sandbox.configureThread.useMutation(),
        refreshSandboxMutation: trpc.sandbox.refresh.useMutation(),
        removeSandboxMutation: trpc.sandbox.remove.useMutation(),
        removeOrphanedSandboxesMutation: trpc.sandbox.removeOrphaned.useMutation(),
    };
}
