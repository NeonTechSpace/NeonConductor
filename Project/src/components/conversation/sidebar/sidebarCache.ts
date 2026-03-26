import type {
    ConversationRecord,
    TagRecord,
    ThreadListRecord,
    ThreadRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';

function compareAlphabetical(left: ThreadListRecord, right: ThreadListRecord): number {
    const titleCompare = left.title.localeCompare(right.title, undefined, {
        sensitivity: 'base',
        numeric: true,
    });
    if (titleCompare !== 0) {
        return titleCompare;
    }

    return right.updatedAt.localeCompare(left.updatedAt);
}

export function toThreadListRecord(input: { bucket: ConversationRecord; thread: ThreadRecord }): ThreadListRecord {
    return {
        ...input.thread,
        scope: input.bucket.scope,
        ...(input.bucket.workspaceFingerprint ? { workspaceFingerprint: input.bucket.workspaceFingerprint } : {}),
        anchorKind: input.bucket.scope === 'workspace' ? 'workspace' : 'playground',
        ...(input.bucket.scope === 'workspace'
            ? { anchorId: input.bucket.workspaceFingerprint ?? 'unknown-workspace' }
            : { anchorId: 'playground' }),
        sessionCount: 0,
    };
}

export function upsertBucketRecord(buckets: ConversationRecord[], bucket: ConversationRecord): ConversationRecord[] {
    const withoutExisting = buckets.filter((currentBucket) => currentBucket.id !== bucket.id);
    return [bucket, ...withoutExisting];
}

export function upsertThreadListRecord(
    threads: ThreadListRecord[],
    thread: ThreadListRecord,
    sort: 'latest' | 'alphabetical'
): ThreadListRecord[] {
    const withoutExisting = threads.filter((currentThread) => currentThread.id !== thread.id);
    if (sort === 'alphabetical') {
        return [...withoutExisting, thread].sort(compareAlphabetical);
    }

    return [thread, ...withoutExisting];
}

export function patchThreadListRecord(threads: ThreadListRecord[], updatedThread: ThreadRecord): ThreadListRecord[] {
    return threads.map((thread) =>
        thread.id === updatedThread.id
            ? {
                  ...thread,
                  ...updatedThread,
              }
            : thread
    );
}

export function upsertTagRecord(tags: TagRecord[], tag: TagRecord): TagRecord[] {
    const withoutExisting = tags.filter((currentTag) => currentTag.id !== tag.id);
    return [...withoutExisting, tag].sort((left, right) =>
        left.label.localeCompare(right.label, undefined, {
            sensitivity: 'base',
            numeric: true,
        })
    );
}

export function replaceThreadTagRelations(
    threadTags: ThreadTagRecord[],
    threadId: string,
    nextThreadTags: ThreadTagRecord[]
): ThreadTagRecord[] {
    return [...threadTags.filter((threadTag) => threadTag.threadId !== threadId), ...nextThreadTags];
}

export function removeDeletedSidebarRecords(input: {
    buckets: ConversationRecord[];
    threads: ThreadListRecord[];
    tags: TagRecord[];
    threadTags: ThreadTagRecord[];
    deletedThreadIds: string[];
    deletedTagIds: string[];
    deletedConversationIds: string[];
}) {
    const deletedThreadIdSet = new Set(input.deletedThreadIds);
    const deletedTagIdSet = new Set(input.deletedTagIds);
    const deletedConversationIdSet = new Set(input.deletedConversationIds);

    return {
        buckets: input.buckets.filter((bucket) => !deletedConversationIdSet.has(bucket.id)),
        threads: input.threads.filter((thread) => !deletedThreadIdSet.has(thread.id)),
        tags: input.tags.filter((tag) => !deletedTagIdSet.has(tag.id)),
        threadTags: input.threadTags.filter(
            (threadTag) => !deletedThreadIdSet.has(threadTag.threadId) && !deletedTagIdSet.has(threadTag.tagId)
        ),
    };
}
