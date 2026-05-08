import { describe, expect, it } from 'vitest';

import {
    buildDiffTreeViewModel,
    buildPatchMarkdown,
    formatDiffLineDeltaSummary,
    formatDiffStatusLabel,
} from '@/web/components/conversation/panels/diffViewModels';

import type { DiffRecord } from '@/app/backend/persistence/types';

describe('diff view models', () => {
    it('maps backend diff files into stable tree rows without changing backend status vocabulary', () => {
        const diff = {
            id: 'diff_1',
            profileId: 'profile_default',
            sessionId: 'sess_1',
            runId: 'run_1',
            summary: 'Diff',
            artifact: {
                kind: 'git',
                workspaceRootPath: 'C:\\repo',
                workspaceLabel: 'Repo',
                baseRef: 'HEAD',
                fileCount: 3,
                totalAddedLines: 12,
                totalDeletedLines: 4,
                fullPatch: '',
                patchesByPath: {},
                files: [
                    { path: 'src/type.ts', status: 'type_changed', addedLines: 1, deletedLines: 1 },
                    { path: 'README.md', status: 'copied', previousPath: 'docs/README.md' },
                    { path: 'src/app.ts', status: 'modified', addedLines: 11, deletedLines: 3 },
                ],
            },
            createdAt: '2026-03-10T10:00:00.000Z',
            updatedAt: '2026-03-10T10:00:00.000Z',
        } satisfies DiffRecord;

        const viewModel = buildDiffTreeViewModel(diff);

        expect(viewModel?.paths).toEqual(['README.md', 'src/app.ts', 'src/type.ts']);
        expect(viewModel?.files.map((file) => file.status)).toEqual(['copied', 'modified', 'type_changed']);
        expect(viewModel?.gitStatus).toEqual([
            { path: 'README.md', status: 'modified' },
            { path: 'src/app.ts', status: 'modified' },
            { path: 'src/type.ts', status: 'modified' },
        ]);
        expect(viewModel?.filesByPath.get('README.md')?.previousPath).toBe('docs/README.md');
        expect(viewModel?.filesByPath.get('src/type.ts')?.statusLabel).toBe('type');
        expect(viewModel?.filesByPath.get('src/app.ts')?.lineDeltaLabel).toBe('11 added / 3 deleted');
    });

    it('keeps unsupported artifacts out of renderer-only tree models', () => {
        const diff = {
            id: 'diff_unsupported',
            profileId: 'profile_default',
            sessionId: 'sess_1',
            runId: 'run_1',
            summary: 'Unsupported',
            artifact: {
                kind: 'unsupported',
                workspaceRootPath: 'C:\\repo',
                workspaceLabel: 'Repo',
                reason: 'workspace_not_git',
                detail: 'No git repository.',
            },
            createdAt: '2026-03-10T10:00:00.000Z',
            updatedAt: '2026-03-10T10:00:00.000Z',
        } satisfies DiffRecord;

        expect(buildDiffTreeViewModel(diff)).toBeUndefined();
    });

    it('formats diff labels and markdown fallback consistently', () => {
        expect(formatDiffStatusLabel('type_changed')).toBe('type');
        expect(formatDiffLineDeltaSummary({ addedLines: 2 })).toBe('2 added');
        expect(formatDiffLineDeltaSummary({ deletedLines: 1 })).toBe('1 deleted');
        expect(buildPatchMarkdown('diff --git a/a.ts b/a.ts')).toBe('```diff\ndiff --git a/a.ts b/a.ts\n```');
        expect(buildPatchMarkdown('')).toBe('');
    });
});
