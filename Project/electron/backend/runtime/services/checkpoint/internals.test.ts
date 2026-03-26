import { err } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    checkpointStore: {
        getByRunId: vi.fn(),
        create: vi.fn(),
        deleteById: vi.fn(),
    },
    checkpointSnapshotStore: {
        replaceSnapshot: vi.fn(),
    },
    resolveCheckpointExecutionTarget: vi.fn(),
    captureExecutionTargetSnapshot: vi.fn(),
    compactCheckpointStorage: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    checkpointChangesetStore: {},
    checkpointSnapshotStore: mocks.checkpointSnapshotStore,
    checkpointStore: mocks.checkpointStore,
    diffStore: {},
}));

vi.mock('@/app/backend/runtime/services/checkpoint/executionTarget', () => ({
    listAffectedSessionsForExecutionTarget: vi.fn(),
    resolveCheckpointExecutionTarget: mocks.resolveCheckpointExecutionTarget,
}));

vi.mock('@/app/backend/runtime/services/checkpoint/nativeSnapshot', () => ({
    captureExecutionTargetSnapshot: mocks.captureExecutionTargetSnapshot,
}));

vi.mock('@/app/backend/runtime/services/checkpoint/compaction', () => ({
    compactCheckpointStorage: mocks.compactCheckpointStorage,
    getCheckpointStorageSummary: vi.fn(),
}));

import { createNativeCheckpointForResolvedTarget } from '@/app/backend/runtime/services/checkpoint/internals';

describe('createNativeCheckpointForResolvedTarget', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.checkpointStore.getByRunId.mockResolvedValue(null);
    });

    it('returns an operational error when the execution target is unresolved', async () => {
        mocks.resolveCheckpointExecutionTarget.mockReturnValue(null);

        const result = await createNativeCheckpointForResolvedTarget({
            profileId: 'profile_local_default',
            sessionId: 'sess_1',
            threadId: 'thr_1',
            runId: 'run_1',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceContext: { kind: 'detached' },
            createdByKind: 'system',
            checkpointKind: 'auto',
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().code).toBe('checkpoint_execution_target_unresolved');
    });

    it('returns an operational error when snapshot capture fails', async () => {
        mocks.resolveCheckpointExecutionTarget.mockReturnValue({
            absolutePath: 'C:/repo',
            workspaceFingerprint: 'ws_1',
            executionTargetKey: 'workspace:ws_1',
            executionTargetKind: 'workspace',
            executionTargetLabel: 'Workspace Root',
        });
        const snapshotResult = err({
            reason: 'snapshot_invalid',
            detail: 'Snapshot capture failed.',
        });
        snapshotResult.match(
            () => undefined,
            () => undefined
        );
        mocks.captureExecutionTargetSnapshot.mockResolvedValue(snapshotResult);

        const result = await createNativeCheckpointForResolvedTarget({
            profileId: 'profile_local_default',
            sessionId: 'sess_1',
            threadId: 'thr_1',
            runId: 'run_1',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_1',
                absolutePath: 'C:/repo',
                label: 'Workspace Root',
                executionEnvironmentMode: 'local',
            },
            createdByKind: 'system',
            checkpointKind: 'auto',
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toMatchObject({
            code: 'checkpoint_snapshot_capture_failed',
            message: 'Snapshot capture failed.',
        });
    });
});
