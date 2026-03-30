import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

export function useWorkspaceRegistryRefreshAction(input: { profileId: string }) {
    const utils = trpc.useUtils();
    const refreshRegistryMutation = trpc.registry.refresh.useMutation({
        onSuccess: async (_result, variables) => {
            await utils.registry.listResolved.invalidate({
                profileId: input.profileId,
                ...(variables.workspaceFingerprint ? { workspaceFingerprint: variables.workspaceFingerprint } : {}),
            });
        },
    });

    return {
        isRefreshingRegistry: refreshRegistryMutation.isPending,
        refreshRegistry: createFailClosedAsyncAction(async (workspaceFingerprint: string) => {
            await refreshRegistryMutation.mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint,
            });
        }),
    };
}
