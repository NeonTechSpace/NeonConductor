import { skipToken } from '@tanstack/react-query';
import { useState } from 'react';

import { resolveSelectedDiffPath } from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { DiffRecord } from '@/app/backend/persistence/types';

export function buildDiffPatchPreviewQueryInput(input: {
    profileId: string;
    selectedDiff: DiffRecord | undefined;
    resolvedSelectedPath: string | undefined;
}) {
    return input.selectedDiff && input.resolvedSelectedPath
        ? {
              profileId: input.profileId,
              diffId: input.selectedDiff.id,
              path: input.resolvedSelectedPath,
          }
        : skipToken;
}

interface CheckpointDiffSelectionStateInput {
    profileId: string;
    diffs: DiffRecord[];
}

export function useCheckpointDiffSelectionState({ profileId, diffs }: CheckpointDiffSelectionStateInput) {
    const selectedDiff = diffs[0];
    const [preferredPath, setPreferredPath] = useState<string | undefined>(undefined);
    const resolvedSelectedPath = resolveSelectedDiffPath({
        selectedDiff,
        preferredPath,
    });
    const utils = trpc.useUtils();
    const patchQuery = trpc.diff.getFilePatch.useQuery(
        buildDiffPatchPreviewQueryInput({
            profileId,
            selectedDiff,
            resolvedSelectedPath,
        }),
        PROGRESSIVE_QUERY_OPTIONS
    );
    const openPathMutation = trpc.system.openPath.useMutation();

    const prefetchPatch = (path: string) => {
        if (!selectedDiff) {
            return;
        }

        void utils.diff.getFilePatch.prefetch({
            profileId,
            diffId: selectedDiff.id,
            path,
        });
    };

    async function handleOpenPath() {
        if (!selectedDiff || selectedDiff.artifact.kind !== 'git' || !resolvedSelectedPath) {
            return;
        }

        try {
            await openPathMutation.mutateAsync({
                path: `${selectedDiff.artifact.workspaceRootPath}\\${resolvedSelectedPath.replaceAll('/', '\\')}`,
            });
        } catch {
            return;
        }
    }

    const patchMarkdown =
        patchQuery.data?.found && patchQuery.data.patch ? `\`\`\`diff\n${patchQuery.data.patch}\n\`\`\`` : '';

    return {
        selectedDiff,
        resolvedSelectedPath,
        patchMarkdown,
        isLoadingPatch: patchQuery.isPending,
        isRefreshingPatch: patchQuery.isFetching,
        canOpenPath: Boolean(selectedDiff?.artifact.kind === 'git' && resolvedSelectedPath),
        isOpeningPath: openPathMutation.isPending,
        onOpenPath: () => {
            void handleOpenPath();
        },
        onSelectPath: setPreferredPath,
        onPrefetchPatch: prefetchPatch,
    };
}
