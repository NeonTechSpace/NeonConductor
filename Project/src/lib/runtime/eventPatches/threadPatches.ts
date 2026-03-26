import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import {
    patchThreadListRecord,
    replaceThreadTagRelations,
    toThreadListRecord,
    upsertBucketRecord,
    upsertTagRecord,
    upsertThreadListRecord,
} from '@/web/components/conversation/sidebar/sidebarCache';
import { updateMatchingQueryData } from '@/web/lib/runtime/eventPatches/queryCache';
import {
    readConversationRecord,
    readSessionSummaryRecord,
    readString,
    readStringArray,
    readTagRecord,
    readThreadRecord,
} from '@/web/lib/runtime/eventPatches/readers';
import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type {
    ConversationRecord,
    RuntimeEventRecordV1,
    SessionSummaryRecord,
    TagRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';


type ThreadListQueryData = {
    sort: 'latest' | 'alphabetical';
    showAllModes: boolean;
    groupView: 'workspace' | 'branch';
    threads: ReturnType<typeof toThreadListRecord>[];
};

export function applyThreadRuntimeEventPatch(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): boolean {
    const profileId = context.profileId;
    if (!profileId) {
        return false;
    }

    const bucket = readConversationRecord(event.payload['bucket']);
    const thread = readThreadRecord(event.payload['thread']);
    const tagIds = readStringArray(event.payload['tagIds']);
    const deletedThreadIds = readStringArray(event.payload['deletedThreadIds']);
    const deletedTagIds = readStringArray(event.payload['deletedTagIds']);
    const deletedConversationIds = readStringArray(event.payload['deletedConversationIds']);
    const sessionIds = readStringArray(event.payload['sessionIds']);
    const favoriteThreadId = readString(event.payload['threadId']);
    const nextFavorite = typeof event.payload['isFavorite'] === 'boolean' ? event.payload['isFavorite'] : undefined;

    if (bucket && thread) {
        updateMatchingQueryData<{ buckets: ConversationRecord[] }>(['conversation', 'listBuckets'], (current) =>
            current ? { buckets: upsertBucketRecord(current.buckets, bucket) } : current
        );
        updateMatchingQueryData<ThreadListQueryData>(['conversation', 'listThreads'], (current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                threads: upsertThreadListRecord(current.threads, toThreadListRecord({ bucket, thread }), current.sort),
            };
        });
        return true;
    }

    if (thread) {
        updateMatchingQueryData<ThreadListQueryData>(['conversation', 'listThreads'], (current) =>
            current
                ? {
                      ...current,
                      threads: patchThreadListRecord(current.threads, thread),
                  }
                : current
        );
        return true;
    }

    if (favoriteThreadId && nextFavorite !== undefined) {
        updateMatchingQueryData<ThreadListQueryData>(['conversation', 'listThreads'], (current) =>
            current
                ? {
                      ...current,
                      threads: current.threads.map((candidate) =>
                          candidate.id === favoriteThreadId ? { ...candidate, isFavorite: nextFavorite } : candidate
                      ),
                  }
                : current
        );
        return true;
    }

    const threadId = context.threadId;
    if (profileId && threadId && tagIds) {
        utils.runtime.getShellBootstrap.setData({ profileId }, (current) => {
            if (!current) {
                return current;
            }

            const nextThreadTags: ThreadTagRecord[] = tagIds
                .filter((tagId): tagId is ThreadTagRecord['tagId'] => isEntityId(tagId, 'tag'))
                .map((tagId) => ({
                    profileId,
                    threadId,
                    tagId,
                    createdAt: event.createdAt,
                }));

            return {
                ...current,
                threadTags: replaceThreadTagRelations(current.threadTags, threadId, nextThreadTags),
            };
        });
        return true;
    }

    if (deletedThreadIds && deletedTagIds && deletedConversationIds) {
        const deletedThreadIdsSet = new Set(deletedThreadIds);
        const deletedTagIdsSet = new Set(deletedTagIds);
        const deletedConversationIdsSet = new Set(deletedConversationIds);

        updateMatchingQueryData<{ buckets: ConversationRecord[] }>(['conversation', 'listBuckets'], (current) =>
            current
                ? {
                      buckets: current.buckets.filter(
                          (bucketRecord) => !deletedConversationIdsSet.has(bucketRecord.id)
                      ),
                  }
                : current
        );
        updateMatchingQueryData<ThreadListQueryData>(['conversation', 'listThreads'], (current) =>
            current
                ? {
                      ...current,
                      threads: current.threads.filter((threadRecord) => !deletedThreadIdsSet.has(threadRecord.id)),
                  }
                : current
        );
        updateMatchingQueryData<{ tags: TagRecord[] }>(['conversation', 'listTags'], (current) =>
            current
                ? {
                      tags: current.tags.filter((tagRecord) => !deletedTagIdsSet.has(tagRecord.id)),
                  }
                : current
        );
        utils.runtime.getShellBootstrap.setData({ profileId }, (current) => {
            if (!current) {
                return current;
            }

            return {
                ...current,
                threadTags: current.threadTags.filter(
                    (threadTag) =>
                        !deletedThreadIds.includes(threadTag.threadId) && !deletedTagIds.includes(threadTag.tagId)
                ),
            };
        });
        if (sessionIds) {
            const sessionIdsSet = new Set(sessionIds);
            updateMatchingQueryData<{ sessions: SessionSummaryRecord[] }>(['session', 'list'], (current) =>
                current
                    ? {
                          sessions: current.sessions.filter((session) => !sessionIdsSet.has(session.id)),
                      }
                    : current
            );
        }
        return true;
    }

    return false;
}

export function applySessionRuntimeEventPatch(event: RuntimeEventRecordV1): (() => boolean) | null {
    const session = readSessionSummaryRecord(event.payload['session']);
    if (!session) {
        return null;
    }

    return () => {
        updateMatchingQueryData<{ sessions: SessionSummaryRecord[] }>(['session', 'list'], (current) =>
            current
                ? {
                      sessions: [session, ...current.sessions.filter((candidate) => candidate.id !== session.id)].sort(
                          (left, right) => right.updatedAt.localeCompare(left.updatedAt)
                      ),
                  }
                : current
        );
        updateMatchingQueryData<ThreadListQueryData>(['conversation', 'listThreads'], (current) => {
            if (!current) {
                return current;
            }

            const existingThread = current.threads.find((candidate) => candidate.id === session.threadId);
            return {
                ...current,
                threads: current.threads.map((threadRecord) =>
                    threadRecord.id === session.threadId
                        ? {
                              ...threadRecord,
                              sessionCount: Math.max(existingThread?.sessionCount ?? 0, 1),
                              latestSessionUpdatedAt: session.updatedAt,
                          }
                        : threadRecord
                ),
            };
        });
        return true;
    };
}

export function applyTagRuntimeEventPatch(event: RuntimeEventRecordV1): boolean {
    const tag = readTagRecord(event.payload['tag']);
    if (!tag) {
        return false;
    }

    updateMatchingQueryData<{ tags: TagRecord[] }>(['conversation', 'listTags'], (current) =>
        current ? { tags: upsertTagRecord(current.tags, tag) } : current
    );
    return true;
}

