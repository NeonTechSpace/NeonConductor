import { describe, expect, it, vi } from 'vitest';

import { deleteSidebarWorkspaceThreads } from '@/web/components/conversation/sidebar/useSidebarWorkspaceDeleteMutationController';

import type {
    ConversationRecord,
    SessionSummaryRecord,
    TagRecord,
    ThreadListRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';

import { createSidebarMutationUtils } from './__tests__/sidebarMutationController.testUtils';

function createWorkspaceThread(overrides: Partial<ThreadListRecord>): ThreadListRecord {
    return {
        id: 'thr_default',
        profileId: 'profile_default',
        conversationId: 'conv_workspace',
        title: 'Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_default',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        createdAt: '2026-03-28T10:00:00.000Z',
        updatedAt: '2026-03-28T10:00:00.000Z',
        scope: 'workspace',
        workspaceFingerprint: 'ws_1',
        anchorKind: 'workspace',
        anchorId: 'ws_1',
        sessionCount: 0,
        ...overrides,
    };
}

describe('useSidebarWorkspaceDeleteMutationController', () => {
    it('applies cache fallout and selection repair after workspace deletion succeeds', async () => {
        const workspaceBucket: ConversationRecord = {
            id: 'conv_workspace',
            profileId: 'profile_default',
            scope: 'workspace',
            workspaceFingerprint: 'ws_1',
            title: 'Workspace',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
        };
        const survivingBucket: ConversationRecord = {
            id: 'conv_other',
            profileId: 'profile_default',
            scope: 'workspace',
            workspaceFingerprint: 'ws_2',
            title: 'Other workspace',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
        };
        const deletedThread = createWorkspaceThread({
            id: 'thr_deleted',
            conversationId: workspaceBucket.id,
            title: 'Deleted thread',
            sessionCount: 1,
        });
        const survivingThread = createWorkspaceThread({
            id: 'thr_surviving',
            conversationId: survivingBucket.id,
            workspaceFingerprint: 'ws_2',
            anchorId: 'ws_2',
            title: 'Surviving thread',
        });
        const deletedTag: TagRecord = {
            id: 'tag_deleted',
            profileId: 'profile_default',
            label: 'Delete me',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
        };
        const survivingTag: TagRecord = {
            id: 'tag_surviving',
            profileId: 'profile_default',
            label: 'Keep me',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
        };
        const deletedThreadTag: ThreadTagRecord = {
            profileId: 'profile_default',
            threadId: deletedThread.id,
            tagId: deletedTag.id,
            createdAt: '2026-03-28T10:00:00.000Z',
        };
        const survivingThreadTag: ThreadTagRecord = {
            profileId: 'profile_default',
            threadId: survivingThread.id,
            tagId: survivingTag.id,
            createdAt: '2026-03-28T10:00:00.000Z',
        };
        const deletedSession: SessionSummaryRecord = {
            id: 'sess_deleted',
            profileId: 'profile_default',
            conversationId: workspaceBucket.id,
            threadId: deletedThread.id,
            kind: 'local',
            runStatus: 'completed',
            turnCount: 1,
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
        };
        const survivingSession: SessionSummaryRecord = {
            id: 'sess_surviving',
            profileId: 'profile_default',
            conversationId: survivingBucket.id,
            threadId: survivingThread.id,
            kind: 'local',
            runStatus: 'completed',
            turnCount: 1,
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
        };
        const mutationUtils = createSidebarMutationUtils({
            buckets: [workspaceBucket, survivingBucket],
            threads: [deletedThread, survivingThread],
            tags: [deletedTag, survivingTag],
            threadTags: [deletedThreadTag, survivingThreadTag],
            sessions: [deletedSession, survivingSession],
        });
        const onSelectThreadId = vi.fn();
        const onSelectSessionId = vi.fn();
        const onSelectRunId = vi.fn();

        const result = await deleteSidebarWorkspaceThreads({
            utils: mutationUtils.utils as never,
            profileId: 'profile_default',
            threadListQueryInput: {
                profileId: 'profile_default',
                activeTab: 'chat',
                showAllModes: true,
                groupView: 'workspace',
                scope: 'workspace',
                sort: 'latest',
            },
            buckets: [workspaceBucket, survivingBucket],
            threads: [deletedThread, survivingThread],
            tags: [deletedTag, survivingTag],
            threadTags: [deletedThreadTag, survivingThreadTag],
            selectedThreadId: deletedThread.id,
            selectedSessionId: deletedSession.id,
            selectedRunId: 'run_deleted',
            selectedThread: deletedThread,
            onSelectThreadId,
            onSelectSessionId,
            onSelectRunId,
            deleteWorkspaceThreads: vi.fn(() =>
                Promise.resolve({
                    deletedThreadIds: [deletedThread.id],
                    deletedTagIds: [deletedTag.id],
                    deletedConversationIds: [workspaceBucket.id],
                    sessionIds: [deletedSession.id],
                })
            ),
            workspaceFingerprint: 'ws_1',
            includeFavoriteThreads: false,
        });

        expect(result).toEqual({ ok: true });
        expect(mutationUtils.read().buckets).toEqual({ buckets: [survivingBucket] });
        expect(mutationUtils.read().threads?.threads).toEqual([survivingThread]);
        expect(mutationUtils.read().tags).toEqual({ tags: [survivingTag] });
        expect(mutationUtils.read().shellBootstrap?.threadTags).toEqual([survivingThreadTag]);
        expect(mutationUtils.read().sessions).toEqual({ sessions: [survivingSession] });
        expect(onSelectThreadId).toHaveBeenCalledWith(undefined);
        expect(onSelectSessionId).toHaveBeenCalledWith(undefined);
        expect(onSelectRunId).toHaveBeenCalledWith(undefined);
    });
});
