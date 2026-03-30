import { describe, expect, it, vi } from 'vitest';

import { addSidebarTagToThread } from '@/web/components/conversation/sidebar/useSidebarTagMutationController';

import type { TagRecord, ThreadTagRecord } from '@/app/backend/persistence/types';

import { createSidebarMutationUtils } from './__tests__/sidebarMutationController.testUtils';

describe('useSidebarTagMutationController', () => {
    it('rolls back tag and shell-bootstrap caches when the tag write fails', async () => {
        const existingTag: TagRecord = {
            id: 'tag_existing',
            profileId: 'profile_default',
            label: 'Existing',
            createdAt: '2026-03-28T10:00:00.000Z',
            updatedAt: '2026-03-28T10:00:00.000Z',
        };
        const existingThreadTag: ThreadTagRecord = {
            profileId: 'profile_default',
            threadId: 'thr_1',
            tagId: existingTag.id,
            createdAt: '2026-03-28T10:00:00.000Z',
        };
        const mutationUtils = createSidebarMutationUtils({
            buckets: [],
            threads: [],
            tags: [existingTag],
            threadTags: [existingThreadTag],
            sessions: [],
        });

        const result = await addSidebarTagToThread({
            utils: mutationUtils.utils as never,
            profileId: 'profile_default',
            threadTagIdsByThread: new Map([['thr_1', [existingTag.id]]]),
            upsertTag: vi.fn(() =>
                Promise.resolve({
                    tag: {
                        id: 'tag_new',
                        profileId: 'profile_default',
                        label: 'New tag',
                        createdAt: '2026-03-29T10:00:00.000Z',
                        updatedAt: '2026-03-29T10:00:00.000Z',
                    },
                })
            ),
            setThreadTags: vi.fn(() => Promise.reject(new Error('Thread tag write failed.'))),
            threadId: 'thr_1',
            label: 'New tag',
        });

        expect(result).toEqual({
            ok: false,
            message: 'Thread tag write failed.',
        });
        expect(mutationUtils.read().tags).toEqual({ tags: [existingTag] });
        expect(mutationUtils.read().shellBootstrap?.threadTags).toEqual([existingThreadTag]);
    });
});
