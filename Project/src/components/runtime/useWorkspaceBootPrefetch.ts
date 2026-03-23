import { useEffect } from 'react';

import { startWorkspaceBootPrefetch } from '@/web/components/runtime/workspaceBootLoader';

interface WorkspaceBootPrefetchInput {
    trpcClient: Parameters<typeof startWorkspaceBootPrefetch>[0]['trpcClient'];
    trpcUtils: Parameters<typeof startWorkspaceBootPrefetch>[0]['trpcUtils'];
}

export function useWorkspaceBootPrefetch(input: WorkspaceBootPrefetchInput): void {
    useEffect(() => {
        void startWorkspaceBootPrefetch({
            trpcClient: input.trpcClient,
            trpcUtils: input.trpcUtils,
        }).catch(() => {
            // Boot prefetch is opportunistic; normal queries still resolve the shell.
        });
    }, [input.trpcClient, input.trpcUtils]);
}
