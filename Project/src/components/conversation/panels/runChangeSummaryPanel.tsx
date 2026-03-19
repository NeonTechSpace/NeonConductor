import { Button } from '@/web/components/ui/button';

import type { DiffFileArtifact } from '@/app/backend/persistence/types';

import type { DiffOverview } from '@/shared/contracts';

const diffStatuses: ReadonlyArray<DiffFileArtifact['status']> = [
    'added',
    'modified',
    'deleted',
    'renamed',
    'copied',
    'type_changed',
    'untracked',
];

function formatLineDelta(label: string, value: number | undefined): string | null {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return null;
    }

    return `${String(value)} ${label}`;
}

function formatStatusLabel(status: DiffFileArtifact['status']): string {
    if (status === 'type_changed') {
        return 'type';
    }

    return status;
}

function formatDirectoryDetail(input: { fileCount: number; addedLines?: number; deletedLines?: number }): string {
    const deltas = [formatLineDelta('added', input.addedLines), formatLineDelta('deleted', input.deletedLines)].filter(
        (value): value is string => Boolean(value)
    );
    return deltas.length > 0 ? `${String(input.fileCount)} files · ${deltas.join(' · ')}` : `${String(input.fileCount)} files`;
}

function statusCountEntries(
    overview: Extract<DiffOverview, { kind: 'git' }>
): Array<{ status: DiffFileArtifact['status']; count: number }> {
    return diffStatuses
        .map((status) => ({
            status,
            count: overview.statusCounts[status],
        }))
        .filter((entry) => entry.count > 0);
}

interface RunChangeSummaryPanelProps {
    selectedRunId?: string;
    overview?: DiffOverview;
    onJumpToDiffs?: () => void;
}

export function RunChangeSummaryPanel({ selectedRunId, overview, onJumpToDiffs }: RunChangeSummaryPanelProps) {
    if (!selectedRunId) {
        return null;
    }

    return (
        <section className='border-border bg-card/70 mb-3 rounded-xl border p-3 shadow-sm'>
            <div className='flex items-center justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>Run Change Summary</p>
                    <p className='text-muted-foreground text-xs'>{selectedRunId}</p>
                </div>
                {overview && onJumpToDiffs ? (
                    <Button type='button' size='sm' variant='outline' className='h-9' onClick={onJumpToDiffs}>
                        Open Diffs
                    </Button>
                ) : null}
            </div>

            {!overview ? (
                <p className='text-muted-foreground mt-3 text-sm'>No diff artifact is available for this run yet.</p>
            ) : overview.kind === 'unsupported' ? (
                <div className='mt-3 space-y-1'>
                    <p className='text-sm font-medium'>{overview.summary}</p>
                    <p className='text-muted-foreground text-xs'>{overview.detail}</p>
                </div>
            ) : (
                <div className='mt-3 space-y-3'>
                    <div className='grid gap-2 md:grid-cols-3'>
                        <div className='border-border bg-background/70 rounded-lg border px-3 py-3'>
                            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Files</p>
                            <p className='mt-2 text-sm font-semibold'>{String(overview.fileCount)} changed</p>
                            <p className='text-muted-foreground mt-1 text-xs'>{overview.summary}</p>
                        </div>
                        <div className='border-border bg-background/70 rounded-lg border px-3 py-3'>
                            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Lines</p>
                            <p className='mt-2 text-sm font-semibold'>
                                {formatLineDelta('added', overview.totalAddedLines) ?? 'No additions'}
                            </p>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                {formatLineDelta('deleted', overview.totalDeletedLines) ?? 'No deletions'}
                            </p>
                        </div>
                        <div className='border-border bg-background/70 rounded-lg border px-3 py-3'>
                            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Directories</p>
                            <p className='mt-2 text-sm font-semibold'>
                                {overview.topDirectories[0]?.directory ?? 'No directory summary'}
                            </p>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                {overview.topDirectories[0]
                                    ? `${String(overview.topDirectories[0].fileCount)} files touched`
                                    : 'Waiting for directory stats'}
                            </p>
                        </div>
                    </div>

                    <div className='grid gap-3 lg:grid-cols-[minmax(0,240px)_1fr]'>
                        <section className='border-border rounded-lg border'>
                            <header className='border-border bg-background/60 border-b px-3 py-2'>
                                <span className='text-sm font-medium'>Status Counts</span>
                            </header>
                            <div className='flex flex-wrap gap-2 p-3'>
                                {statusCountEntries(overview).map(({ status, count }) => (
                                        <span
                                            key={status}
                                            className='bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-[11px] font-medium'>
                                            {formatStatusLabel(status)}: {String(count)}
                                        </span>
                                    ))}
                            </div>
                        </section>

                        <section className='border-border rounded-lg border'>
                            <header className='border-border bg-background/60 border-b px-3 py-2'>
                                <span className='text-sm font-medium'>Highlighted Files</span>
                            </header>
                            <div className='space-y-2 p-3'>
                                {overview.highlightedFiles.length > 0 ? (
                                    overview.highlightedFiles.map((file) => (
                                        <div key={file.path} className='border-border bg-background/60 rounded-md border px-3 py-2'>
                                            <div className='flex items-center justify-between gap-3'>
                                                <span className='truncate font-mono text-[12px]'>{file.path}</span>
                                                <span className='text-muted-foreground shrink-0 text-[11px] uppercase'>
                                                    {formatStatusLabel(file.status)}
                                                </span>
                                            </div>
                                            <p className='text-muted-foreground mt-1 text-xs'>
                                                {[
                                                    formatLineDelta('added', file.addedLines),
                                                    formatLineDelta('deleted', file.deletedLines),
                                                ]
                                                    .filter((value): value is string => Boolean(value))
                                                    .join(' · ') || 'No textual line stats'}
                                            </p>
                                        </div>
                                    ))
                                ) : (
                                    <p className='text-muted-foreground text-sm'>No changed files were captured for this run.</p>
                                )}
                            </div>
                        </section>
                    </div>

                    {overview.topDirectories.length > 0 ? (
                        <section className='border-border rounded-lg border'>
                            <header className='border-border bg-background/60 border-b px-3 py-2'>
                                <span className='text-sm font-medium'>Top Directories</span>
                            </header>
                            <div className='space-y-2 p-3'>
                                {overview.topDirectories.map((directory) => (
                                    <div key={directory.directory} className='flex items-center justify-between gap-3 text-sm'>
                                        <span className='font-mono text-[12px]'>{directory.directory}</span>
                                        <span className='text-muted-foreground text-xs'>{formatDirectoryDetail(directory)}</span>
                                    </div>
                                ))}
                            </div>
                        </section>
                    ) : null}
                </div>
            )}
        </section>
    );
}

