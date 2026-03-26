import { skipToken } from '@tanstack/react-query';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const { diffGetFilePatchUseQueryMock, previewRollbackUseQueryMock, previewCleanupUseQueryMock } = vi.hoisted(() => ({
    diffGetFilePatchUseQueryMock: vi.fn(() => ({
        data: undefined,
        isPending: false,
        isFetching: false,
    })),
    previewRollbackUseQueryMock: vi.fn(() => ({
        isPending: false,
        data: undefined,
    })),
    previewCleanupUseQueryMock: vi.fn(() => ({
        isPending: false,
        data: undefined,
    })),
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({
            checkpoint: {
                list: {
                    invalidate: vi.fn(() => Promise.resolve()),
                },
                previewCleanup: {
                    invalidate: vi.fn(() => Promise.resolve()),
                },
            },
            diff: {
                getFilePatch: {
                    prefetch: vi.fn(),
                },
            },
        }),
        diff: {
            getFilePatch: {
                useQuery: diffGetFilePatchUseQueryMock,
            },
        },
        system: {
            openPath: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
        },
        checkpoint: {
            previewRollback: {
                useQuery: previewRollbackUseQueryMock,
            },
            previewCleanup: {
                useQuery: previewCleanupUseQueryMock,
            },
            rollback: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            create: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            promoteToMilestone: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            renameMilestone: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            deleteMilestone: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            applyCleanup: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            revertChangeset: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
            forceCompact: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: vi.fn(),
                }),
            },
        },
    },
}));

import { DiffCheckpointPanel } from '@/web/components/conversation/panels/diffCheckpointPanel';
import { CheckpointHistorySection } from '@/web/components/conversation/panels/diffCheckpointPanel/checkpointHistorySection';
import {
    buildRollbackWarningLines,
    describeCompactionRun,
    describeRetentionDisposition,
    filterVisibleCheckpoints,
    formatCheckpointByteSize,
    resolveSelectedDiffPath,
} from '@/web/components/conversation/panels/diffCheckpointPanelState';

describe('resolveSelectedDiffPath', () => {
    it('keeps the preferred path while it still exists and falls back when it disappears', () => {
        const selectedDiff = {
            id: 'diff_1',
            profileId: 'profile_default',
            sessionId: 'sess_1',
            runId: 'run_1',
            summary: 'Diff',
            artifact: {
                kind: 'git',
                workspaceRootPath: 'C:\\workspace',
                fileCount: 2,
                files: [
                    { path: 'src/app.ts', status: 'modified' },
                    { path: 'src/lib.ts', status: 'added' },
                ],
            },
            createdAt: '2026-03-10T10:00:00.000Z',
            updatedAt: '2026-03-10T10:00:00.000Z',
        } as const;

        expect(
            resolveSelectedDiffPath({
                selectedDiff: selectedDiff as never,
                preferredPath: 'src/lib.ts',
            })
        ).toBe('src/lib.ts');

        expect(
            resolveSelectedDiffPath({
                selectedDiff: {
                    ...selectedDiff,
                    artifact: {
                        ...selectedDiff.artifact,
                        fileCount: 1,
                        files: [{ path: 'src/app.ts', status: 'modified' }],
                    },
                } as never,
                preferredPath: 'src/lib.ts',
            })
        ).toBe('src/app.ts');
    });
});

