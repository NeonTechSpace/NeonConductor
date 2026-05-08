import { lazy, Suspense, useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { type DiffPreviewScope, type DiffRenderStyle } from '@/web/components/conversation/panels/diffViewModels';
import { Button } from '@/web/components/ui/button';

import type { DiffRecord } from '@/app/backend/persistence/types';

const PierreDiffPreview = lazy(async () => {
    const module = await import('@/web/components/conversation/panels/diffCheckpointPanel/pierreDiffPreview');
    return { default: module.PierreDiffPreview };
});

interface DiffPatchPreviewPanelProps {
    selectedDiff: DiffRecord | undefined;
    resolvedSelectedPath: string | undefined;
    previewScope: DiffPreviewScope;
    patchText: string;
    patchMarkdown: string;
    isLoadingPatch: boolean;
    isRefreshingPatch: boolean;
    canOpenPath: boolean;
    isOpeningPath: boolean;
    onOpenPath: () => void;
    onPreviewScopeChange: (scope: DiffPreviewScope) => void;
}

export function DiffPatchPreviewPanel({
    selectedDiff,
    resolvedSelectedPath,
    previewScope,
    patchText,
    patchMarkdown,
    isLoadingPatch,
    isRefreshingPatch,
    canOpenPath,
    isOpeningPath,
    onOpenPath,
    onPreviewScopeChange,
}: DiffPatchPreviewPanelProps) {
    const [renderStyle, setRenderStyle] = useState<DiffRenderStyle>('unified');

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
                    <p className='truncate text-sm font-medium'>
                        {previewScope === 'run' ? 'Full Run Diff' : (resolvedSelectedPath ?? 'Patch Preview')}
                    </p>
                    <p className='text-muted-foreground text-xs'>
                        {patchMarkdown.length > 0
                            ? `${renderStyle === 'split' ? 'Split' : 'Unified'} diff preview`
                            : selectedDiff.summary}
                    </p>
                </div>
                <div className='flex shrink-0 flex-wrap items-center justify-end gap-2'>
                    {selectedDiff.artifact.kind === 'git' ? (
                        <div className='flex items-center gap-1'>
                            <Button
                                type='button'
                                size='sm'
                                variant={previewScope === 'file' ? 'default' : 'outline'}
                                className='h-9'
                                onClick={() => {
                                    onPreviewScopeChange('file');
                                }}>
                                File
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant={previewScope === 'run' ? 'default' : 'outline'}
                                className='h-9'
                                onClick={() => {
                                    onPreviewScopeChange('run');
                                }}>
                                Full
                            </Button>
                        </div>
                    ) : null}
                    {patchMarkdown.length > 0 ? (
                        <div className='flex items-center gap-1'>
                            <Button
                                type='button'
                                size='sm'
                                variant={renderStyle === 'unified' ? 'default' : 'outline'}
                                className='h-9'
                                onClick={() => {
                                    setRenderStyle('unified');
                                }}>
                                Unified
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant={renderStyle === 'split' ? 'default' : 'outline'}
                                className='h-9'
                                onClick={() => {
                                    setRenderStyle('split');
                                }}>
                                Split
                            </Button>
                        </div>
                    ) : null}
                    {canOpenPath ? (
                        <Button type='button' size='sm' className='h-9' disabled={isOpeningPath} onClick={onOpenPath}>
                            Open in Editor
                        </Button>
                    ) : null}
                </div>
            </header>
            <div className='max-h-[32rem] overflow-auto p-3'>
                {isLoadingPatch ? (
                    <p className='text-muted-foreground text-sm'>Loading patch…</p>
                ) : patchMarkdown.length > 0 ? (
                    <>
                        {isRefreshingPatch ? (
                            <p className='text-muted-foreground mb-3 text-xs'>Updating patch preview…</p>
                        ) : null}
                        <Suspense fallback={<MarkdownContent markdown={patchMarkdown} />}>
                            <PierreDiffPreview
                                fallbackMarkdown={patchMarkdown}
                                patch={patchText}
                                renderStyle={renderStyle}
                                scope={previewScope}
                            />
                        </Suspense>
                    </>
                ) : selectedDiff.artifact.kind === 'git' ? (
                    <p className='text-muted-foreground rounded-xl border border-dashed px-4 py-5 text-sm'>
                        {previewScope === 'run'
                            ? 'No full-run patch was captured for this diff.'
                            : 'Select a changed file to inspect its patch.'}
                    </p>
                ) : (
                    <p className='text-muted-foreground text-sm'>{selectedDiff.artifact.detail}</p>
                )}
            </div>
        </section>
    );
}
