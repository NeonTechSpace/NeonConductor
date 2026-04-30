import { useDeferredValue } from 'react';

import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { WorkspaceEnvironmentSnapshot } from '@/shared/contracts/types/runtime';

export interface WorkspaceEnvironmentPreviewState {
    isLoading: boolean;
    errorMessage: string | undefined;
    snapshot: WorkspaceEnvironmentSnapshot | undefined;
}

export function useWorkspaceEnvironmentPreview(input: { profileId: string; absolutePath: string }) {
    const deferredAbsolutePath = useDeferredValue(input.absolutePath.trim());

    const previewQuery = trpc.runtime.inspectWorkspaceEnvironment.useQuery(
        {
            profileId: input.profileId,
            absolutePath: deferredAbsolutePath.length > 0 ? deferredAbsolutePath : '.',
        },
        {
            enabled: deferredAbsolutePath.length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    return {
        isLoading: previewQuery.isLoading,
        errorMessage: previewQuery.error?.message,
        snapshot: previewQuery.data?.snapshot,
    } satisfies WorkspaceEnvironmentPreviewState;
}
