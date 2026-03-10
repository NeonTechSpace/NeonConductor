import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/shared';
import {
    addInvalidation,
    hasPayloadKey,
    invalidateBucketList,
    invalidateShellBootstrap,
    invalidateTagList,
    invalidateThreadList,
} from '@/web/lib/runtime/invalidation/shared';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

function isThreadRelationEvent(event: RuntimeEventRecordV1, context: RuntimeEventContext): boolean {
    return Boolean(context.tagId || hasPayloadKey(event, 'tagIds'));
}

function isBucketAffectingThreadEvent(event: RuntimeEventRecordV1): boolean {
    return event.operation === 'remove' || hasPayloadKey(event, 'bucket');
}

function isTagRelationEvent(event: RuntimeEventRecordV1, context: RuntimeEventContext): boolean {
    return Boolean(context.threadId || context.tagId || hasPayloadKey(event, 'tagIds'));
}

export async function invalidateConversationQueries(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    await Promise.all([invalidateThreadList(utils, context.profileId), invalidateBucketList(utils, context.profileId)]);
}

export async function invalidateThreadQueries(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): Promise<void> {
    const invalidations: Promise<void>[] = [invalidateThreadList(utils, context.profileId)];
    if (isBucketAffectingThreadEvent(event)) {
        addInvalidation(invalidations, invalidateBucketList(utils, context.profileId));
    }
    if (isThreadRelationEvent(event, context)) {
        addInvalidation(invalidations, invalidateTagList(utils, context.profileId));
        addInvalidation(invalidations, invalidateShellBootstrap(utils, context.profileId));
    }

    await Promise.all(invalidations);
}

export async function invalidateTagQueries(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): Promise<void> {
    const invalidations: Promise<void>[] = [invalidateTagList(utils, context.profileId)];
    if (isTagRelationEvent(event, context)) {
        addInvalidation(invalidations, invalidateThreadList(utils, context.profileId));
        addInvalidation(invalidations, invalidateBucketList(utils, context.profileId));
        addInvalidation(invalidations, invalidateShellBootstrap(utils, context.profileId));
    }

    await Promise.all(invalidations);
}
