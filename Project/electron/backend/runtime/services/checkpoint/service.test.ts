import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    resolveCheckpointExecutionTarget: vi.fn(),
    createNativeCheckpointForResolvedTarget: vi.fn(),
    isMutatingCheckpointMode: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/checkpoint/executionTarget', () => ({
    resolveCheckpointExecutionTarget: mocks.resolveCheckpointExecutionTarget,
}));

vi.mock('@/app/backend/runtime/services/checkpoint/internals', async () => {
    const actual = await vi.importActual<typeof import('@/app/backend/runtime/services/checkpoint/internals')>(
        '@/app/backend/runtime/services/checkpoint/internals'
    );

    return {
        ...actual,
        createNativeCheckpointForResolvedTarget: mocks.createNativeCheckpointForResolvedTarget,
        isMutatingCheckpointMode: mocks.isMutatingCheckpointMode,
    };
});

import { ensureCheckpointForRun } from '@/app/backend/runtime/services/checkpoint/service';
import { okOp } from '@/app/backend/runtime/services/common/operationalError';

describe('ensureCheckpointForRun', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns ok(null) for non-mutating modes', async () => {
        mocks.isMutatingCheckpointMode.mockReturnValue(false);

        const result = await ensureCheckpointForRun({
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
        mocks.isMutatingCheckpointMode.mockReturnValue(true);
        mocks.resolveCheckpointExecutionTarget.mockReturnValue(null);

        const result = await ensureCheckpointForRun({
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

    it('forwards checkpoint creation results for mutating runs', async () => {
        const createdCheckpointResult = okOp({ id: 'chk_1' });
        createdCheckpointResult._unsafeUnwrap();
        mocks.isMutatingCheckpointMode.mockReturnValue(true);
        mocks.resolveCheckpointExecutionTarget.mockReturnValue({
            executionTargetKey: 'workspace:ws_1',
        });
        mocks.createNativeCheckpointForResolvedTarget.mockResolvedValue(createdCheckpointResult);

        const result = await ensureCheckpointForRun({
            profileId: 'profile_local_default',
            runId: 'run_1',
            sessionId: 'sess_1',
            threadId: 'thr_1',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceContext: {
                kind: 'workspace',
                workspaceFingerprint: 'ws_1',
                absolutePath: 'C:/repo',
                label: 'Workspace Root',
                executionEnvironmentMode: 'local',
            },
        });

        expect(result.isOk()).toBe(true);
        expect(result._unsafeUnwrap()).toEqual({ id: 'chk_1' });
    });
});
