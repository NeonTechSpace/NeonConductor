import { startTransition } from 'react';

import { Button } from '@/web/components/ui/button';

import type { DiffFileArtifact, DiffRecord } from '@/app/backend/persistence/types';

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

interface ChangedFilesSectionProps {
    selectedDiff: DiffRecord;
    resolvedSelectedPath: string | undefined;
    milestonesOnly: boolean;
    checkpointsCount: number;
    cleanupPreviewOpen: boolean;
    onToggleMilestonesOnly: () => void;
    onToggleCleanupPreview: () => void;
    onPrefetchPatch: (path: string) => void;
    onSelectPath: (path: string) => void;
}

export function ChangedFilesSection({
    selectedDiff,
    resolvedSelectedPath,
    milestonesOnly,
    checkpointsCount,
    cleanupPreviewOpen,
    onToggleMilestonesOnly,
    onToggleCleanupPreview,
    onPrefetchPatch,
    onSelectPath,
}: ChangedFilesSectionProps) {
    const fileGroups = selectedDiff.artifact.kind === 'git' ? groupFilesByDirectory(selectedDiff.artifact.files) : [];

    return (
        <>
            <section className='border-border rounded-lg border'>
                <header className='border-border bg-background/60 flex min-h-11 items-center justify-between border-b px-3'>
                    <span className='text-sm font-medium'>Changed Files</span>
                    <span className='text-muted-foreground text-xs'>
                        {selectedDiff.artifact.kind === 'git' ? `${String(selectedDiff.artifact.fileCount)} files` : 'Unavailable'}
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
                                                onPrefetchPatch(file.path);
                                            }}
                                            onFocus={() => {
                                                onPrefetchPatch(file.path);
                                            }}
                                            onClick={() => {
                                                startTransition(() => {
                                                    onSelectPath(file.path);
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
                        <Button type='button' size='sm' variant={milestonesOnly ? 'default' : 'outline'} className='h-9' onClick={onToggleMilestonesOnly}>
                            Milestones Only
                        </Button>
                        <Button type='button' size='sm' variant='outline' className='h-9' onClick={onToggleCleanupPreview}>
                            {cleanupPreviewOpen ? 'Hide Cleanup' : 'Review Cleanup'}
                        </Button>
                        <span className='text-muted-foreground text-xs'>{String(checkpointsCount)} saved</span>
                    </div>
                </header>
            </section>
        </>
    );
}
