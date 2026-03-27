import { describe, expect, it, vi } from 'vitest';

import {
    configureConversationThreadExecution,
    refreshManagedSandbox,
    removeManagedSandbox,
    removeOrphanedManagedSandboxes,
} from '@/web/components/conversation/shell/workspace/executionTargetActionsController';

import type { SandboxRecord, ThreadRecord } from '@/app/backend/persistence/types';

function createThread(overrides?: Partial<ThreadRecord>): ThreadRecord {
    return {
        id: 'thr_test',
        profileId: 'profile_test',
        conversationId: 'conv_test',
        title: 'Workspace thread',
        topLevelTab: 'agent',
        rootThreadId: 'thr_test',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:00:00.000Z',
        ...overrides,
    };
}

function createSandbox(overrides?: Partial<SandboxRecord>): SandboxRecord {
    return {
        id: 'sb_test',
        profileId: 'profile_test',
        workspaceFingerprint: 'ws_test',
        absolutePath: '/repo/.sandboxes/test',
        label: 'Test Sandbox',
        status: 'ready',
        creationStrategy: 'clone',
        createdAt: '2026-03-27T10:00:00.000Z',
        updatedAt: '2026-03-27T10:00:00.000Z',
        lastUsedAt: '2026-03-27T10:00:00.000Z',
        ...overrides,
    };
}

describe('executionTargetActionsController', () => {
    it('configures thread execution and returns a typed thread update outcome', async () => {
        const sandbox = createSandbox();
        const thread = createThread({
            executionEnvironmentMode: 'sandbox',
            sandboxId: sandbox.id,
        });
        const mutateAsync = vi.fn(() =>
            Promise.resolve({
            thread,
            sandbox,
            })
        );

        const result = await configureConversationThreadExecution({
            profileId: 'profile_test',
            threadId: 'thr_test',
            executionInput: {
                mode: 'sandbox',
                sandboxId: sandbox.id,
            },
            mutateAsync,
        });

        expect(mutateAsync).toHaveBeenCalledWith({
            profileId: 'profile_test',
            threadId: 'thr_test',
            mode: 'sandbox',
            sandboxId: sandbox.id,
        });
        expect(result).toEqual({
            ok: true,
            action: 'thread_execution_configuration',
            cacheEffect: {
                kind: 'thread_execution_configured',
                thread,
                sandbox,
            },
            feedback: {
                tone: 'success',
                message: 'Execution environment updated.',
            },
        });
    });

    it('returns the backend-derived refresh failure message when the sandbox is gone', async () => {
        const result = await refreshManagedSandbox({
            profileId: 'profile_test',
            sandboxId: 'sb_test',
            mutateAsync: vi.fn(() =>
                Promise.resolve({
                    refreshed: false,
                    reason: 'not_found' as const,
                })
            ),
        });

        expect(result).toEqual({
            ok: false,
            action: 'sandbox_refresh',
            message: 'Managed sandbox no longer exists.',
            feedback: {
                tone: 'error',
                message: 'Managed sandbox no longer exists.',
            },
        });
    });

    it('returns a typed sandbox removal outcome', async () => {
        const result = await removeManagedSandbox({
            profileId: 'profile_test',
            sandboxId: 'sb_test',
            mutateAsync: vi.fn(() =>
                Promise.resolve({
                    removed: true,
                    sandboxId: 'sb_test',
                })
            ),
        });

        expect(result).toEqual({
            ok: true,
            action: 'sandbox_removal',
            cacheEffect: {
                kind: 'sandboxes_removed',
                removedSandboxIds: ['sb_test'],
            },
            feedback: {
                tone: 'success',
                message: 'Managed sandbox removed.',
            },
        });
    });

    it('returns orphaned cleanup as a typed removal outcome even when nothing was removed', async () => {
        const result = await removeOrphanedManagedSandboxes({
            profileId: 'profile_test',
            workspaceFingerprint: 'ws_test',
            mutateAsync: vi.fn(() =>
                Promise.resolve({
                    removedSandboxIds: [],
                })
            ),
        });

        expect(result).toEqual({
            ok: true,
            action: 'orphaned_sandbox_cleanup',
            cacheEffect: {
                kind: 'sandboxes_removed',
                removedSandboxIds: [],
            },
            feedback: {
                tone: 'success',
                message: 'Removed orphaned managed sandboxes.',
            },
        });
    });
});