describe('buildRollbackWarningLines', () => {
    it('describes isolated and shared rollback previews with backend-owned warning text', () => {
        expect(
            buildRollbackWarningLines({
                checkpointId: 'ckpt_1',
                executionTargetKey: 'workspace:c:/repo',
                executionTargetKind: 'workspace',
                executionTargetLabel: 'Workspace Root',
                isSharedTarget: false,
                hasLaterForeignChanges: false,
                isHighRisk: false,
                hasChangeset: true,
                changeset: {
                    id: 'chg_1',
                    checkpointId: 'ckpt_1',
                    sessionId: 'sess_1',
                    threadId: 'thr_1',
                    executionTargetKey: 'workspace:c:/repo',
                    executionTargetKind: 'workspace',
                    executionTargetLabel: 'Workspace Root',
                    changesetKind: 'run_capture',
                    changeCount: 1,
                    summary: '1 changed file',
                },
                recommendedAction: 'restore_checkpoint',
                canRevertSafely: true,
                affectedSessions: [
                    {
                        sessionId: 'sess_1',
                        threadId: 'thr_1',
                        topLevelTab: 'agent',
                        threadTitle: 'Solo Chat',
                    },
                ],
            })
        ).toEqual({
            tone: 'isolated',
            lines: ['This checkpoint targets an isolated execution path.', 'Affected chats: Solo Chat'],
        });

        expect(
            buildRollbackWarningLines({
                checkpointId: 'ckpt_2',
                executionTargetKey: 'workspace:c:/repo',
                executionTargetKind: 'workspace',
                executionTargetLabel: 'Workspace Root',
                isSharedTarget: true,
                hasLaterForeignChanges: true,
                isHighRisk: true,
                hasChangeset: true,
                changeset: {
                    id: 'chg_2',
                    checkpointId: 'ckpt_2',
                    sessionId: 'sess_1',
                    threadId: 'thr_1',
                    executionTargetKey: 'workspace:c:/repo',
                    executionTargetKind: 'workspace',
                    executionTargetLabel: 'Workspace Root',
                    changesetKind: 'run_capture',
                    changeCount: 2,
                    summary: '2 changed files',
                },
                recommendedAction: 'revert_changeset',
                canRevertSafely: true,
                affectedSessions: [
                    {
                        sessionId: 'sess_1',
                        threadId: 'thr_1',
                        topLevelTab: 'agent',
                        threadTitle: 'Chat A',
                    },
                    {
                        sessionId: 'sess_2',
                        threadId: 'thr_2',
                        topLevelTab: 'agent',
                        threadTitle: 'Chat B',
                    },
                ],
            })
        ).toEqual({
            tone: 'warning',
            lines: [
                'This target is shared. Rolling back here will also affect other chats on the same resolved path.',
                'Later checkpoints from other chats exist on this same target. This rollback is high risk.',
                'Safer action available: revert only this run changeset instead of restoring the whole target.',
                'Affected chats: Chat A, Chat B',
            ],
        });
    });
});

describe('checkpoint milestone helpers', () => {
    it('filters milestone-only history and labels retention states', () => {
        const checkpoints = [
            {
                id: 'ckpt_1',
                checkpointKind: 'auto',
                summary: 'Auto checkpoint',
            },
            {
                id: 'ckpt_2',
                checkpointKind: 'named',
                summary: 'Release milestone',
                milestoneTitle: 'Release milestone',
            },
        ] as const;

        expect(filterVisibleCheckpoints(checkpoints as never, false)).toEqual(checkpoints);
        expect(filterVisibleCheckpoints(checkpoints as never, true)).toEqual([checkpoints[1]]);
        expect(describeRetentionDisposition('milestone')).toBe('Milestone');
        expect(describeRetentionDisposition('protected_recent')).toBe('Protected recent');
        expect(describeRetentionDisposition('eligible_for_cleanup')).toBe('Cleanup eligible');
    });
});

describe('checkpoint compaction helpers', () => {
    it('formats storage sizes and summarises the last compaction result', () => {
        expect(formatCheckpointByteSize(512)).toBe('512 B');
        expect(formatCheckpointByteSize(1536)).toBe('1.5 KiB');
        expect(formatCheckpointByteSize(2 * 1024 * 1024)).toBe('2.0 MiB');

        expect(describeCompactionRun(undefined)).toBe('No compaction run has been recorded yet.');
        expect(
            describeCompactionRun({
                id: 'cpr_1',
                triggerKind: 'automatic',
                status: 'success',
                blobCountBefore: 4,
                blobCountAfter: 4,
                bytesBefore: 4096,
                bytesAfter: 1024,
                blobsCompacted: 4,
                databaseReclaimed: false,
                startedAt: '2026-03-19T10:00:00.000Z',
                completedAt: '2026-03-19T10:00:01.000Z',
            })
        ).toBe('Last automatic compaction packed 4 blobs');
        expect(
            describeCompactionRun({
                id: 'cpr_2',
                triggerKind: 'manual',
                status: 'failed',
                message: 'Verification failed.',
                blobCountBefore: 4,
                blobCountAfter: 4,
                bytesBefore: 4096,
                bytesAfter: 4096,
                blobsCompacted: 0,
                databaseReclaimed: false,
                startedAt: '2026-03-19T10:00:00.000Z',
                completedAt: '2026-03-19T10:00:01.000Z',
            })
        ).toBe('Last manual compaction failed. Verification failed.');
    });
});

