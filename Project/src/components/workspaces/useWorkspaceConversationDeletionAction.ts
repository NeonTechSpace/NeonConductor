import { trpc } from '@/web/trpc/client';

export function useWorkspaceConversationDeletionAction(input: { profileId: string }) {
    const utils = trpc.useUtils();
    const deleteWorkspaceThreadsMutation = trpc.conversation.deleteWorkspaceThreads.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.conversation.listBuckets.invalidate({ profileId: input.profileId }),
                utils.conversation.listThreads.invalidate(),
                utils.session.list.invalidate({ profileId: input.profileId }),
            ]);
        },
    });

    return {
        isDeletingWorkspaceConversations: deleteWorkspaceThreadsMutation.isPending,
        deleteWorkspaceConversations: async (workspaceFingerprint: string) => {
            await deleteWorkspaceThreadsMutation.mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint,
                includeFavorites: false,
            });
        },
    };
}
