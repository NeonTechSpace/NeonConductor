import { startTransition, useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import {
    buildRollbackWarningLines,
    describeRetentionDisposition,
    filterVisibleCheckpoints,
    resolveSelectedDiffPath,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';
import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { CheckpointRecord, DiffFileArtifact, DiffRecord } from '@/app/backend/persistence/types';

function groupFilesByDirectory(files: DiffFileArtifact[]): Array<{ directory: string; files: DiffFileArtifact[] }> {
    const groups = new Map<string, DiffFileArtifact[]>();
    for (const file of files) {
        const parts = file.path.split('/');
        const directory = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
        const existing = groups.get(directory) ?? [];
        existing.push(file);
        groups.set(directory, existing);
    }

    return [...groups.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([directory, directoryFiles]) => ({
            directory,
            files: [...directoryFiles].sort((left, right) => left.path.localeCompare(right.path)),
        }));
}

function statusLabel(status: DiffFileArtifact['status']): string {
    if (status === 'type_changed') {
        return 'type';
    }

    return status;
}

interface DiffCheckpointPanelProps {
    profileId: string;
    selectedRunId?: CheckpointRecord['runId'];
    selectedSessionId?: CheckpointRecord['sessionId'];
    diffs: DiffRecord[];
    checkpoints: CheckpointRecord[];
    disabled: boolean;
}

export function DiffCheckpointPanel({
    profileId,
    selectedRunId,
    selectedSessionId,
    diffs,
    checkpoints,
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
        onSuccess: (result) => {
            if (!result.rolledBack) {
                setFeedbackMessage(result.message ?? 'Rollback could not be completed.');
                return;
            }

            setFeedbackMessage('Checkpoint rollback completed.');
            setConfirmRollbackId(undefined);
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
        onSuccess: (result) => {
            if (!result.reverted) {
                setFeedbackMessage(result.message ?? 'Changeset revert could not be completed.');
                return;
            }

            setFeedbackMessage('Changeset revert completed.');
            setConfirmRollbackId(undefined);
        },
        onError: (error) => {
            setFeedbackMessage(error.message);
        },
        onSettled: () => {
            setRollbackTargetId(undefined);
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
    const fileGroups = selectedDiff?.artifact.kind === 'git' ? groupFilesByDirectory(selectedDiff.artifact.files) : [];
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
                        <section className='border-border rounded-lg border'>
                            <header className='border-border bg-background/60 flex min-h-11 items-center justify-between border-b px-3'>
                                <span className='text-sm font-medium'>Changed Files</span>
                                <span className='text-muted-foreground text-xs'>
                                    {selectedDiff.artifact.kind === 'git'
                                        ? `${String(selectedDiff.artifact.fileCount)} files`
                                        : 'Unavailable'}
                                </span>
                            </header>
                            {selectedDiff.artifact.kind === 'git' ? (
                                <div className='max-h-72 overflow-y-auto p-2'>
                                    {fileGroups.map((group) => (
                                        <div key={group.directory} className='mb-3 last:mb-0'>
                                            <p className='text-muted-foreground px-1 pb-1 font-mono text-[11px] uppercase tracking-[0.12em]'>
                                                {group.directory}
                                            </p>
                                            <div className='space-y-1'>
                                                {group.files.map((file) => (
                                                    <button
                                                        key={file.path}
                                                        type='button'
                                                        className={`focus-visible:ring-ring flex min-h-11 w-full items-center justify-between rounded-md border px-3 text-left text-sm focus-visible:ring-2 ${
                                                            resolvedSelectedPath === file.path
                                                                ? 'border-primary bg-primary/10'
                                                                : 'border-border bg-background/60 hover:bg-accent'
                                                        }`}
                                                        onMouseEnter={() => {
                                                            prefetchPatch(file.path);
                                                        }}
                                                        onFocus={() => {
                                                            prefetchPatch(file.path);
                                                        }}
                                                        onClick={() => {
                                                            startTransition(() => {
                                                                setPreferredPath(file.path);
                                                            });
                                                        }}>
                                                        <span className='truncate font-mono text-[12px]'>{file.path}</span>
                                                        <span className='text-muted-foreground ml-3 shrink-0 text-[11px] uppercase'>
                                                            {statusLabel(file.status)}
                                                        </span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className='p-3 text-sm'>
                                    <p className='font-medium'>{selectedDiff.summary}</p>
                                    <p className='text-muted-foreground mt-1 text-xs'>{selectedDiff.artifact.detail}</p>
                                </div>
                            )}
                        </section>

                        <section className='border-border rounded-lg border'>
                            <header className='border-border bg-background/60 flex min-h-11 items-center justify-between border-b px-3'>
                                <span className='text-sm font-medium'>Checkpoints</span>
                                <div className='flex items-center gap-2'>
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant={milestonesOnly ? 'default' : 'outline'}
                                        className='h-9'
                                        onClick={() => {
                                            setMilestonesOnly((current) => !current);
                                        }}>
                                        Milestones Only
                                    </Button>
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        className='h-9'
                                        disabled={!selectedSessionId}
                                        onClick={() => {
                                            setCleanupPreviewOpen((current) => !current);
                                        }}>
                                        {cleanupPreviewOpen ? 'Hide Cleanup' : 'Review Cleanup'}
                                    </Button>
                                    <span className='text-muted-foreground text-xs'>{String(checkpoints.length)} saved</span>
                                </div>
                            </header>
                            <div className='max-h-72 overflow-y-auto p-2'>
                                {visibleCheckpoints.length === 0 ? (
                                    <p className='text-muted-foreground rounded-xl border border-dashed p-3 text-sm'>
                                        {milestonesOnly ? 'No milestones for this session yet.' : 'No checkpoints for this session yet.'}
                                    </p>
                                ) : (
                                    <div className='space-y-2'>
                                        {visibleCheckpoints.map((checkpoint) => (
                                            <div key={checkpoint.id} className='border-border rounded-md border p-3'>
                                                <div className='flex items-start justify-between gap-3'>
                                                    <div className='min-w-0'>
                                                        <div className='flex flex-wrap items-center gap-2'>
                                                            <p className='text-sm font-medium'>{checkpoint.summary}</p>
                                                            {checkpoint.checkpointKind === 'named' ? (
                                                                <span className='rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary'>
                                                                    Milestone
                                                                </span>
                                                            ) : null}
                                                            {describeRetentionDisposition(checkpoint.retentionDisposition) ? (
                                                                <span className='rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground'>
                                                                    {describeRetentionDisposition(checkpoint.retentionDisposition)}
                                                                </span>
                                                            ) : null}
                                                        </div>
                                                        <p className='text-muted-foreground text-xs'>
                                                            {checkpoint.topLevelTab}.{checkpoint.modeKey} · {checkpoint.runId}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        type='button'
                                                        size='sm'
                                                        className='h-11'
                                                        disabled={disabled || rollbackMutation.isPending || revertChangesetMutation.isPending}
                                                        onClick={() => {
                                                            setFeedbackMessage(undefined);
                                                            setConfirmRollbackId((current) =>
                                                                current === checkpoint.id ? undefined : checkpoint.id
                                                            );
                                                        }}>
                                                        {rollbackMutation.isPending && rollbackTargetId === checkpoint.id
                                                            ? 'Restoring…'
                                                            : revertChangesetMutation.isPending && rollbackTargetId === checkpoint.id
                                                              ? 'Reverting…'
                                                            : confirmRollbackId === checkpoint.id
                                                              ? 'Cancel'
                                                              : 'Actions'}
                                                    </Button>
                                                </div>
                                                {confirmRollbackId === checkpoint.id ? (
                                                    <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
                                                        <p className='text-sm'>
                                                            Choose how to go back from <span className='font-medium'>{checkpoint.id}</span>.
                                                        </p>
                                                        <p className='text-muted-foreground mt-1 text-xs'>
                                                            Backend guidance is based on the current shared-target risk for{' '}
                                                            <span className='font-medium'>{checkpoint.executionTargetLabel}</span>.
                                                        </p>
                                                        <div className='mt-2 space-y-1 text-xs'>
                                                            <p className='text-muted-foreground'>
                                                                Target: {checkpoint.executionTargetKind} · {checkpoint.executionTargetKey}
                                                            </p>
                                                            <p className='text-muted-foreground'>
                                                                Snapshot: {String(checkpoint.snapshotFileCount)} files
                                                            </p>
                                                            {selectedPreview?.changeset ? (
                                                                <p className='text-muted-foreground'>
                                                                    Changeset: {selectedPreview.changeset.summary}
                                                                </p>
                                                            ) : null}
                                                            {rollbackPreviewQuery.isPending && selectedCheckpoint?.id === checkpoint.id ? (
                                                                <p className='text-muted-foreground'>Checking whether other chats share this target…</p>
                                                            ) : null}
                                                            {rollbackWarningState ? (
                                                                <>
                                                                    {rollbackWarningState.lines.map((line) => (
                                                                        <p
                                                                            key={line}
                                                                            className={
                                                                                rollbackWarningState.tone === 'warning'
                                                                                    ? 'text-destructive'
                                                                                    : 'text-emerald-700 dark:text-emerald-400'
                                                                            }>
                                                                            {line}
                                                                        </p>
                                                                    ))}
                                                                </>
                                                            ) : null}
                                                        </div>
                                                        <div className='mt-3 flex flex-wrap gap-2'>
                                                            <Button
                                                                type='button'
                                                                size='sm'
                                                                variant={
                                                                    selectedPreview?.recommendedAction === 'restore_checkpoint'
                                                                        ? 'default'
                                                                        : 'outline'
                                                                }
                                                                className='h-11'
                                                                disabled={
                                                                    rollbackMutation.isPending ||
                                                                    revertChangesetMutation.isPending ||
                                                                    rollbackPreviewQuery.isPending
                                                                }
                                                                onClick={() => {
                                                                    setRollbackTargetId(checkpoint.id);
                                                                    setFeedbackMessage(undefined);
                                                                    void rollbackMutation.mutateAsync({
                                                                        profileId,
                                                                        checkpointId: checkpoint.id,
                                                                        confirm: true,
                                                                    });
                                                                }}>
                                                                {rollbackMutation.isPending && rollbackTargetId === checkpoint.id
                                                                    ? 'Restoring…'
                                                                    : 'Restore Checkpoint'}
                                                            </Button>
                                                            {selectedPreview?.hasChangeset ? (
                                                                <Button
                                                                    type='button'
                                                                    size='sm'
                                                                    variant={
                                                                        selectedPreview.recommendedAction === 'revert_changeset'
                                                                            ? 'default'
                                                                            : 'outline'
                                                                    }
                                                                    className='h-11'
                                                                    disabled={
                                                                        rollbackMutation.isPending ||
                                                                        revertChangesetMutation.isPending ||
                                                                        rollbackPreviewQuery.isPending ||
                                                                        !selectedPreview.canRevertSafely
                                                                    }
                                                                    onClick={() => {
                                                                        setRollbackTargetId(checkpoint.id);
                                                                        setFeedbackMessage(undefined);
                                                                        void revertChangesetMutation.mutateAsync({
                                                                            profileId,
                                                                            checkpointId: checkpoint.id,
                                                                            confirm: true,
                                                                        });
                                                                    }}>
                                                                    {revertChangesetMutation.isPending &&
                                                                    rollbackTargetId === checkpoint.id
                                                                        ? 'Reverting…'
                                                                        : 'Revert Changeset'}
                                                                </Button>
                                                            ) : null}
                                                            <Button
                                                                type='button'
                                                                size='sm'
                                                                variant='outline'
                                                                className='h-11'
                                                                disabled={rollbackMutation.isPending || revertChangesetMutation.isPending}
                                                                onClick={() => {
                                                                    setConfirmRollbackId(undefined);
                                                                }}>
                                                                Keep Current State
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                                <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
                                                    <p className='text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground'>
                                                        {checkpoint.checkpointKind === 'named' ? 'Milestone' : 'Promote to Milestone'}
                                                    </p>
                                                    <div className='mt-2 flex flex-wrap gap-2'>
                                                        <input
                                                            type='text'
                                                            value={milestoneDrafts[checkpoint.id] ?? checkpoint.milestoneTitle ?? ''}
                                                            onChange={(event) => {
                                                                const nextTitle = event.target.value;
                                                                setMilestoneDrafts((current) => ({
                                                                    ...current,
                                                                    [checkpoint.id]: nextTitle,
                                                                }));
                                                            }}
                                                            placeholder='Milestone title'
                                                            className='border-border bg-background min-h-11 min-w-[14rem] flex-1 rounded-md border px-3 text-sm'
                                                        />
                                                        {checkpoint.checkpointKind === 'named' ? (
                                                            <>
                                                                <Button
                                                                    type='button'
                                                                    size='sm'
                                                                    className='h-11'
                                                                    disabled={
                                                                        renameMilestoneMutation.isPending ||
                                                                        (milestoneDrafts[checkpoint.id] ?? checkpoint.milestoneTitle ?? '').trim()
                                                                            .length === 0
                                                                    }
                                                                    onClick={() => {
                                                                        const nextTitle = (
                                                                            milestoneDrafts[checkpoint.id] ??
                                                                            checkpoint.milestoneTitle ??
                                                                            ''
                                                                        ).trim();
                                                                        if (nextTitle.length === 0) {
                                                                            return;
                                                                        }

                                                                        setFeedbackMessage(undefined);
                                                                        void renameMilestoneMutation.mutateAsync({
                                                                            profileId,
                                                                            checkpointId: checkpoint.id,
                                                                            milestoneTitle: nextTitle,
                                                                        });
                                                                    }}>
                                                                    {renameMilestoneMutation.isPending ? 'Renaming…' : 'Rename Milestone'}
                                                                </Button>
                                                                <Button
                                                                    type='button'
                                                                    size='sm'
                                                                    variant='outline'
                                                                    className='h-11'
                                                                    disabled={deleteMilestoneMutation.isPending}
                                                                    onClick={() => {
                                                                        setFeedbackMessage(undefined);
                                                                        void deleteMilestoneMutation.mutateAsync({
                                                                            profileId,
                                                                            checkpointId: checkpoint.id,
                                                                            confirm: true,
                                                                        });
                                                                    }}>
                                                                    {deleteMilestoneMutation.isPending ? 'Deleting…' : 'Delete Milestone'}
                                                                </Button>
                                                            </>
                                                        ) : (
                                                            <Button
                                                                type='button'
                                                                size='sm'
                                                                className='h-11'
                                                                disabled={
                                                                    promoteMilestoneMutation.isPending ||
                                                                    (milestoneDrafts[checkpoint.id] ?? '').trim().length === 0
                                                                }
                                                                onClick={() => {
                                                                    const nextTitle = (milestoneDrafts[checkpoint.id] ?? '').trim();
                                                                    if (nextTitle.length === 0) {
                                                                        return;
                                                                    }

                                                                    setFeedbackMessage(undefined);
                                                                    void promoteMilestoneMutation.mutateAsync({
                                                                        profileId,
                                                                        checkpointId: checkpoint.id,
                                                                        milestoneTitle: nextTitle,
                                                                    });
                                                                }}>
                                                                {promoteMilestoneMutation.isPending
                                                                    ? 'Promoting…'
                                                                    : 'Promote to Milestone'}
                                                            </Button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {cleanupPreviewOpen ? (
                                <div className='border-border border-t p-3'>
                                    <p className='text-sm font-medium'>Retention Cleanup</p>
                                    <p className='text-muted-foreground mt-1 text-xs'>
                                        Cleanup affects retained checkpoint history only. It does not modify current workspace or sandbox files.
                                    </p>
                                    {cleanupPreviewQuery.isPending ? (
                                        <p className='text-muted-foreground mt-3 text-sm'>Loading cleanup preview…</p>
                                    ) : cleanupPreviewQuery.data ? (
                                        <div className='mt-3 space-y-3'>
                                            <div className='grid gap-2 text-xs text-muted-foreground sm:grid-cols-3'>
                                                <p>Milestones kept: {String(cleanupPreviewQuery.data.milestoneCount)}</p>
                                                <p>Recent checkpoints kept: {String(cleanupPreviewQuery.data.protectedRecentCount)}</p>
                                                <p>Cleanup candidates: {String(cleanupPreviewQuery.data.eligibleCount)}</p>
                                            </div>
                                            {cleanupPreviewQuery.data.candidates.length === 0 ? (
                                                <p className='text-muted-foreground text-sm'>
                                                    No cleanup-eligible checkpoints in this session.
                                                </p>
                                            ) : (
                                                <div className='max-h-48 space-y-2 overflow-y-auto'>
                                                    {cleanupPreviewQuery.data.candidates.map((candidate) => (
                                                        <div
                                                            key={candidate.checkpointId}
                                                            className='border-border rounded-md border px-3 py-2 text-xs'>
                                                            <p className='font-medium'>{candidate.summary}</p>
                                                            <p className='text-muted-foreground mt-1'>
                                                                {candidate.snapshotFileCount} snapshot files · {candidate.changesetChangeCount}{' '}
                                                                changeset entries
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            <Button
                                                type='button'
                                                size='sm'
                                                className='h-11'
                                                disabled={
                                                    applyCleanupMutation.isPending ||
                                                    !selectedSessionId ||
                                                    cleanupPreviewQuery.data.candidates.length === 0
                                                }
                                                onClick={() => {
                                                    if (!selectedSessionId) {
                                                        return;
                                                    }

                                                    setFeedbackMessage(undefined);
                                                    void applyCleanupMutation.mutateAsync({
                                                        profileId,
                                                        sessionId: selectedSessionId,
                                                        confirm: true,
                                                    });
                                                }}>
                                                {applyCleanupMutation.isPending ? 'Cleaning Up…' : 'Apply Cleanup'}
                                            </Button>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </section>
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
