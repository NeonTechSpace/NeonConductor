import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ToolArtifactViewerDialog } from '@/web/components/conversation/panels/toolArtifactViewerDialog';

describe('ToolArtifactViewerDialog', () => {
    it('renders artifact metadata, line windows, and search results', () => {
        const html = renderToStaticMarkup(
            <ToolArtifactViewerDialog
                open
                isLoading={false}
                artifact={{
                    messagePartId: 'part_tool_artifact',
                    toolName: 'run_command',
                    artifactKind: 'command_output',
                    contentType: 'text/plain',
                    totalBytes: 8192,
                    totalLines: 520,
                    previewStrategy: 'head_tail',
                    metadata: {
                        command: 'dir /s',
                    },
                    startLine: 201,
                    lineCount: 400,
                    lines: [
                        { lineNumber: 201, text: 'line 201' },
                        { lineNumber: 202, text: 'line 202' },
                    ],
                    hasPrevious: true,
                    hasNext: true,
                }}
                isUnavailable={false}
                searchDraftValue='match line'
                searchMatches={[
                    {
                        lineNumber: 321,
                        lineText: 'match line 321',
                        matchStart: 0,
                        matchEnd: 10,
                    },
                ]}
                searchTruncated={false}
                isSearching={false}
                onSearchDraftChange={vi.fn()}
                onSearchSubmit={vi.fn()}
                onSelectSearchMatch={vi.fn()}
                onPreviousPage={vi.fn()}
                onNextPage={vi.fn()}
                onPromoteVisibleLines={vi.fn()}
                onClose={vi.fn()}
            />
        );

        expect(html).toContain('run_command · Command output');
        expect(html).toContain('Command output · 8 KB · 520 lines');
        expect(html).toContain('Showing lines 201-202');
        expect(html).toContain('line 201');
        expect(html).toContain('Search results');
        expect(html).toContain('match line 321');
        expect(html).toContain('Previous page');
        expect(html).toContain('Next page');
        expect(html).toContain('Promote Visible Lines');
    });

    it('renders a clean unavailable state when the artifact is missing', () => {
        const html = renderToStaticMarkup(
            <ToolArtifactViewerDialog
                open
                isLoading={false}
                isUnavailable
                searchDraftValue=''
                searchMatches={[]}
                searchTruncated={false}
                isSearching={false}
                onSearchDraftChange={vi.fn()}
                onSearchSubmit={vi.fn()}
                onSelectSearchMatch={vi.fn()}
                onPreviousPage={vi.fn()}
                onNextPage={vi.fn()}
                onClose={vi.fn()}
            />
        );

        expect(html).toContain('Stored output unavailable');
        expect(html).toContain('raw artifact record could not be found');
    });
});
