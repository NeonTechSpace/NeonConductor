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
        planStartMutation: trpc.plan.start.useMutation(),
        planAnswerMutation: trpc.plan.answerQuestion.useMutation(),
        planReviseMutation: trpc.plan.revise.useMutation(),
        planApproveMutation: trpc.plan.approve.useMutation(),
        planImplementMutation: trpc.plan.implement.useMutation(),
        orchestratorAbortMutation: trpc.orchestrator.abort.useMutation(),
        setEditPreferenceMutation: trpc.conversation.setEditPreference.useMutation(),
        resolvePermissionMutation: trpc.permission.resolve.useMutation(),
        configureThreadWorktreeMutation: trpc.worktree.configureThread.useMutation(),
        refreshWorktreeMutation: trpc.worktree.refresh.useMutation(),
        removeWorktreeMutation: trpc.worktree.remove.useMutation(),
        removeOrphanedWorktreesMutation: trpc.worktree.removeOrphaned.useMutation(),
    };
}
