import { describe, expect, it } from 'vitest';

import {
    patchThreadListRecord,
    removeDeletedSidebarRecords,
    replaceThreadTagRelations,
    toThreadListRecord,
    upsertBucketRecord,
    upsertTagRecord,
    upsertThreadListRecord,
} from '@/web/components/conversation/sidebar/sidebarCache';

import type {
    ConversationRecord,
    TagRecord,
    ThreadListRecord,
    ThreadRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';

function createBucket(overrides: Partial<ConversationRecord> = {}): ConversationRecord {
    return {
        id: 'conv_workspace',
        profileId: 'profile_test',
        scope: 'workspace',
        workspaceFingerprint: 'wsf_workspace',
        title: 'Workspace',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

function createThread(overrides: Partial<ThreadRecord> = {}): ThreadRecord {
    return {
        id: 'thr_thread',
        profileId: 'profile_test',
        conversationId: 'conv_workspace',
        title: 'Thread',
        topLevelTab: 'chat',
        rootThreadId: 'thr_thread',
        isFavorite: false,
        executionEnvironmentMode: 'local',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

function createThreadList(overrides: Partial<ThreadListRecord> = {}): ThreadListRecord {
    return {
        ...toThreadListRecord({
            bucket: createBucket(),
            thread: createThread(),
        }),
        ...overrides,
    };
}

function createTag(overrides: Partial<TagRecord> = {}): TagRecord {
    return {
        id: 'tag_backend',
        profileId: 'profile_test',
        label: 'backend',
        createdAt: '2026-03-10T10:00:00.000Z',
        updatedAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

function createThreadTag(overrides: Partial<ThreadTagRecord> = {}): ThreadTagRecord {
    return {
        profileId: 'profile_test',
        threadId: 'thr_thread',
        tagId: 'tag_backend',
        createdAt: '2026-03-10T10:00:00.000Z',
        ...overrides,
    };
}

describe('sidebarCache', () => {
    it('creates a list record from a created thread and bucket', () => {
        const record = toThreadListRecord({
            bucket: createBucket(),
            thread: createThread(),
        });

        expect(record.scope).toBe('workspace');
        expect(record.workspaceFingerprint).toBe('wsf_workspace');
        expect(record.anchorKind).toBe('workspace');
        expect(record.sessionCount).toBe(0);
    });

    it('upserts buckets and threads without duplicating them', () => {
        const nextBucket = createBucket({ id: 'conv_two', title: 'Workspace Two' });
        const nextThread = createThreadList({ id: 'thr_two', title: 'Bravo', conversationId: 'conv_two' });

        expect(upsertBucketRecord([createBucket()], nextBucket).map((bucket) => bucket.id)).toEqual([
            'conv_two',
            'conv_workspace',
        ]);
        expect(
            upsertThreadListRecord(
                [createThreadList({ id: 'thr_one', title: 'Alpha' })],
                nextThread,
                'alphabetical'
            ).map((thread) => thread.id)
        ).toEqual(['thr_one', 'thr_two']);
    });

    it('patches favorite state in-place', () => {
        const updated = patchThreadListRecord(
            [createThreadList({ id: 'thr_one', isFavorite: false })],
            createThread({ id: 'thr_one', isFavorite: true })
        );

        expect(updated[0]?.isFavorite).toBe(true);
    });

    it('upserts tags and replaces per-thread tag relations', () => {
        const tags = upsertTagRecord([createTag({ id: 'tag_zed', label: 'zed' })], createTag());
        const threadTags = replaceThreadTagRelations(
            [createThreadTag({ threadId: 'thr_one', tagId: 'tag_old' })],
            'thr_one',
            [createThreadTag({ threadId: 'thr_one', tagId: 'tag_backend' })]
        );

        expect(tags.map((tag) => tag.label)).toEqual(['backend', 'zed']);
        expect(threadTags).toEqual([createThreadTag({ threadId: 'thr_one', tagId: 'tag_backend' })]);
    });

    it('removes deleted threads, buckets, tags, and thread-tag relations together', () => {
        const result = removeDeletedSidebarRecords({
            buckets: [createBucket()],
            threads: [createThreadList()],
            tags: [createTag()],
            threadTags: [createThreadTag()],
            deletedThreadIds: ['thr_thread'],
            deletedTagIds: ['tag_backend'],
            deletedConversationIds: ['conv_workspace'],
        });

        expect(result.buckets).toEqual([]);
        expect(result.threads).toEqual([]);
        expect(result.tags).toEqual([]);
        expect(result.threadTags).toEqual([]);
    });
});
