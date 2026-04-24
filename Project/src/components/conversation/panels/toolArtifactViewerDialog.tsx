import { Search } from 'lucide-react';

import {
    formatToolArtifactBytes,
    formatToolArtifactKindLabel,
    type ToolArtifactKind,
    type ToolArtifactPreviewStrategy,
} from '@/web/components/conversation/messages/toolArtifactFormatting';
import { Button } from '@/web/components/ui/button';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type { EntityId } from '@/shared/contracts';

interface ToolArtifactViewerArtifactLine {
    lineNumber: number;
    text: string;
}

interface ToolArtifactViewerSearchMatch {
    lineNumber: number;
    lineText: string;
    matchStart: number;
    matchEnd: number;
}

interface ToolArtifactViewerArtifact {
    messagePartId: EntityId<'part'>;
    toolName: string;
    artifactKind: ToolArtifactKind;
    contentType: string;
    totalBytes: number;
    totalLines: number;
    previewStrategy: ToolArtifactPreviewStrategy;
    metadata: Record<string, unknown>;
    startLine: number;
    lineCount: number;
    lines: ToolArtifactViewerArtifactLine[];
    hasPrevious: boolean;
    hasNext: boolean;
}

export interface ToolArtifactViewerDialogProps {
    open: boolean;
    isLoading: boolean;
    artifact?: ToolArtifactViewerArtifact;
    isUnavailable: boolean;
    searchDraftValue: string;
    searchMatches: ToolArtifactViewerSearchMatch[];
    searchTruncated: boolean;
    isSearching: boolean;
    onSearchDraftChange: (value: string) => void;
    onSearchSubmit: () => void;
    onSelectSearchMatch: (lineNumber: number) => void;
    onPreviousPage: () => void;
    onNextPage: () => void;
    onPromoteVisibleLines?: () => void;
    onClose: () => void;
}

function buildDialogTitle(artifact: ToolArtifactViewerArtifact | undefined) {
    if (!artifact) {
        return 'Stored tool output';
    }

    return `${artifact.toolName} · ${formatToolArtifactKindLabel(artifact.artifactKind)}`;
}

function buildMetadataText(artifact: ToolArtifactViewerArtifact | undefined) {
    if (!artifact) {
        return 'Stored artifact preview';
    }

    return [
        formatToolArtifactKindLabel(artifact.artifactKind),
        formatToolArtifactBytes(artifact.totalBytes),
        `${String(artifact.totalLines)} lines`,
    ].join(' · ');
}

