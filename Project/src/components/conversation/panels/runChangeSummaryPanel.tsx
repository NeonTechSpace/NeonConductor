import { formatDiffDirectoryDetail } from '@/web/components/conversation/panels/workbenchDiffModel';
import {
    WorkbenchDiffStatusCountsRow,
    WorkbenchDiffSummaryRow,
    WorkbenchFileChangeRows,
} from '@/web/components/conversation/panels/workbenchDiffRows';
import { Button } from '@/web/components/ui/button';

import type { DiffOverview } from '@/shared/contracts';

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
                <div className='mt-3'>
                    <WorkbenchDiffSummaryRow overview={overview} />
                </div>
            ) : (
                <div className='mt-3 space-y-3'>
                    <WorkbenchDiffSummaryRow overview={overview} />

                    <div className='grid gap-3 lg:grid-cols-[minmax(0,240px)_1fr]'>
                        <WorkbenchDiffStatusCountsRow overview={overview} />
                        <WorkbenchFileChangeRows overview={overview} />
                    </div>

                    {overview.topDirectories.length > 0 ? (
                        <section className='border-border rounded-lg border'>
                            <header className='border-border bg-background/60 border-b px-3 py-2'>
                                <span className='text-sm font-medium'>Top Directories</span>
                            </header>
                            <div className='space-y-2 p-3'>
                                {overview.topDirectories.map((directory) => (
                                    <div
                                        key={directory.directory}
                                        className='flex items-center justify-between gap-3 text-sm'>
                                        <span className='font-mono text-[12px]'>{directory.directory}</span>
                                        <span className='text-muted-foreground text-xs'>
                                            {formatDiffDirectoryDetail(directory)}
                                        </span>
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
