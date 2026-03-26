import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/shared';
import {
    addInvalidation,
    hasSelectedWorkspaceImpact,
    invalidateSelectedMessages,
    invalidateSessionAttachedRules,
    invalidateSessionAttachedSkills,
    invalidateRunDiffs,
    invalidateSessionCheckpoints,
    invalidateSessionList,
    invalidateSessionRuns,
    invalidateSessionStatus,
    invalidateThreadList,
} from '@/web/lib/runtime/invalidation/shared';

export async function invalidateSessionQueries(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    const invalidations: Promise<void>[] = [
        invalidateSessionList(utils, context.profileId),
        invalidateSessionStatus(utils, context.profileId, context.sessionId),
        invalidateThreadList(utils, context.profileId),
        invalidateSessionCheckpoints(utils, context.profileId, context.sessionId),
        invalidateSessionAttachedRules(utils),
        invalidateSessionAttachedSkills(utils),
    ];

    if (hasSelectedWorkspaceImpact(context)) {
        addInvalidation(
            invalidations,
            invalidateSessionRuns(utils, context.profileId, context.selection.selectedSessionId)
        );
        addInvalidation(invalidations, invalidateSelectedMessages(utils, context));
    }

    await Promise.all(invalidations);
}

export async function invalidateRunQueries(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    const invalidations: Promise<void>[] = [
        invalidateSessionList(utils, context.profileId),
        invalidateSessionStatus(utils, context.profileId, context.sessionId),
        invalidateThreadList(utils, context.profileId),
        invalidateSessionRuns(utils, context.profileId, context.sessionId),
        invalidateRunDiffs(utils, context.profileId, context.runId),
        invalidateSessionCheckpoints(utils, context.profileId, context.sessionId),
        invalidateSessionAttachedRules(utils),
        invalidateSessionAttachedSkills(utils),
    ];

    if (hasSelectedWorkspaceImpact(context)) {
        addInvalidation(invalidations, invalidateSelectedMessages(utils, context));
    }

    await Promise.all(invalidations);
}

export async function invalidateMessageQueries(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    if (!hasSelectedWorkspaceImpact(context)) {
        return;
    }

    await invalidateSelectedMessages(utils, context);
}