function ArtifactLineWindow({ lines }: { lines: ToolArtifactViewerArtifactLine[] }) {
    return (
        <div className='border-border/70 bg-card/35 max-h-[24rem] overflow-auto rounded-2xl border'>
            <div className='min-w-0 divide-y divide-border/40 font-mono text-xs'>
                {lines.map((line) => (
                    <div key={line.lineNumber} className='grid grid-cols-[4.5rem_minmax(0,1fr)] gap-3 px-4 py-2'>
                        <span className='text-muted-foreground select-none text-right'>{line.lineNumber}</span>
                        <pre className='text-foreground whitespace-pre-wrap break-words'>{line.text}</pre>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ArtifactSearchResults({
    searchMatches,
    searchTruncated,
    isSearching,
    onSelectSearchMatch,
}: {
    searchMatches: ToolArtifactViewerSearchMatch[];
    searchTruncated: boolean;
    isSearching: boolean;
    onSelectSearchMatch: (lineNumber: number) => void;
}) {
    if (isSearching) {
        return <p className='text-muted-foreground text-xs'>Searching stored output…</p>;
    }
    if (searchMatches.length === 0) {
        return null;
    }

    return (
        <div className='space-y-2'>
            <div className='flex flex-wrap items-center gap-2'>
                <p className='text-sm font-medium'>Search results</p>
                {searchTruncated ? (
                    <span className='text-muted-foreground text-xs'>Showing first 100 matches</span>
                ) : null}
            </div>
            <div className='border-border/70 bg-card/35 max-h-40 space-y-2 overflow-auto rounded-2xl border p-3'>
                {searchMatches.map((match) => (
                    <button
                        key={`${String(match.lineNumber)}:${String(match.matchStart)}`}
                        type='button'
                        className='border-border/60 hover:bg-accent flex w-full items-start gap-3 rounded-xl border px-3 py-2 text-left'
                        onClick={() => {
                            onSelectSearchMatch(match.lineNumber);
                        }}>
                        <span className='text-muted-foreground shrink-0 font-mono text-xs'>{match.lineNumber}</span>
                        <span className='min-w-0 truncate font-mono text-xs'>{match.lineText}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}

export function ToolArtifactViewerDialog({
    open,
    isLoading,
    artifact,
    isUnavailable,
    searchDraftValue,
    searchMatches,
    searchTruncated,
    isSearching,
    onSearchDraftChange,
    onSearchSubmit,
    onSelectSearchMatch,
    onPreviousPage,
    onNextPage,
    onPromoteVisibleLines,
    onClose,
}: ToolArtifactViewerDialogProps) {
    return (
        <DialogSurface open={open} titleId='tool-artifact-viewer-title' descriptionId='tool-artifact-viewer-description' onClose={onClose}>
            {open ? (
                <div className='border-border bg-background w-[min(94vw,68rem)] rounded-[28px] border p-5 shadow-xl'>
                    <div className='space-y-1'>
                        <h2 id='tool-artifact-viewer-title' className='text-lg font-semibold'>
                            {buildDialogTitle(artifact)}
                        </h2>
                        <p id='tool-artifact-viewer-description' className='text-muted-foreground text-sm'>
                            {buildMetadataText(artifact)}
                        </p>
                    </div>

                    <div className='mt-4 space-y-4'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <div className='border-border/70 bg-card/35 flex min-w-0 flex-1 items-center gap-2 rounded-full border px-3 py-2'>
                                <Search className='text-muted-foreground h-4 w-4 shrink-0' />
                                <input
                                    type='search'
                                    value={searchDraftValue}
                                    onChange={(event) => {
                                        onSearchDraftChange(event.target.value);
                                    }}
                                    placeholder='Search stored output'
                                    className='min-w-0 flex-1 bg-transparent text-sm outline-none'
                                />
                            </div>
                            <Button type='button' size='sm' variant='outline' onClick={onSearchSubmit}>
                                Search
                            </Button>
                        </div>

                        {isLoading ? (
                            <div className='text-muted-foreground border-border/70 bg-card/35 rounded-2xl border px-4 py-5 text-sm'>
                                Loading stored output…
                            </div>
                        ) : isUnavailable ? (
                            <div className='border-border/70 bg-card/35 space-y-3 rounded-2xl border px-4 py-5'>
                                <p className='text-sm font-medium'>Stored output unavailable</p>
                                <p className='text-muted-foreground text-sm'>
                                    The raw artifact record could not be found for this tool result.
                                </p>
                            </div>
                        ) : artifact ? (
                            <>
                                <div className='flex flex-wrap items-center justify-between gap-3'>
                                    <p className='text-muted-foreground text-xs'>
                                        Showing lines {artifact.startLine}-
                                        {artifact.lines.length > 0
                                            ? artifact.lines[artifact.lines.length - 1]?.lineNumber
                                            : artifact.startLine}
                                    </p>
                                    <div className='flex items-center gap-2'>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={!artifact.hasPrevious}
                                            onClick={onPreviousPage}>
                                            Previous page
                                        </Button>
                                        <Button
                                            type='button'
                                            size='sm'
                                            variant='outline'
                                            disabled={!artifact.hasNext}
                                            onClick={onNextPage}>
                                            Next page
                                        </Button>
                                    </div>
                                </div>
                                <ArtifactLineWindow lines={artifact.lines} />
                                <ArtifactSearchResults
                                    searchMatches={searchMatches}
                                    searchTruncated={searchTruncated}
                                    isSearching={isSearching}
                                    onSelectSearchMatch={onSelectSearchMatch}
                                />
                            </>
                        ) : null}
                    </div>

                    <div className='mt-5 flex justify-end gap-2'>
                        {artifact && onPromoteVisibleLines ? (
                            <Button type='button' variant='outline' onClick={onPromoteVisibleLines}>
                                Promote Visible Lines
                            </Button>
                        ) : null}
                        <Button type='button' variant='outline' onClick={onClose}>
                            Close
                        </Button>
                    </div>
                </div>
            ) : null}
        </DialogSurface>
    );
}
