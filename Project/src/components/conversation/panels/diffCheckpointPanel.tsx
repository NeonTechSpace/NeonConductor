import { startTransition, useEffect, useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
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
    selectedRunId?: string;
    selectedSessionId?: string;
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
    const firstSelectablePath = selectedDiff?.artifact.kind === 'git' ? selectedDiff.artifact.files[0]?.path : undefined;
    const [selectedPath, setSelectedPath] = useState<string | undefined>(firstSelectablePath);
    const [confirmRollbackId, setConfirmRollbackId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const [rollbackTargetId, setRollbackTargetId] = useState<CheckpointRecord['id'] | undefined>(undefined);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const utils = trpc.useUtils();
    const patchQuery = trpc.diff.getFilePatch.useQuery(
        selectedDiff && selectedPath
            ? {
                  profileId,
                  diffId: selectedDiff.id,
                  path: selectedPath,
              }
            : {
                  profileId,
                  diffId: 'diff_missing',
                  path: 'missing',
              },
        {
            enabled: Boolean(selectedDiff && selectedPath),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const openPathMutation = trpc.system.openPath.useMutation();
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

    useEffect(() => {
        setSelectedPath(firstSelectablePath);
    }, [firstSelectablePath, selectedDiff?.id]);

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
                                                            selectedPath === file.path
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
                                                                setSelectedPath(file.path);
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
                                <span className='text-muted-foreground text-xs'>{String(checkpoints.length)} saved</span>
                            </header>
                            <div className='max-h-72 overflow-y-auto p-2'>
                                {checkpoints.length === 0 ? (
                                    <p className='text-muted-foreground rounded-xl border border-dashed p-3 text-sm'>
                                        No checkpoints for this session yet.
                                    </p>
                                ) : (
                                    <div className='space-y-2'>
                                        {checkpoints.map((checkpoint) => (
                                            <div key={checkpoint.id} className='border-border rounded-md border p-3'>
                                                <div className='flex items-start justify-between gap-3'>
                                                    <div className='min-w-0'>
                                                        <p className='text-sm font-medium'>{checkpoint.summary}</p>
                                                        <p className='text-muted-foreground text-xs'>
                                                            {checkpoint.topLevelTab}.{checkpoint.modeKey} · {checkpoint.runId}
                                                        </p>
                                                    </div>
                                                    <Button
                                                        type='button'
                                                        size='sm'
                                                        className='h-11'
                                                        disabled={disabled || rollbackMutation.isPending}
                                                        onClick={() => {
                                                            setFeedbackMessage(undefined);
                                                            setConfirmRollbackId((current) =>
                                                                current === checkpoint.id ? undefined : checkpoint.id
                                                            );
                                                        }}>
                                                        {rollbackMutation.isPending && rollbackTargetId === checkpoint.id
                                                            ? 'Rolling Back…'
                                                            : confirmRollbackId === checkpoint.id
                                                              ? 'Cancel'
                                                              : 'Rollback'}
                                                    </Button>
                                                </div>
                                                {confirmRollbackId === checkpoint.id ? (
                                                    <div className='border-border bg-background/60 mt-3 rounded-md border p-3'>
                                                        <p className='text-sm'>
                                                            Roll back this workspace to <span className='font-medium'>{checkpoint.id}</span>?
                                                        </p>
                                                        <p className='text-muted-foreground mt-1 text-xs'>
                                                            This resets tracked and untracked files inside the active workspace.
                                                        </p>
                                                        <div className='mt-3 flex flex-wrap gap-2'>
                                                            <Button
                                                                type='button'
                                                                size='sm'
                                                                className='h-11'
                                                                disabled={rollbackMutation.isPending}
                                                                onClick={() => {
                                                                    setRollbackTargetId(checkpoint.id);
                                                                    setFeedbackMessage(undefined);
                                                                    void rollbackMutation.mutateAsync({
                                                                        profileId,
                                                                        checkpointId: checkpoint.id,
                                                                        confirm: true,
                                                                    });
                                                                }}>
                                                                Confirm Rollback
                                                            </Button>
                                                            <Button
                                                                type='button'
                                                                size='sm'
                                                                variant='outline'
                                                                className='h-11'
                                                                disabled={rollbackMutation.isPending}
                                                                onClick={() => {
                                                                    setConfirmRollbackId(undefined);
                                                                }}>
                                                                Keep Current State
                                                            </Button>
                                                        </div>
                                                    </div>
                                                ) : null}
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </section>
                    </div>

                    <section className='border-border rounded-lg border'>
                        <header className='border-border bg-background/60 flex min-h-11 items-center justify-between gap-3 border-b px-3'>
                            <div className='min-w-0'>
                                <p className='truncate text-sm font-medium'>{selectedPath ?? 'Patch Preview'}</p>
                                <p className='text-muted-foreground text-xs'>
                                    {patchQuery.data?.found ? 'Unified diff preview' : selectedDiff.summary}
                                </p>
                            </div>
                            {selectedDiff.artifact.kind === 'git' && selectedPath ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    className='h-11'
                                    disabled={openPathMutation.isPending}
                                    onClick={() => {
                                        void openPathMutation.mutateAsync({
                                            path: `${selectedDiff.artifact.workspaceRootPath}\\${selectedPath.replaceAll('/', '\\')}`,
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
