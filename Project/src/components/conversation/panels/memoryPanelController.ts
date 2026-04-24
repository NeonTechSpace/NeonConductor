import { useEffect, useState } from 'react';

import type {
    MemoryPanelController,
    MemoryPanelProps,
    MemoryReviewDialogMode,
} from '@/web/components/conversation/panels/memoryPanel.types';
import { buildMemoryPanelViewModel } from '@/web/components/conversation/panels/memoryPanelViewModel';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { EntityId, MemoryApplyReviewActionInput } from '@/shared/contracts';

type MemoryReviewActionDraft =
    | Omit<Extract<MemoryApplyReviewActionInput, { action: 'update' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>
    | Omit<Extract<MemoryApplyReviewActionInput, { action: 'supersede' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>
    | Omit<Extract<MemoryApplyReviewActionInput, { action: 'forget' }>, 'profileId' | 'memoryId' | 'expectedUpdatedAt'>;

export async function runProjectionRescan(input: {
    refetch: () => Promise<unknown>;
    clearFeedback: () => void;
    reportError: (message: string) => void;
}): Promise<void> {
    input.clearFeedback();
    try {
        await input.refetch();
    } catch (error) {
        input.reportError(error instanceof Error ? error.message : 'Memory projection edits could not be rescanned.');
    }
}

export function useMemoryPanelController(input: MemoryPanelProps): MemoryPanelController {
    const [includeBroaderScopes, setIncludeBroaderScopes] = useState(true);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [feedbackTone, setFeedbackTone] = useState<'info' | 'error' | 'success'>('info');
    const [reviewDialog, setReviewDialog] = useState<
        | {
              memoryId: EntityId<'mem'>;
              mode: MemoryReviewDialogMode;
          }
        | undefined
    >(undefined);
    const utils = trpc.useUtils();

    const queryInput = {
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
        ...(input.threadId ? { threadId: input.threadId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
        includeBroaderScopes,
    };

    const projectionStatusQuery = trpc.memory.projectionStatus.useQuery(queryInput, PROGRESSIVE_QUERY_OPTIONS);
    const scanProjectionEditsQuery = trpc.memory.scanProjectionEdits.useQuery(queryInput, PROGRESSIVE_QUERY_OPTIONS);
    const reviewDetailsQuery = trpc.memory.getReviewDetails.useQuery(
        {
            profileId: input.profileId,
            memoryId: reviewDialog?.memoryId ?? ('mem_unselected' as EntityId<'mem'>),
        },
        {
            ...PROGRESSIVE_QUERY_OPTIONS,
            enabled: reviewDialog !== undefined,
        }
    );

    const invalidateMemoryQueries = async () => {
        await Promise.all([
            utils.memory.projectionStatus.invalidate(queryInput),
            utils.memory.scanProjectionEdits.invalidate(queryInput),
            utils.memory.list.invalidate({ profileId: input.profileId }),
        ]);
    };

    const syncProjectionMutation = trpc.memory.syncProjection.useMutation({
        onSuccess: async () => {
            setFeedbackTone('success');
            setFeedbackMessage('Memory projection synced to disk.');
            await invalidateMemoryQueries();
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    const applyProjectionEditMutation = trpc.memory.applyProjectionEdit.useMutation({
        onSuccess: async (result) => {
            setFeedbackTone('success');
            setFeedbackMessage(
                result.decision === 'reject'
                    ? 'Edited memory file was reset to the canonical record.'
                    : `Memory proposal applied as ${result.appliedAction ?? 'update'}.`
            );
            await invalidateMemoryQueries();
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    const applyReviewActionMutation = trpc.memory.applyReviewAction.useMutation({
        onSuccess: async (result) => {
            const actionLabel =
                result.action === 'forget'
                    ? 'forgotten'
                    : result.action === 'supersede'
                      ? 'superseded'
                      : 'updated';
            setFeedbackTone('success');
            setFeedbackMessage(`Memory ${actionLabel}. Sync projection when you want disk files refreshed.`);
            setReviewDialog(undefined);
            await invalidateMemoryQueries();
        },
        onError: (error) => {
            setFeedbackTone('error');
            setFeedbackMessage(error.message);
        },
    });

    useEffect(() => {
        if (reviewDetailsQuery.error) {
            setFeedbackTone('error');
            setFeedbackMessage(reviewDetailsQuery.error.message);
        }
    }, [reviewDetailsQuery.error]);

    const viewModel = buildMemoryPanelViewModel({
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        includeBroaderScopes,
        projectionStatus: projectionStatusQuery.data,
        projectionStatusIsFetching: projectionStatusQuery.isFetching,
        scanProjectionEdits: scanProjectionEditsQuery.data,
        scanProjectionEditsIsFetching: scanProjectionEditsQuery.isFetching,
        ...(input.retrievedMemory ? { retrievedMemory: input.retrievedMemory } : {}),
    });

    function clearFeedback(): void {
        setFeedbackMessage(undefined);
        setFeedbackTone('info');
    }

    async function onRescanProjectionEdits(): Promise<void> {
        await runProjectionRescan({
            refetch: () => scanProjectionEditsQuery.refetch(),
            clearFeedback,
            reportError: (message) => {
                setFeedbackTone('error');
                setFeedbackMessage(message);
            },
        });
    }

    return {
        viewModel,
        feedbackMessage,
        feedbackTone,
        clearFeedback,
        setIncludeBroaderScopes,
        isSyncingProjection: syncProjectionMutation.isPending,
        isRescanningProjectionEdits: scanProjectionEditsQuery.isFetching,
        isApplyingProjectionEdit: applyProjectionEditMutation.isPending,
        isReviewDetailsLoading: reviewDetailsQuery.isFetching,
        isApplyingReviewAction: applyReviewActionMutation.isPending,
        reviewDialog: reviewDialog
            ? {
                  ...reviewDialog,
                  ...(reviewDetailsQuery.data ? { details: reviewDetailsQuery.data } : {}),
              }
            : undefined,
        onRescanProjectionEdits,
        onSyncProjection: () => {
            clearFeedback();
            syncProjectionMutation.mutate(queryInput);
        },
        onOpenMemoryReview: (reviewInput) => {
            clearFeedback();
            setReviewDialog(reviewInput);
        },
        onCloseMemoryReview: () => {
            if (!applyReviewActionMutation.isPending) {
                setReviewDialog(undefined);
            }
        },
        onApplyMemoryReviewAction: (reviewInput: MemoryReviewActionDraft) => {
            if (!reviewDialog || !reviewDetailsQuery.data) {
                return;
            }
            clearFeedback();
            const base = {
                profileId: input.profileId,
                memoryId: reviewDialog.memoryId,
                expectedUpdatedAt: reviewDetailsQuery.data.memory.updatedAt,
            };
            if (reviewInput.action === 'forget') {
                applyReviewActionMutation.mutate({ ...base, action: 'forget' });
                return;
            }
            if (reviewInput.action === 'update') {
                applyReviewActionMutation.mutate({ ...base, ...reviewInput });
                return;
            }
            applyReviewActionMutation.mutate({ ...base, ...reviewInput });
        },
        onApplyProjectionEdit: (projectionEdit: {
            memoryId: EntityId<'mem'>;
            observedContentHash: string;
            decision: 'accept' | 'reject';
        }) => {
            clearFeedback();
            applyProjectionEditMutation.mutate({
                ...queryInput,
                memoryId: projectionEdit.memoryId,
                observedContentHash: projectionEdit.observedContentHash,
                decision: projectionEdit.decision,
            });
        },
    };
}
