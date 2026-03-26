import { describe, expect, it } from 'vitest';

import { deriveConversationWorkspaceExecutionScope } from '@/web/components/conversation/shell/deriveConversationWorkspaceExecutionScope';

import type { SessionSummaryRecord, ThreadListRecord } from '@/app/backend/persistence/types';
import type { RuntimeShellBootstrap } from '@/app/backend/runtime/contracts';

function createThread(overrides: Partial<ThreadListRecord> = {}): ThreadListRecord {
    return {
        id: 'thr_default',
        profileId: 'profile_default',
        conversationId: 'conv_default',
        title: 'Default Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_default',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        scope: 'workspace',
        workspaceFingerprint: 'ws_primary',
        anchorKind: 'workspace',
        anchorId: 'ws_primary',
        sessionCount: 1,
        createdAt: '2026-03-21T10:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z',
        ...overrides,
    };
}

function createDetachedThread(overrides: Partial<ThreadListRecord> = {}): ThreadListRecord {
    return {
        id: 'thr_detached',
        profileId: 'profile_default',
        conversationId: 'conv_default',
        title: 'Detached Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_detached',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        scope: 'detached',
        anchorKind: 'playground',
        sessionCount: 1,
        createdAt: '2026-03-21T10:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z',
        ...overrides,
    };
}

function createSession(overrides: Partial<SessionSummaryRecord> = {}): SessionSummaryRecord {
    return {
        id: 'sess_default',
        profileId: 'profile_default',
        conversationId: 'conv_default',
        threadId: 'thr_default',
        kind: 'local',
        runStatus: 'completed',
        turnCount: 1,
        createdAt: '2026-03-21T10:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z',
        ...overrides,
    };
}

const workspaceRoots: RuntimeShellBootstrap['workspaceRoots'] = [
    {
        fingerprint: 'ws_primary',
        profileId: 'profile_default',
        label: 'Workspace Primary',
        absolutePath: 'C:\\Workspace',
        createdAt: '2026-03-21T10:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z',
    },
];

const sandboxes: RuntimeShellBootstrap['sandboxes'] = [
    {
        id: 'sb_thread',
        profileId: 'profile_default',
        workspaceFingerprint: 'ws_primary',
        absolutePath: 'C:\\Sandbox\\Thread',
        label: 'Thread Sandbox',
        status: 'ready',
        creationStrategy: 'clone',
        createdAt: '2026-03-21T10:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z',
        lastUsedAt: '2026-03-21T10:00:00.000Z',
    },
    {
        id: 'sb_session',
        profileId: 'profile_default',
        workspaceFingerprint: 'ws_primary',
        absolutePath: 'C:\\Sandbox\\Session',
        label: 'Session Sandbox',
        status: 'ready',
        creationStrategy: 'clone',
        createdAt: '2026-03-21T10:00:00.000Z',
        updatedAt: '2026-03-21T10:00:00.000Z',
        lastUsedAt: '2026-03-21T10:00:00.000Z',
    },
];

describe('deriveConversationWorkspaceExecutionScope', () => {
    it('returns detached scope when the selected thread is not workspace-bound', () => {
        expect(
            deriveConversationWorkspaceExecutionScope({
                selectedThread: createDetachedThread(),
                selectedSession: undefined,
                workspaceRoots,
                sandboxes,
            })
        ).toEqual({ kind: 'detached' });
    });

    it('returns workspace scope when no sandbox is active', () => {
        expect(
            deriveConversationWorkspaceExecutionScope({
                selectedThread: createThread({
                    executionEnvironmentMode: 'new_sandbox',
                }),
                selectedSession: undefined,
                workspaceRoots,
                sandboxes,
            })
        ).toEqual({
            kind: 'workspace',
            label: 'Workspace Primary',
            absolutePath: 'C:\\Workspace',
            executionEnvironmentMode: 'new_sandbox',
        });
    });

    it('prefers the selected session sandbox over the thread sandbox baseline', () => {
        expect(
            deriveConversationWorkspaceExecutionScope({
                selectedThread: createThread({
                    sandboxId: 'sb_thread',
                }),
                selectedSession: createSession({
                    sandboxId: 'sb_session',
                }),
                workspaceRoots,
                sandboxes,
            })
        ).toEqual({
            kind: 'sandbox',
            label: 'Session Sandbox',
            absolutePath: 'C:\\Sandbox\\Session',
            baseWorkspaceLabel: 'Workspace Primary',
            baseWorkspacePath: 'C:\\Workspace',
            sandboxId: 'sb_session',
        });
    });

    it('uses the thread sandbox when no selected session sandbox exists', () => {
        expect(
            deriveConversationWorkspaceExecutionScope({
                selectedThread: createThread({
                    sandboxId: 'sb_thread',
                }),
                selectedSession: createSession({
                }),
                workspaceRoots,
                sandboxes,
            })
        ).toEqual({
            kind: 'sandbox',
            label: 'Thread Sandbox',
            absolutePath: 'C:\\Sandbox\\Thread',
            baseWorkspaceLabel: 'Workspace Primary',
            baseWorkspacePath: 'C:\\Workspace',
            sandboxId: 'sb_thread',
        });
    });
});
