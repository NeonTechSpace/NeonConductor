import { parsePatchFiles, type FileDiffMetadata } from '@pierre/diffs';
import { FileDiff } from '@pierre/diffs/react';
import { Component, useMemo } from 'react';
import type { ReactNode } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import type { DiffPreviewScope, DiffRenderStyle } from '@/web/components/conversation/panels/diffViewModels';
import { Button } from '@/web/components/ui/button';

export interface PierreDiffPreviewProps {
    fallbackMarkdown: string;
    patch: string;
    renderStyle: DiffRenderStyle;
    scope: DiffPreviewScope;
}

export function PierreDiffPreview({ fallbackMarkdown, patch, renderStyle, scope }: PierreDiffPreviewProps) {
    const parsed = useMemo(() => parsePatchSafely(patch), [patch]);

    if (parsed.kind === 'unavailable') {
        return <MarkdownContent markdown={fallbackMarkdown} />;
    }

    return (
        <DiffPreviewErrorBoundary fallback={<MarkdownContent markdown={fallbackMarkdown} />}>
            <div className='space-y-3'>
                <div className='text-muted-foreground flex flex-wrap items-center gap-2 text-xs'>
                    <span>{scope === 'run' ? `${String(parsed.fileDiffs.length)} files` : 'Selected file'}</span>
                    <span>Hunk actions are preview-only in this phase.</span>
                    <Button type='button' size='sm' variant='outline' className='h-8' disabled>
                        Accept Hunk
                    </Button>
                    <Button type='button' size='sm' variant='outline' className='h-8' disabled>
                        Reject Hunk
                    </Button>
                </div>
                {parsed.fileDiffs.map((fileDiff, index) => (
                    <FileDiff
                        key={`${fileDiff.prevName ?? ''}:${fileDiff.name}:${String(index)}`}
                        className='border-border overflow-hidden rounded-md border'
                        disableWorkerPool
                        fileDiff={fileDiff}
                        options={{
                            diffIndicators: 'bars',
                            diffStyle: renderStyle,
                            hunkSeparators: 'line-info-basic',
                            overflow: 'scroll',
                            theme: {
                                dark: 'github-dark',
                                light: 'github-light',
                            },
                            themeType: 'system',
                            tokenizeMaxLineLength: 4_000,
                        }}
                    />
                ))}
            </div>
        </DiffPreviewErrorBoundary>
    );
}

function parsePatchSafely(patch: string): { kind: 'available'; fileDiffs: FileDiffMetadata[] } | { kind: 'unavailable' } {
    try {
        const fileDiffs = parsePatchFiles(patch).flatMap((parsedPatch) => parsedPatch.files);
        return fileDiffs.length > 0 ? { kind: 'available', fileDiffs } : { kind: 'unavailable' };
    } catch {
        return { kind: 'unavailable' };
    }
}

class DiffPreviewErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
    override state = { failed: false };

    static getDerivedStateFromError(): { failed: boolean } {
        return { failed: true };
    }

    override render() {
        return this.state.failed ? this.props.fallback : this.props.children;
    }
}
