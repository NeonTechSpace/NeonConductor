import { WorkbenchRowShell } from '@/web/components/conversation/messages/workbenchRowPrimitives';
import {
    formatDiffLineDelta,
    formatDiffStatusLabel,
    statusCountEntries,
} from '@/web/components/conversation/panels/workbenchDiffModel';

import type { DiffOverview } from '@/shared/contracts';

export function WorkbenchDiffSummaryRow({ overview }: { overview: DiffOverview }) {
    if (overview.kind === 'unsupported') {
        return (
            <WorkbenchRowShell
                id={`diff-unsupported-${overview.reason}`}
                icon='diff'
                severity='warning'
                title={overview.summary}
                summary={overview.detail}
                defaultCollapsed={false}>
                <p>{overview.detail}</p>
            </WorkbenchRowShell>
        );
    }

    return (
        <WorkbenchRowShell
            id='diff-summary'
            icon='diff'
            severity='info'
            title='Diff summary'
            summary={overview.summary}
            defaultCollapsed={false}
            meta={<span>{String(overview.fileCount)} files</span>}>
            <div className='grid gap-2 md:grid-cols-3'>
                <div className='border-border bg-background/70 rounded-lg border px-3 py-3'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Files</p>
                    <p className='mt-2 text-sm font-semibold'>{String(overview.fileCount)} changed</p>
                    <p className='text-muted-foreground mt-1 text-xs'>{overview.summary}</p>
                </div>
                <div className='border-border bg-background/70 rounded-lg border px-3 py-3'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Lines</p>
                    <p className='mt-2 text-sm font-semibold'>
                        {formatDiffLineDelta('added', overview.totalAddedLines) ?? 'No additions'}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        {formatDiffLineDelta('deleted', overview.totalDeletedLines) ?? 'No deletions'}
                    </p>
                </div>
                <div className='border-border bg-background/70 rounded-lg border px-3 py-3'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Directories
                    </p>
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
        </WorkbenchRowShell>
    );
}

export function WorkbenchDiffStatusCountsRow({ overview }: { overview: Extract<DiffOverview, { kind: 'git' }> }) {
    return (
        <section className='border-border rounded-lg border'>
            <header className='border-border bg-background/60 border-b px-3 py-2'>
                <span className='text-sm font-medium'>Status Counts</span>
            </header>
            <div className='flex flex-wrap gap-2 p-3'>
                {statusCountEntries(overview).map(({ status, count }) => (
                    <span
                        key={status}
                        className='bg-secondary text-secondary-foreground rounded-full px-2.5 py-1 text-[11px] font-medium'>
                        {formatDiffStatusLabel(status)}: {String(count)}
                    </span>
                ))}
            </div>
        </section>
    );
}

export function WorkbenchFileChangeRows({ overview }: { overview: Extract<DiffOverview, { kind: 'git' }> }) {
    return (
        <section className='border-border rounded-lg border'>
            <header className='border-border bg-background/60 border-b px-3 py-2'>
                <span className='text-sm font-medium'>Highlighted Files</span>
            </header>
            <div className='space-y-2 p-3'>
                {overview.highlightedFiles.length > 0 ? (
                    overview.highlightedFiles.map((file) => (
                        <WorkbenchRowShell
                            key={file.path}
                            id={`file-change-${file.path}`}
                            icon='file'
                            severity='neutral'
                            title={file.path}
                            summary={formatDiffStatusLabel(file.status)}
                            defaultCollapsed>
                            <p>
                                {[
                                    formatDiffLineDelta('added', file.addedLines),
                                    formatDiffLineDelta('deleted', file.deletedLines),
                                ]
                                    .filter((value): value is string => Boolean(value))
                                    .join(' · ') || 'No textual line stats'}
                            </p>
                        </WorkbenchRowShell>
                    ))
                ) : (
                    <p className='text-muted-foreground text-sm'>No changed files were captured for this run.</p>
                )}
            </div>
        </section>
    );
}