describe('DiffCheckpointPanel preview query ownership', () => {
    it('does not issue rollback or cleanup preview queries until the relevant mounted boundary exists', () => {
        renderToStaticMarkup(
            createElement(DiffCheckpointPanel, {
                profileId: 'profile_default',
                diffs: [],
                checkpoints: [],
                disabled: false,
            })
        );

        expect(previewRollbackUseQueryMock).not.toHaveBeenCalled();
        expect(previewCleanupUseQueryMock).not.toHaveBeenCalled();
    });

    it('passes skipToken to file patch preview until a real diff and selected path exist', () => {
        renderToStaticMarkup(
            createElement(DiffCheckpointPanel, {
                profileId: 'profile_default',
                diffs: [],
                checkpoints: [],
                disabled: false,
            })
        );

        expect(diffGetFilePatchUseQueryMock).toHaveBeenCalledWith(skipToken, expect.any(Object));
    });

    it('issues preview queries only from the mounted maintenance boundary and only with real ids', () => {
        renderToStaticMarkup(
            createElement(CheckpointHistorySection, {
                profileId: 'profile_default',
                selectedSessionId: 'sess_real',
                visibleCheckpoints: [
                    {
                        id: 'ckpt_real',
                        profileId: 'profile_default',
                        sessionId: 'sess_real',
                        threadId: 'thr_real',
                        runId: 'run_real',
                        workspaceFingerprint: 'wsf_real',
                        executionTargetKey: 'workspace:c:/repo',
                        executionTargetKind: 'workspace',
                        executionTargetLabel: 'Workspace Root',
                        createdByKind: 'system',
                        checkpointKind: 'named',
                        snapshotFileCount: 1,
                        topLevelTab: 'agent',
                        modeKey: 'code',
                        summary: 'Checkpoint',
                        createdAt: '2026-03-10T10:00:00.000Z',
                        updatedAt: '2026-03-10T10:00:00.000Z',
                        retentionDisposition: 'milestone',
                        milestoneTitle: 'Checkpoint',
                    },
                ],
                checkpointStorage: undefined,
                disabled: false,
                cleanupPreviewOpen: true,
                forceCompactPending: false,
                applyCleanupPending: false,
                rollbackPending: false,
                revertChangesetPending: false,
                promoteMilestonePending: false,
                renameMilestonePending: false,
                deleteMilestonePending: false,
                confirmRollbackId: 'ckpt_real',
                rollbackTargetId: undefined,
                milestoneDrafts: {},
                onToggleCheckpointActions: vi.fn(),
                onCloseCheckpointActions: vi.fn(),
                onMilestoneDraftChange: vi.fn(),
                onRestoreCheckpoint: vi.fn(),
                onRevertChangeset: vi.fn(),
                onPromoteMilestone: vi.fn(),
                onRenameMilestone: vi.fn(),
                onDeleteMilestone: vi.fn(),
                onToggleCleanupPreview: vi.fn(),
                onApplyCleanup: vi.fn(),
                onForceCompact: vi.fn(),
            })
        );

        expect(previewRollbackUseQueryMock).toHaveBeenCalledWith(
            {
                profileId: 'profile_default',
                checkpointId: 'ckpt_real',
            },
            expect.any(Object)
        );
        expect(previewCleanupUseQueryMock).toHaveBeenCalledWith(
            {
                profileId: 'profile_default',
                sessionId: 'sess_real',
            },
            expect.any(Object)
        );
    });
});
