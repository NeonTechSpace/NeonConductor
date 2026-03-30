import { describe, expect, it, vi } from 'vitest';

import { toggleSidebarThreadFavorite } from '@/web/components/conversation/sidebar/useSidebarFavoriteMutationController';

import type { ThreadListRecord } from '@/app/backend/persistence/types';

import { createSidebarMutationUtils } from './__tests__/sidebarMutationController.testUtils';

function createThreadListRecord(overrides: Partial<ThreadListRecord> = {}): ThreadListRecord {
    return {
        id: 'thr_1',
        profileId: 'profile_default',
        conversationId: 'conv_1',
        title: 'Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_1',
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

describe('useSidebarFavoriteMutationController', () => {
    it('rolls back the optimistic favorite patch when the write fails', async () => {
        const thread = createThreadListRecord();
        const mutationUtils = createSidebarMutationUtils({
            buckets: [],
            threads: [thread],
            tags: [],
            threadTags: [],
            sessions: [],
        });

        const result = await toggleSidebarThreadFavorite({
            utils: mutationUtils.utils as never,
            profileId: 'profile_default',
            threadListQueryInput: {
                profileId: 'profile_default',
                activeTab: 'chat',
                showAllModes: true,
                groupView: 'workspace',
                scope: 'workspace',
                workspaceFingerprint: 'ws_1',
                sort: 'latest',
            },
            threads: [thread],
            setThreadFavorite: vi.fn(() => Promise.reject(new Error('Favorite write failed.'))),
            threadId: thread.id,
            nextFavorite: true,
        });

        expect(result).toEqual({
            ok: false,
            message: 'Favorite write failed.',
        });
        expect(mutationUtils.read().threads?.threads[0]?.isFavorite).toBe(false);
    });
});
