import { skipToken } from '@tanstack/react-query';
import { useState } from 'react';

import type { ChangedFilesSectionProps } from '@/web/components/conversation/panels/diffCheckpointPanel/changedFilesSection';
import type { CheckpointMaintenanceActionsProps } from '@/web/components/conversation/panels/diffCheckpointPanel/checkpointMaintenanceActions';
import {
    filterVisibleCheckpoints,
    resolveSelectedDiffPath,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';

import type { CheckpointStorageSummary } from '@/shared/contracts';


export interface DiffCheckpointPanelProps {
    profileId: string;
    selectedRunId?: CheckpointRecord['runId'];
    selectedSessionId?: CheckpointRecord['sessionId'];
    diffs: DiffRecord[];
    checkpoints: CheckpointRecord[];
    checkpointStorage?: CheckpointStorageSummary;
    disabled: boolean;
}

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

export function useDiffCheckpointPanelController({
    profileId,
    selectedRunId,
    selectedSessionId,
    diffs,
    checkpoints,
    checkpointStorage,
    disabled,
}: DiffCheckpointPanelProps) {
    const selectedDiff = diffs[0];
    const [preferredPath, setPreferredPath] = useState<string | undefined>(undefined);
    const [confirmRollbackId, setConfirmRollbackId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const [rollbackTargetId, setRollbackTargetId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [milestoneTitle, setMilestoneTitle] = useState('');
    const [milestoneDrafts, setMilestoneDrafts] = useState<Record<string, string>>({});
    const [milestonesOnly, setMilestonesOnly] = useState(false);
    const [cleanupPreviewOpen, setCleanupPreviewOpen] = useState(false);
    const resolvedSelectedPath = resolveSelectedDiffPath({
        selectedDiff,
        preferredPath,
    });
    const utils = trpc.useUtils();

    const invalidateCheckpointList = () => {
        if (!selectedSessionId) {
            return Promise.resolve();
        }

        return utils.checkpoint.list.invalidate({
            profileId,
            sessionId: selectedSessionId,
        });
    };

    const patchQuery = trpc.diff.getFilePatch.useQuery(
        buildDiffPatchPreviewQueryInput({
            profileId,
            selectedDiff,
            resolvedSelectedPath,
        }),
        PROGRESSIVE_QUERY_OPTIONS
    );
    const openPathMutation = trpc.system.openPath.useMutation();
    const rollbackMutation = trpc.checkpoint.rollback.useMutation({
        onSuccess: async (result) => {
            if (!result.rolledBack) {
                setFeedbackMessage(result.message ?? 'Rollback could not be completed.');
                return;
            }

            setFeedbackMessage('Checkpoint rollback completed.');
            setConfirmRollbackId(undefined);
            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
        onSettled: () => {
            setRollbackTargetId(undefined);
        },
    });
    const createMilestoneMutation = trpc.checkpoint.create.useMutation({
        onSuccess: async (result) => {
            if (!result.created) {
                setFeedbackMessage('Milestone could not be saved.');
                return;
            }

            setFeedbackMessage('Milestone saved.');
            setMilestoneTitle('');
            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const promoteMilestoneMutation = trpc.checkpoint.promoteToMilestone.useMutation({
        onSuccess: async (result) => {
            if (!result.promoted) {
                setFeedbackMessage('Checkpoint could not be promoted to a milestone.');
                return;
            }

            setFeedbackMessage('Checkpoint promoted to milestone.');
            setMilestoneDrafts((current) => {
                const checkpoint = result.checkpoint;
                if (!checkpoint) {
                    return current;
                }

                return Object.fromEntries(Object.entries(current).filter(([checkpointId]) => checkpointId !== checkpoint.id));
            });
            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const renameMilestoneMutation = trpc.checkpoint.renameMilestone.useMutation({
        onSuccess: async (result) => {
            if (!result.renamed) {
                setFeedbackMessage('Milestone could not be renamed.');
                return;
            }

            setFeedbackMessage('Milestone renamed.');
            setMilestoneDrafts((current) => {
                const checkpoint = result.checkpoint;
                if (!checkpoint) {
                    return current;
                }

                return Object.fromEntries(Object.entries(current).filter(([checkpointId]) => checkpointId !== checkpoint.id));
            });
            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const deleteMilestoneMutation = trpc.checkpoint.deleteMilestone.useMutation({
        onSuccess: async (result) => {
            if (!result.deleted) {
                setFeedbackMessage('Milestone could not be deleted.');
                return;
            }

            setFeedbackMessage('Milestone deleted.');
            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const applyCleanupMutation = trpc.checkpoint.applyCleanup.useMutation({
        onSuccess: async (result) => {
            if (!result.cleanedUp) {
                setFeedbackMessage(result.message ?? 'Cleanup requires explicit confirmation.');
                return;
            }

            setFeedbackMessage(
                `Cleanup removed ${String(result.deletedCount ?? 0)} checkpoints and pruned ${String(result.prunedBlobCount ?? 0)} snapshot blobs.`
            );
            await Promise.all([invalidateCheckpointList(), utils.checkpoint.previewCleanup.invalidate()]);
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });
    const revertChangesetMutation = trpc.checkpoint.revertChangeset.useMutation({
        onSuccess: async (result) => {
            if (!result.reverted) {
                setFeedbackMessage(result.message ?? 'Changeset revert could not be completed.');
                return;
            }

            setFeedbackMessage('Changeset revert completed.');
            setConfirmRollbackId(undefined);
            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
        onSettled: () => {
            setRollbackTargetId(undefined);
        },
    });
    const forceCompactMutation = trpc.checkpoint.forceCompact.useMutation({
        onSuccess: async (result) => {
            if (!result.compacted) {
                setFeedbackMessage(result.message ?? 'Compaction requires explicit confirmation.');
            } else if (result.run?.status === 'failed') {
                setFeedbackMessage(result.run.message ?? 'Checkpoint compaction failed.');
            } else if (result.run?.status === 'noop') {
                setFeedbackMessage(result.run.message ?? 'No checkpoint blobs were eligible for compaction.');
            } else {
                setFeedbackMessage(result.run?.message ?? 'Checkpoint storage compaction completed.');
            }

            await invalidateCheckpointList();
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
    });

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

    const patchMarkdown =
        patchQuery.data?.found && patchQuery.data.patch ? `\`\`\`diff\n${patchQuery.data.patch}\n\`\`\`` : '';
    const visibleCheckpoints = filterVisibleCheckpoints(checkpoints, milestonesOnly);

    async function handleRestoreCheckpoint(checkpointId: CheckpointRecord['id']) {
        setRollbackTargetId(checkpointId);
        setFeedbackMessage(undefined);
        try {
            await rollbackMutation.mutateAsync({
                profileId,
                checkpointId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    async function handleRevertChangeset(checkpointId: CheckpointRecord['id']) {
        setRollbackTargetId(checkpointId);
        setFeedbackMessage(undefined);
        try {
            await revertChangesetMutation.mutateAsync({
                profileId,
                checkpointId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    async function handlePromoteMilestone(checkpointId: CheckpointRecord['id'], title: string) {
        if (title.length === 0) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await promoteMilestoneMutation.mutateAsync({
                profileId,
                checkpointId,
                milestoneTitle: title,
            });
        } catch {
            return;
        }
    }

    async function handleRenameMilestone(checkpointId: CheckpointRecord['id'], title: string) {
        if (title.length === 0) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await renameMilestoneMutation.mutateAsync({
                profileId,
                checkpointId,
                milestoneTitle: title,
            });
        } catch {
            return;
        }
    }

    async function handleDeleteMilestone(checkpointId: CheckpointRecord['id']) {
        setFeedbackMessage(undefined);
        try {
            await deleteMilestoneMutation.mutateAsync({
                profileId,
                checkpointId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    async function handleApplyCleanup() {
        if (!selectedSessionId) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await applyCleanupMutation.mutateAsync({
                profileId,
                sessionId: selectedSessionId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    async function handleForceCompact() {
        if (!selectedSessionId) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await forceCompactMutation.mutateAsync({
                profileId,
                sessionId: selectedSessionId,
                confirm: true,
            });
        } catch {
            return;
        }
    }

    async function handleSaveMilestone() {
        if (!selectedRunId || milestoneTitle.trim().length === 0) {
            return;
        }

        setFeedbackMessage(undefined);
        try {
            await createMilestoneMutation.mutateAsync({
                profileId,
                runId: selectedRunId,
                milestoneTitle: milestoneTitle.trim(),
            });
        } catch {
            return;
        }
    }

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

    const changedFilesSectionProps: ChangedFilesSectionProps | undefined = selectedDiff
        ? {
              selectedDiff,
              resolvedSelectedPath,
              milestonesOnly,
              checkpointsCount: checkpoints.length,
              cleanupPreviewOpen,
              onToggleMilestonesOnly: () => {
                  setMilestonesOnly((current) => !current);
              },
              onToggleCleanupPreview: () => {
                  if (!selectedSessionId) {
                      return;
                  }

                  setCleanupPreviewOpen((current) => !current);
              },
              onPrefetchPatch: prefetchPatch,
              onSelectPath: setPreferredPath,
          }
        : undefined;

    const maintenanceActionsProps: CheckpointMaintenanceActionsProps = {
        visibleCheckpoints,
        checkpointStorage,
        selectedSessionId,
        disabled,
        cleanupPreviewOpen,
        forceCompactPending: forceCompactMutation.isPending,
        applyCleanupPending: applyCleanupMutation.isPending,
        rollbackPending: rollbackMutation.isPending,
        revertChangesetPending: revertChangesetMutation.isPending,
        promoteMilestonePending: promoteMilestoneMutation.isPending,
        renameMilestonePending: renameMilestoneMutation.isPending,
        deleteMilestonePending: deleteMilestoneMutation.isPending,
        confirmRollbackId,
        rollbackTargetId,
        milestoneDrafts,
        profileId,
        onToggleCheckpointActions: (checkpointId) => {
            setFeedbackMessage(undefined);
            setConfirmRollbackId((current) => (current === checkpointId ? undefined : checkpointId));
        },
        onCloseCheckpointActions: () => {
            setConfirmRollbackId(undefined);
        },
        onMilestoneDraftChange: (checkpointId, value) => {
            setMilestoneDrafts((current) => ({
                ...current,
                [checkpointId]: value,
            }));
        },
        onRestoreCheckpoint: (checkpointId) => {
            void handleRestoreCheckpoint(checkpointId);
        },
        onRevertChangeset: (checkpointId) => {
            void handleRevertChangeset(checkpointId);
        },
        onPromoteMilestone: (checkpointId, title) => {
            void handlePromoteMilestone(checkpointId, title);
        },
        onRenameMilestone: (checkpointId, title) => {
            void handleRenameMilestone(checkpointId, title);
        },
        onDeleteMilestone: (checkpointId) => {
            void handleDeleteMilestone(checkpointId);
        },
        onToggleCleanupPreview: () => {
            setCleanupPreviewOpen((current) => !current);
        },
        onApplyCleanup: () => {
            void handleApplyCleanup();
        },
        onForceCompact: () => {
            void handleForceCompact();
        },
    };

    return {
        selectedDiff,
        feedbackMessage,
        milestoneTitle,
        isSavingMilestone: createMilestoneMutation.isPending,
        onMilestoneTitleChange: setMilestoneTitle,
        onSaveMilestone: () => {
            void handleSaveMilestone();
        },
        changedFilesSectionProps,
        maintenanceActionsProps,
        diffPatchPreviewProps: {
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
        },
    };
}

