import { describe, expect, it } from 'vitest';

import type {
    ThreadListInput,
    WorkspaceSandboxCacheUtils,
} from '@/web/components/conversation/shell/workspace/sandboxCache';
import { applyWorkspaceActionOutcome } from '@/web/components/conversation/shell/workspace/workspaceActionOutcomeHandler';
import type { WorkspaceActionOutcomeUtils } from '@/web/components/conversation/shell/workspace/workspaceActionOutcomeHandler';

const listThreadsInput: ThreadListInput = {
    profileId: 'profile_test',
    activeTab: 'agent',
    showAllModes: false,
    groupView: 'workspace',
    sort: 'latest',
};

type PermissionListData = Parameters<
    Parameters<WorkspaceActionOutcomeUtils['permission']['listPending']['setData']>[1]
>[0];
type ThreadListData = Parameters<
    Parameters<WorkspaceSandboxCacheUtils['conversation']['listThreads']['setData']>[1]
>[0];
type SandboxListData = Parameters<
    Parameters<WorkspaceSandboxCacheUtils['sandbox']['list']['setData']>[1]
>[0];

function createOutcomeUtils() {
    let pendingPermissions: PermissionListData = {
        requests: [
            {
                id: 'perm_keep',
                profileId: 'profile_test',
                policy: 'ask',
                resource: '/repo/src',
                toolId: 'shell_command',
                scopeKind: 'tool',
                summary: {
                    title: 'Allow command',
                    detail: 'Keep this request pending.',
                },
                decision: 'pending',
                createdAt: '2026-03-27T10:00:00.000Z',
                updatedAt: '2026-03-27T10:00:00.000Z',
            },
            {
                id: 'perm_remove',
                profileId: 'profile_test',
                policy: 'ask',
                resource: '/repo/build',
                toolId: 'shell_command',
                scopeKind: 'tool',
                summary: {
                    title: 'Allow command',
                    detail: 'Remove this request after resolution.',
                },
                decision: 'pending',
                createdAt: '2026-03-27T10:01:00.000Z',
                updatedAt: '2026-03-27T10:01:00.000Z',
            },
        ],
    };
    let threadList: ThreadListData = {
        sort: 'latest',
        showAllModes: false,
        groupView: 'workspace',
        threads: [
            {
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
                scope: 'workspace',
                workspaceFingerprint: 'ws_test',
                anchorKind: 'workspace',
                anchorId: 'ws_test',
                sessionCount: 1,
            },
        ],
    };
    let sandboxList: SandboxListData = {
        sandboxes: [
            {
                id: 'sb_old',
                profileId: 'profile_test',
                workspaceFingerprint: 'ws_test',
                absolutePath: '/repo/.sandboxes/old',
                label: 'Old Sandbox',
                status: 'ready',
                creationStrategy: 'clone',
                createdAt: '2026-03-27T09:00:00.000Z',
                updatedAt: '2026-03-27T09:00:00.000Z',
                lastUsedAt: '2026-03-27T09:00:00.000Z',
            },
        ],
    };

    const utils: WorkspaceActionOutcomeUtils = {
        permission: {
            listPending: {
                setData: (_input, updater) => {
                    pendingPermissions = updater(pendingPermissions);
                },
            },
        },
        conversation: {
            listThreads: {
                setData: (_input, updater) => {
                    threadList = updater(threadList);
                },
            },
        },
        sandbox: {
            list: {
                setData: (_input, updater) => {
                    sandboxList = updater(sandboxList);
                },
            },
        },
        runtime: {
            getShellBootstrap: {
                setData: (_input, updater) => {
                    updater(undefined);
                },
            },
        },
    };

    return {
        utils,
        readPendingPermissions: () => pendingPermissions,
        readThreadList: () => threadList,
        readSandboxList: () => sandboxList,
    };
}

describe('workspace action outcome handler', () => {
    it('removes a resolved permission request from the pending cache without changing feedback', () => {
        const state = createOutcomeUtils();

        const feedback = applyWorkspaceActionOutcome({
            utils: state.utils,
            profileId: 'profile_test',
            listThreadsInput,
            result: {
                ok: true,
                action: 'permission_resolution',
                cacheEffect: {
                    kind: 'permission_request_resolved',
                    requestId: 'perm_remove',
                },
            },
        });

        expect(feedback).toBeUndefined();
        expect(state.readPendingPermissions()).toEqual({
            requests: [
                expect.objectContaining({
                    id: 'perm_keep',
                }),
            ],
        });
    });

    it('patches thread and sandbox caches from a typed execution update outcome', () => {
        const state = createOutcomeUtils();

        const feedback = applyWorkspaceActionOutcome({
            utils: state.utils,
            profileId: 'profile_test',
            listThreadsInput,
            result: {
                ok: true,
                action: 'thread_execution_configuration',
                cacheEffect: {
                    kind: 'thread_execution_configured',
                    thread: {
                        id: 'thr_test',
                        profileId: 'profile_test',
                        conversationId: 'conv_test',
                        title: 'Workspace thread',
                        topLevelTab: 'agent',
                        rootThreadId: 'thr_test',
                        isFavorite: false,
                        executionEnvironmentMode: 'sandbox',
                        sandboxId: 'sb_new',
                        createdAt: '2026-03-27T10:00:00.000Z',
                        updatedAt: '2026-03-27T11:00:00.000Z',
                    },
                    sandbox: {
                        id: 'sb_new',
                        profileId: 'profile_test',
                        workspaceFingerprint: 'ws_test',
                        absolutePath: '/repo/.sandboxes/new',
                        label: 'New Sandbox',
                        status: 'ready',
                        creationStrategy: 'clone',
                        createdAt: '2026-03-27T11:00:00.000Z',
                        updatedAt: '2026-03-27T11:00:00.000Z',
                        lastUsedAt: '2026-03-27T11:00:00.000Z',
                    },
                },
                feedback: {
                    tone: 'success',
                    message: 'Execution environment updated.',
                },
            },
        });

        expect(feedback).toEqual({
            tone: 'success',
            message: 'Execution environment updated.',
        });
        expect(state.readThreadList()?.threads[0]).toMatchObject({
            id: 'thr_test',
            executionEnvironmentMode: 'sandbox',
            sandboxId: 'sb_new',
        });
        expect(state.readSandboxList()).toEqual({
            sandboxes: [
                expect.objectContaining({
                    id: 'sb_new',
                }),
                expect.objectContaining({
                    id: 'sb_old',
                }),
            ],
        });
    });

    it('removes deleted sandboxes from cache and returns the surfaced feedback message', () => {
        const state = createOutcomeUtils();

        const feedback = applyWorkspaceActionOutcome({
            utils: state.utils,
            profileId: 'profile_test',
            listThreadsInput,
            result: {
                ok: true,
                action: 'sandbox_removal',
                cacheEffect: {
                    kind: 'sandboxes_removed',
                    removedSandboxIds: ['sb_old'],
                },
                feedback: {
                    tone: 'success',
                    message: 'Managed sandbox removed.',
                },
            },
        });

        expect(feedback).toEqual({
            tone: 'success',
            message: 'Managed sandbox removed.',
        });
        expect(state.readSandboxList()).toEqual({
            sandboxes: [],
        });
    });
});
