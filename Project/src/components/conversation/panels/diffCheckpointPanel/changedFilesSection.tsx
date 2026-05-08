import { lazy, Suspense } from 'react';

import { buildDiffTreeViewModel } from '@/web/components/conversation/panels/diffViewModels';
import { Button } from '@/web/components/ui/button';

import type { DiffRecord } from '@/app/backend/persistence/types';

const PierreChangedFilesTree = lazy(async () => {
    const module = await import(
        '@/web/components/conversation/panels/diffCheckpointPanel/pierreChangedFilesTree'
    );
    return { default: module.PierreChangedFilesTree };
});

export interface ChangedFilesSectionProps {
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
    const treeViewModel = buildDiffTreeViewModel(selectedDiff);

    return (
        <>
            <section className='border-border rounded-lg border'>
                <header className='border-border bg-background/60 flex min-h-11 items-center justify-between border-b px-3'>
                    <span className='text-sm font-medium'>Changed Files</span>
                    <span className='text-muted-foreground text-xs'>
                        {selectedDiff.artifact.kind === 'git'
                            ? `${String(selectedDiff.artifact.fileCount)} files`
                            : 'Unavailable'}
                    </span>
                </header>
                {treeViewModel ? (
                    <Suspense
                        fallback={
                            <p className='text-muted-foreground m-2 rounded-md border border-dashed px-3 py-4 text-sm'>
                                Loading changed-file tree…
                            </p>
                        }>
                        <PierreChangedFilesTree
                            viewModel={treeViewModel}
                            resolvedSelectedPath={resolvedSelectedPath}
                            onPrefetchPatch={onPrefetchPatch}
                            onSelectPath={onSelectPath}
                        />
                    </Suspense>
                ) : (
                    <div className='p-3 text-sm'>
                        <p className='font-medium'>{selectedDiff.summary}</p>
                        <p className='text-muted-foreground mt-1 text-xs'>
                            {selectedDiff.artifact.kind === 'unsupported' ? selectedDiff.artifact.detail : 'Unavailable'}
                        </p>
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
                            onClick={onToggleMilestonesOnly}>
                            Milestones Only
                        </Button>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            className='h-9'
                            onClick={onToggleCleanupPreview}>
                            {cleanupPreviewOpen ? 'Hide Cleanup' : 'Review Cleanup'}
                        </Button>
                        <span className='text-muted-foreground text-xs'>{String(checkpointsCount)} saved</span>
                    </div>
                </header>
            </section>
        </>
    );
}
