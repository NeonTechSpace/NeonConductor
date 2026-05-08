import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { parsePatchFilesMock } = vi.hoisted(() => ({
    parsePatchFilesMock: vi.fn(() => [
        {
            files: [
                {
                    name: 'src/app.ts',
                    type: 'change',
                    hunks: [],
                    splitLineCount: 0,
                    unifiedLineCount: 0,
                },
            ],
        },
    ]),
}));

vi.mock('@pierre/diffs', () => ({
    parsePatchFiles: parsePatchFilesMock,
}));

vi.mock('@pierre/diffs/react', () => ({
    FileDiff: ({ fileDiff }: { fileDiff: { name: string } }) => <div>Rich diff: {fileDiff.name}</div>,
}));

import { DiffPatchPreviewPanel } from '@/web/components/conversation/panels/diffCheckpointPanel/diffPatchPreviewPanel';
import { PierreDiffPreview } from '@/web/components/conversation/panels/diffCheckpointPanel/pierreDiffPreview';

import type { DiffRecord } from '@/app/backend/persistence/types';

const diff = {
    id: 'diff_1',
    profileId: 'profile_default',
    sessionId: 'sess_1',
    runId: 'run_1',
    summary: '1 changed file',
    artifact: {
        kind: 'git',
        workspaceRootPath: 'C:\\repo',
        workspaceLabel: 'Repo',
        baseRef: 'HEAD',
        fileCount: 1,
        totalAddedLines: 1,
        totalDeletedLines: 0,
        fullPatch: 'diff --git a/src/app.ts b/src/app.ts',
        patchesByPath: {
            'src/app.ts': 'diff --git a/src/app.ts b/src/app.ts',
        },
        files: [{ path: 'src/app.ts', status: 'modified', addedLines: 1 }],
    },
    createdAt: '2026-03-10T10:00:00.000Z',
    updatedAt: '2026-03-10T10:00:00.000Z',
} satisfies DiffRecord;

describe('DiffPatchPreviewPanel', () => {
    it('renders preview controls while package-backed rich diff loading is isolated', () => {
        const html = renderToStaticMarkup(
            <DiffPatchPreviewPanel
                selectedDiff={diff}
                resolvedSelectedPath='src/app.ts'
                previewScope='file'
                patchText='diff --git a/src/app.ts b/src/app.ts'
                patchMarkdown='```diff\ndiff --git a/src/app.ts b/src/app.ts\n```'
                isLoadingPatch={false}
                isRefreshingPatch={false}
                canOpenPath
                isOpeningPath={false}
                onOpenPath={vi.fn()}
                onPreviewScopeChange={vi.fn()}
            />
        );

        expect(html).toContain('src/app.ts');
        expect(html).toContain('Unified diff preview');
        expect(html).toContain('Full');
        expect(html).toContain('Split');
        expect(html).toContain('diff --git a/src/app.ts b/src/app.ts');
    });

    it('renders rich diffs with display-only hunk actions after the package view is loaded', () => {
        const html = renderToStaticMarkup(
            <PierreDiffPreview
                fallbackMarkdown='```diff\ndiff --git a/src/app.ts b/src/app.ts\n```'
                patch='diff --git a/src/app.ts b/src/app.ts'
                renderStyle='unified'
                scope='file'
            />
        );

        expect(html).toContain('Rich diff: src/app.ts');
        expect(html).toContain('Accept Hunk');
        expect(html).toContain('disabled=""');
    });

    it('falls back to Markdown rendering when Pierre parsing is unavailable after load', () => {
        parsePatchFilesMock.mockImplementationOnce(() => {
            throw new Error('invalid patch');
        });

        const html = renderToStaticMarkup(
            <PierreDiffPreview
                fallbackMarkdown='```diff\nnot a valid patch\n```'
                patch='not a valid patch'
                renderStyle='unified'
                scope='run'
            />
        );

        expect(html).toContain('not a valid patch');
        expect(html).not.toContain('Rich diff:');
    });
});
