import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { Button } from '@/web/components/ui/button';

import type { DiffRecord } from '@/app/backend/persistence/types';

interface DiffPatchPreviewPanelProps {
    selectedDiff: DiffRecord | undefined;
    resolvedSelectedPath: string | undefined;
    patchMarkdown: string;
    isLoadingPatch: boolean;
    isRefreshingPatch: boolean;
    canOpenPath: boolean;
    isOpeningPath: boolean;
    onOpenPath: () => void;
}

export function DiffPatchPreviewPanel({
    selectedDiff,
    resolvedSelectedPath,
    patchMarkdown,
    isLoadingPatch,
    isRefreshingPatch,
    canOpenPath,
    isOpeningPath,
    onOpenPath,
}: DiffPatchPreviewPanelProps) {
    if (!selectedDiff) {
        return (
            <p className='text-muted-foreground mt-3 rounded-xl border border-dashed px-4 py-5 text-sm'>
                No diff artifact is available for the selected run yet.
            </p>
        );
    }

    return (
        <section className='border-border rounded-lg border'>
            <header className='border-border bg-background/60 flex min-h-11 items-center justify-between gap-3 border-b px-3'>
                <div className='min-w-0'>
                    <p className='truncate text-sm font-medium'>{resolvedSelectedPath ?? 'Patch Preview'}</p>
                    <p className='text-muted-foreground text-xs'>
                        {patchMarkdown.length > 0 ? 'Unified diff preview' : selectedDiff.summary}
                    </p>
                </div>
                {canOpenPath ? (
                    <Button type='button' size='sm' className='h-11' disabled={isOpeningPath} onClick={onOpenPath}>
                        Open in Editor
                    </Button>
                ) : null}
            </header>
            <div className='max-h-[32rem] overflow-auto p-3'>
                {isLoadingPatch ? (
                    <p className='text-muted-foreground text-sm'>Loading patch…</p>
                ) : patchMarkdown.length > 0 ? (
                    <>
                        {isRefreshingPatch ? (
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
    );
}
