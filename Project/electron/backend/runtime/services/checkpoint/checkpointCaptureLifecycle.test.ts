import { err } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    checkpointSnapshotStore: {
        replaceSnapshot: vi.fn(),
    },
    checkpointStore: {
        create: vi.fn(),
        deleteById: vi.fn(),
        getByRunId: vi.fn(),
        renameMilestone: vi.fn(),
        updateMilestone: vi.fn(),
    },
    runStore: {
        getById: vi.fn(),
    },
    threadStore: {
        getBySessionId: vi.fn(),
    },
    compactCheckpointStorage: vi.fn(),
    resolveCheckpointExecutionTarget: vi.fn(),
    captureRunDiffArtifact: vi.fn(),
    captureExecutionTargetSnapshot: vi.fn(),
    workspaceContextService: {
        resolveForSession: vi.fn(),
    },
    resolveModesForTab: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    checkpointSnapshotStore: mocks.checkpointSnapshotStore,
    checkpointStore: mocks.checkpointStore,
    runStore: mocks.runStore,
    threadStore: mocks.threadStore,
}));

vi.mock('@/app/backend/runtime/services/checkpoint/compaction', () => ({
    compactCheckpointStorage: mocks.compactCheckpointStorage,
}));

vi.mock('@/app/backend/runtime/services/checkpoint/executionTarget', () => ({
    resolveCheckpointExecutionTarget: mocks.resolveCheckpointExecutionTarget,
}));

vi.mock('@/app/backend/runtime/services/checkpoint/checkpointArtifactCaptureLifecycle', async () => {
    const actual =
        await vi.importActual<typeof import('@/app/backend/runtime/services/checkpoint/checkpointArtifactCaptureLifecycle')>(
            '@/app/backend/runtime/services/checkpoint/checkpointArtifactCaptureLifecycle'
        );

    return {
        ...actual,
        captureRunDiffArtifact: mocks.captureRunDiffArtifact,
    };
});

vi.mock('@/app/backend/runtime/services/checkpoint/nativeSnapshot', () => ({
    captureExecutionTargetSnapshot: mocks.captureExecutionTargetSnapshot,
}));

vi.mock('@/app/backend/runtime/services/registry/service', () => ({
    resolveModesForTab: mocks.resolveModesForTab,
}));

vi.mock('@/app/backend/runtime/services/workspaceContext/service', () => ({
    workspaceContextService: mocks.workspaceContextService,
}));

import {
    createCheckpointLifecycle,
    ensureCheckpointForRunLifecycle,
} from '@/app/backend/runtime/services/checkpoint/checkpointCaptureLifecycle';

describe('checkpointCaptureLifecycle', () => {
    function buildCheckpointMode(modeKey: string) {
        return {
            id: `mode_${modeKey}`,
            profileId: 'profile_local_default',
            topLevelTab: 'agent',
            modeKey,
            label: modeKey,
            assetKey: `agent.${modeKey}`,
            prompt: {},
            executionPolicy: {
                toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp'],
                workflowCapabilities: ['artifact_view'],
                behaviorFlags: ['checkpoint_eligible', 'workspace_mutating'],
            },
            source: 'test',
            sourceKind: 'system_seed',
            scope: 'system',
            enabled: true,
            precedence: 0,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        };
    }

    beforeEach(() => {
        vi.clearAllMocks();
        mocks.checkpointStore.getByRunId.mockResolvedValue(null);
        mocks.compactCheckpointStorage.mockResolvedValue(undefined);
        mocks.resolveCheckpointExecutionTarget.mockReturnValue({
            absolutePath: 'C:/repo',
            workspaceFingerprint: 'ws_1',
            executionTargetKey: 'workspace:ws_1',
            executionTargetKind: 'workspace',
            executionTargetLabel: 'Workspace Root',
        });
        mocks.resolveModesForTab.mockResolvedValue([buildCheckpointMode('code')]);
    });

    it('returns ok(null) for non-mutating modes', async () => {
        const result = await ensureCheckpointForRunLifecycle({
            profileId: 'profile_local_default',
            runId: 'run_1',
            sessionId: 'sess_1',
            threadId: 'thr_1',
            topLevelTab: 'chat',
            modeKey: 'ask',
            workspaceContext: { kind: 'detached' },
        });

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toBeNull();
    });

    it('returns an operational error when the execution target is unresolved', async () => {
        mocks.resolveCheckpointExecutionTarget.mockReturnValue(null);

        const result = await ensureCheckpointForRunLifecycle({
            profileId: 'profile_local_default',
            runId: 'run_1',
            sessionId: 'sess_1',
            threadId: 'thr_1',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceContext: { kind: 'detached' },
        });

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr().code).toBe('checkpoint_execution_target_unresolved');
    });

    it('updates an existing auto checkpoint into a named milestone and preserves diff capture', async () => {
        mocks.runStore.getById.mockResolvedValue({
            id: 'run_1',
            profileId: 'profile_local_default',
            sessionId: 'sess_1',
        });
        mocks.threadStore.getBySessionId.mockResolvedValue({
            thread: {
                id: 'thr_1',
                topLevelTab: 'agent',
            },
        });
        mocks.checkpointStore.getByRunId.mockResolvedValue({
            id: 'ckpt_1',
            checkpointKind: 'auto',
            summary: 'Before run',
            topLevelTab: 'agent',
            modeKey: 'code',
        });
        mocks.workspaceContextService.resolveForSession.mockResolvedValue({
            kind: 'workspace',
            workspaceFingerprint: 'ws_1',
            absolutePath: 'C:/repo',
            label: 'Workspace Root',
            executionEnvironmentMode: 'local',
        });
        mocks.checkpointStore.updateMilestone.mockResolvedValue({
            id: 'ckpt_1',
            checkpointKind: 'named',
            summary: 'My Milestone',
            milestoneTitle: 'My Milestone',
        });
        mocks.captureRunDiffArtifact.mockResolvedValue({
            diff: { id: 'diff_1' },
        });

        const result = await createCheckpointLifecycle({
            profileId: 'profile_local_default',
            runId: 'run_1',
            milestoneTitle: 'My Milestone',
        });

        expect(result).toMatchObject({
            created: true,
            diff: { id: 'diff_1' },
            checkpoint: {
                id: 'ckpt_1',
                checkpointKind: 'named',
                milestoneTitle: 'My Milestone',
            },
        });
        expect(mocks.checkpointStore.updateMilestone).toHaveBeenCalledWith({
            profileId: 'profile_local_default',
            checkpointId: 'ckpt_1',
            milestoneTitle: 'My Milestone',
        });
    });

    it('returns false when snapshot capture fails during manual checkpoint creation', async () => {
        mocks.runStore.getById.mockResolvedValue({
            id: 'run_1',
            profileId: 'profile_local_default',
            sessionId: 'sess_1',
        });
        mocks.threadStore.getBySessionId.mockResolvedValue({
            thread: {
                id: 'thr_1',
                topLevelTab: 'agent',
            },
        });
        mocks.workspaceContextService.resolveForSession.mockResolvedValue({
            kind: 'workspace',
            workspaceFingerprint: 'ws_1',
            absolutePath: 'C:/repo',
            label: 'Workspace Root',
            executionEnvironmentMode: 'local',
        });
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

        const result = await createCheckpointLifecycle({
            profileId: 'profile_local_default',
            runId: 'run_1',
            milestoneTitle: 'My Milestone',
        });

        expect(result).toEqual({
            created: false,
        });
    });
});
