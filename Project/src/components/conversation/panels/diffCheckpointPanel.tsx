import { useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { CheckpointHistorySection } from '@/web/components/conversation/panels/diffCheckpointPanel/checkpointHistorySection';
import { ChangedFilesSection } from '@/web/components/conversation/panels/diffCheckpointPanel/changedFilesSection';
import {
    buildRollbackWarningLines,
    filterVisibleCheckpoints,
    resolveSelectedDiffPath,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord, DiffRecord } from '@/app/backend/persistence/types';
import type { CheckpointStorageSummary } from '@/app/backend/runtime/contracts';

interface DiffCheckpointPanelProps {
    profileId: string;
    selectedRunId?: CheckpointRecord['runId'];
    selectedSessionId?: CheckpointRecord['sessionId'];
    diffs: DiffRecord[];
    checkpoints: CheckpointRecord[];
    checkpointStorage?: CheckpointStorageSummary;
    disabled: boolean;
}

export function DiffCheckpointPanel({
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
    const resolvedSelectedPath = resolveSelectedDiffPath({
        selectedDiff,
        preferredPath,
    });
    const [confirmRollbackId, setConfirmRollbackId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const [rollbackTargetId, setRollbackTargetId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const [milestoneTitle, setMilestoneTitle] = useState('');
    const [milestoneDrafts, setMilestoneDrafts] = useState<Record<string, string>>({});
    const [milestonesOnly, setMilestonesOnly] = useState(false);
    const [cleanupPreviewOpen, setCleanupPreviewOpen] = useState(false);
    const selectedCheckpoint = checkpoints.find((checkpoint) => checkpoint.id === confirmRollbackId);
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
        selectedDiff && resolvedSelectedPath
            ? {
                  profileId,
                  diffId: selectedDiff.id,
                  path: resolvedSelectedPath,
              }
            : {
                  profileId,
                  diffId: 'diff_missing',
                  path: 'missing',
              },
        {
            enabled: Boolean(selectedDiff && resolvedSelectedPath),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const openPathMutation = trpc.system.openPath.useMutation();
    const rollbackPreviewQuery = trpc.checkpoint.previewRollback.useQuery(
        confirmRollbackId
            ? {
                  profileId,
                  checkpointId: confirmRollbackId,
              }
            : {
                  profileId,
                  checkpointId: 'ckpt_missing' as CheckpointRecord['id'],
              },
        {
            enabled: Boolean(confirmRollbackId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
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
                const nextDrafts = { ...current };
                if (result.checkpoint) {
                    delete nextDrafts[result.checkpoint.id];
                }
                return nextDrafts;
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
                const nextDrafts = { ...current };
                if (result.checkpoint) {
                    delete nextDrafts[result.checkpoint.id];
                }
                return nextDrafts;
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
    const cleanupPreviewQuery = trpc.checkpoint.previewCleanup.useQuery(
        selectedSessionId
            ? {
                  profileId,
                  sessionId: selectedSessionId,
              }
            : {
                  profileId,
                  sessionId: 'sess_missing' as CheckpointRecord['sessionId'],
              },
        {
            enabled: cleanupPreviewOpen && Boolean(selectedSessionId),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
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

    const patchMarkdown = patchQuery.data?.found && patchQuery.data.patch ? `\`\`\`diff\n${patchQuery.data.patch}\n\`\`\`` : '';
    const rollbackWarningState =
        rollbackPreviewQuery.data?.found && rollbackPreviewQuery.data.preview.checkpointId === confirmRollbackId
            ? buildRollbackWarningLines(rollbackPreviewQuery.data.preview)
            : null;
    const selectedPreview =
        rollbackPreviewQuery.data?.found && rollbackPreviewQuery.data.preview.checkpointId === confirmRollbackId
            ? rollbackPreviewQuery.data.preview
            : undefined;
    const visibleCheckpoints = filterVisibleCheckpoints(checkpoints, milestonesOnly);

    return (
        <section className='border-border bg-card/80 mt-3 rounded-2xl border p-4 shadow-sm'>
            <div className='flex flex-wrap items-center justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>Changes and Checkpoints</p>
                    <p className='text-muted-foreground text-xs'>
                        {selectedRunId ? `Run ${selectedRunId}` : 'Select a run to inspect code and workspace changes'}
                        {selectedSessionId ? ` · ${String(checkpoints.length)} checkpoints` : ''}
                    </p>
                </div>
            </div>
            {selectedRunId ? (
                <div className='border-border bg-background/60 mt-3 rounded-xl border p-3'>
                    <p className='text-sm font-medium'>Save Milestone</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Save the currently selected run checkpoint as a named milestone. Milestones are retained until explicitly deleted.
                    </p>
                    <div className='mt-3 flex flex-wrap gap-2'>
                        <input
                            type='text'
                            value={milestoneTitle}
                            onChange={(event) => {
                                setMilestoneTitle(event.target.value);
                            }}
                            placeholder='Milestone title'
                            className='border-border bg-background min-h-11 min-w-[16rem] flex-1 rounded-md border px-3 text-sm'
                        />
                        <Button
                            type='button'
                            className='h-11'
                            disabled={
                                disabled ||
                                !selectedRunId ||
                                milestoneTitle.trim().length === 0 ||
                                createMilestoneMutation.isPending
                            }
                            onClick={() => {
                                if (!selectedRunId || milestoneTitle.trim().length === 0) {
                                    return;
                                }

                                setFeedbackMessage(undefined);
                                void createMilestoneMutation.mutateAsync({
                                    profileId,
                                    runId: selectedRunId,
                                    milestoneTitle: milestoneTitle.trim(),
                                });
                            }}>
                            {createMilestoneMutation.isPending ? 'Saving…' : 'Save Milestone'}
                        </Button>
                    </div>
                </div>
            ) : null}
            {feedbackMessage ? (
                <div aria-live='polite' className='mt-3 rounded-xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
                    {feedbackMessage}
                </div>
            ) : null}

            {selectedDiff ? (
                <div className='mt-3 grid gap-3 lg:grid-cols-[minmax(0,280px)_1fr]'>
                    <div className='space-y-3'>
                        <ChangedFilesSection
                            selectedDiff={selectedDiff}
                            resolvedSelectedPath={resolvedSelectedPath}
                            milestonesOnly={milestonesOnly}
                            checkpointsCount={checkpoints.length}
                            cleanupPreviewOpen={cleanupPreviewOpen}
                            onToggleMilestonesOnly={() => {
                                setMilestonesOnly((current) => !current);
                            }}
                            onToggleCleanupPreview={() => {
                                if (!selectedSessionId) {
                                    return;
                                }

                                setCleanupPreviewOpen((current) => !current);
                            }}
                            onPrefetchPatch={prefetchPatch}
                            onSelectPath={setPreferredPath}
                        />

                        <CheckpointHistorySection
                            visibleCheckpoints={visibleCheckpoints}
                            checkpointStorage={checkpointStorage}
                            selectedSessionId={selectedSessionId}
                            disabled={disabled}
                            cleanupPreviewOpen={cleanupPreviewOpen}
                            cleanupPreviewPending={cleanupPreviewQuery.isPending}
                            cleanupPreviewData={cleanupPreviewQuery.data}
                            forceCompactPending={forceCompactMutation.isPending}
                            applyCleanupPending={applyCleanupMutation.isPending}
                            rollbackPending={rollbackMutation.isPending}
                            revertChangesetPending={revertChangesetMutation.isPending}
                            promoteMilestonePending={promoteMilestoneMutation.isPending}
                            renameMilestonePending={renameMilestoneMutation.isPending}
                            deleteMilestonePending={deleteMilestoneMutation.isPending}
                            confirmRollbackId={confirmRollbackId}
                            rollbackTargetId={rollbackTargetId}
                            milestoneDrafts={milestoneDrafts}
                            rollbackPreviewPending={rollbackPreviewQuery.isPending && selectedCheckpoint?.id === confirmRollbackId}
                            rollbackWarningState={rollbackWarningState}
                            selectedPreview={selectedPreview}
                            onToggleCheckpointActions={(checkpointId) => {
                                setFeedbackMessage(undefined);
                                setConfirmRollbackId((current) => (current === checkpointId ? undefined : checkpointId));
                            }}
                            onCloseCheckpointActions={() => {
                                setConfirmRollbackId(undefined);
                            }}
                            onMilestoneDraftChange={(checkpointId, value) => {
                                setMilestoneDrafts((current) => ({
                                    ...current,
                                    [checkpointId]: value,
                                }));
                            }}
                            onRestoreCheckpoint={(checkpointId) => {
                                setRollbackTargetId(checkpointId);
                                setFeedbackMessage(undefined);
                                void rollbackMutation.mutateAsync({
                                    profileId,
                                    checkpointId,
                                    confirm: true,
                                });
                            }}
                            onRevertChangeset={(checkpointId) => {
                                setRollbackTargetId(checkpointId);
                                setFeedbackMessage(undefined);
                                void revertChangesetMutation.mutateAsync({
                                    profileId,
                                    checkpointId,
                                    confirm: true,
                                });
                            }}
                            onPromoteMilestone={(checkpointId, title) => {
                                if (title.length === 0) {
                                    return;
                                }

                                setFeedbackMessage(undefined);
                                void promoteMilestoneMutation.mutateAsync({
                                    profileId,
                                    checkpointId,
                                    milestoneTitle: title,
                                });
                            }}
                            onRenameMilestone={(checkpointId, title) => {
                                if (title.length === 0) {
                                    return;
                                }

                                setFeedbackMessage(undefined);
                                void renameMilestoneMutation.mutateAsync({
                                    profileId,
                                    checkpointId,
                                    milestoneTitle: title,
                                });
                            }}
                            onDeleteMilestone={(checkpointId) => {
                                setFeedbackMessage(undefined);
                                void deleteMilestoneMutation.mutateAsync({
                                    profileId,
                                    checkpointId,
                                    confirm: true,
                                });
                            }}
                            onToggleCleanupPreview={() => {
                                setCleanupPreviewOpen((current) => !current);
                            }}
                            onApplyCleanup={() => {
                                if (!selectedSessionId) {
                                    return;
                                }

                                setFeedbackMessage(undefined);
                                void applyCleanupMutation.mutateAsync({
                                    profileId,
                                    sessionId: selectedSessionId,
                                    confirm: true,
                                });
                            }}
                            onForceCompact={() => {
                                if (!selectedSessionId) {
                                    return;
                                }

                                setFeedbackMessage(undefined);
                                void forceCompactMutation.mutateAsync({
                                    profileId,
                                    sessionId: selectedSessionId,
                                    confirm: true,
                                });
                            }}
                        />
                    </div>

                    <section className='border-border rounded-lg border'>
                        <header className='border-border bg-background/60 flex min-h-11 items-center justify-between gap-3 border-b px-3'>
                            <div className='min-w-0'>
                                <p className='truncate text-sm font-medium'>{resolvedSelectedPath ?? 'Patch Preview'}</p>
                                <p className='text-muted-foreground text-xs'>
                                    {patchQuery.data?.found ? 'Unified diff preview' : selectedDiff.summary}
                                </p>
                            </div>
                            {selectedDiff.artifact.kind === 'git' && resolvedSelectedPath ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    className='h-11'
                                    disabled={openPathMutation.isPending}
                                    onClick={() => {
                                        void openPathMutation.mutateAsync({
                                            path: `${selectedDiff.artifact.workspaceRootPath}\\${resolvedSelectedPath.replaceAll('/', '\\')}`,
                                        });
                                    }}>
                                    Open in Editor
                                </Button>
                            ) : null}
                        </header>
                        <div className='max-h-[32rem] overflow-auto p-3'>
                            {patchQuery.isPending ? (
                                <p className='text-muted-foreground text-sm'>Loading patch…</p>
                            ) : patchQuery.data?.found ? (
                                <>
                                    {patchQuery.isFetching ? (
                                        <p className='text-muted-foreground mb-3 text-xs'>Updating patch preview…</p>
                                    ) : null}
                                    <MarkdownContent markdown={patchMarkdown} />
                                </>
                            ) : selectedDiff.artifact.kind === 'git' ? (
                                <p className='text-muted-foreground rounded-xl border border-dashed px-4 py-5 text-sm'>
                                    Select a changed file to inspect its patch.
                                </p>
                            ) : (
                                <p className='text-muted-foreground text-sm'>{selectedDiff.artifact.detail}</p>
                            )}
                        </div>
                    </section>
                </div>
            ) : (
                <p className='text-muted-foreground mt-3 rounded-xl border border-dashed px-4 py-5 text-sm'>
                    No diff artifact is available for the selected run yet.
                </p>
            )}
        </section>
    );
}
