import { describe, expect, it } from 'vitest';

import { resolveCheckpointExecutionTarget } from '@/app/backend/runtime/services/checkpoint/executionTarget';

describe('resolveCheckpointExecutionTarget', () => {
    it('distinguishes base workspace targets from sandbox targets', () => {
        const workspaceTarget = resolveCheckpointExecutionTarget({
            kind: 'workspace',
            workspaceFingerprint: 'ws_1',
            label: 'Workspace Root',
            absolutePath: 'C:/repo',
            executionEnvironmentMode: 'local',
        });
        const sandboxTarget = resolveCheckpointExecutionTarget({
            kind: 'sandbox',
            workspaceFingerprint: 'ws_1',
            label: 'Feature Sandbox',
            absolutePath: 'C:/repo/.sandboxes/feature',
            executionEnvironmentMode: 'sandbox',
            sandbox: {
                id: 'sb_1',
                profileId: 'profile_local_default',
                workspaceFingerprint: 'ws_1',
                absolutePath: 'C:/repo/.sandboxes/feature',
                label: 'Feature Sandbox',
                status: 'ready',
                creationStrategy: 'copy',
                createdAt: '2026-03-18T10:00:00.000Z',
                updatedAt: '2026-03-18T10:00:00.000Z',
                lastUsedAt: '2026-03-18T10:00:00.000Z',
            },
            baseWorkspace: {
                label: 'Workspace Root',
                absolutePath: 'C:/repo',
            },
        });

        expect(workspaceTarget).not.toBeNull();
        expect(sandboxTarget).not.toBeNull();
        if (!workspaceTarget || !sandboxTarget) {
            throw new Error('Expected execution targets to resolve.');
        }

        expect(workspaceTarget.executionTargetKind).toBe('workspace');
        expect(sandboxTarget.executionTargetKind).toBe('sandbox');
        expect(workspaceTarget.executionTargetKey).not.toBe(sandboxTarget.executionTargetKey);
        expect(workspaceTarget.executionTargetKey.startsWith('workspace:')).toBe(true);
        expect(sandboxTarget.executionTargetKey.startsWith('sandbox:')).toBe(true);
    });
});
