import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type { EntityId } from '@/app/backend/runtime/contracts';

export function addInvalidation(
    invalidations: Array<Promise<unknown>>,
    task: Promise<unknown> | undefined
): void {
    if (task) {
        invalidations.push(task);
    }
}

export function invalidateThreadList(utils: TrpcUtils, profileId: string | undefined): Promise<unknown> {
    return profileId
        ? utils.conversation.listThreads.invalidate({ profileId })
        : utils.conversation.listThreads.invalidate();
}

export function invalidateBucketList(utils: TrpcUtils, profileId: string | undefined): Promise<unknown> {
    return profileId
        ? utils.conversation.listBuckets.invalidate({ profileId })
        : utils.conversation.listBuckets.invalidate();
}

export function invalidateTagList(utils: TrpcUtils, profileId: string | undefined): Promise<unknown> {
    return profileId ? utils.conversation.listTags.invalidate({ profileId }) : utils.conversation.listTags.invalidate();
}

export function invalidateShellBootstrap(utils: TrpcUtils, profileId: string | undefined): Promise<unknown> {
    return profileId
        ? utils.runtime.getShellBootstrap.invalidate({ profileId })
        : utils.runtime.getShellBootstrap.invalidate();
}

export function invalidateSessionList(utils: TrpcUtils, profileId: string | undefined): Promise<unknown> {
    return profileId ? utils.session.list.invalidate({ profileId }) : utils.session.list.invalidate();
}

export function invalidateSessionStatus(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined
): Promise<unknown> {
    if (profileId && sessionId) {
        return utils.session.status.invalidate({ profileId, sessionId });
    }

    return utils.session.status.invalidate();
}

export function invalidateSessionRuns(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined
): Promise<unknown> {
    if (profileId && sessionId) {
        return utils.session.listRuns.invalidate({ profileId, sessionId });
    }

    return utils.session.listRuns.invalidate();
}

export function invalidateRunDiffs(
    utils: TrpcUtils,
    profileId: string | undefined,
    runId: EntityId<'run'> | undefined
): Promise<unknown> {
    if (profileId && runId) {
        return utils.diff.listByRun.invalidate({ profileId, runId });
    }

    return utils.diff.listByRun.invalidate();
}

export function invalidateSessionCheckpoints(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined
): Promise<unknown> {
    if (profileId && sessionId) {
        return utils.checkpoint.list.invalidate({ profileId, sessionId });
    }

    return utils.checkpoint.list.invalidate();
}

export function invalidateSessionMessages(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined,
    runId?: EntityId<'run'>
): Promise<unknown> {
    if (profileId && sessionId) {
        return utils.session.listMessages.invalidate({
            profileId,
            sessionId,
            ...(runId ? { runId } : {}),
        });
    }

    return utils.session.listMessages.invalidate();
}

export function invalidateSelectedMessages(utils: TrpcUtils, context: RuntimeEventContext): Promise<unknown> {
    return invalidateSessionMessages(
        utils,
        context.profileId,
        context.selection.selectedSessionId,
        context.selection.selectedRunId
    );
}

export function invalidatePlanActive(utils: TrpcUtils, context: RuntimeEventContext): Promise<unknown> {
    if (context.profileId && context.sessionId && context.topLevelTab) {
        return utils.plan.getActive.invalidate({
            profileId: context.profileId,
            sessionId: context.sessionId,
            topLevelTab: context.topLevelTab,
        });
    }

    return utils.plan.getActive.invalidate();
}

export function invalidateOrchestratorLatest(utils: TrpcUtils, context: RuntimeEventContext): Promise<unknown> {
    if (context.profileId && context.sessionId) {
        return utils.orchestrator.latestBySession.invalidate({
            profileId: context.profileId,
            sessionId: context.sessionId,
        });
    }

    return utils.orchestrator.latestBySession.invalidate();
}

export function invalidateProfileQueries(utils: TrpcUtils, profileId: string | undefined): Promise<void> {
    return Promise.all([
        utils.profile.list.invalidate(),
        utils.profile.getActive.invalidate(),
        invalidateShellBootstrap(utils, profileId),
    ]).then(() => undefined);
}

export async function invalidateRuntimeResetQueries(utils: TrpcUtils): Promise<void> {
    await Promise.all([
        utils.runtime.getShellBootstrap.invalidate(),
        utils.runtime.getDiagnosticSnapshot.invalidate(),
        utils.conversation.listBuckets.invalidate(),
        utils.conversation.listTags.invalidate(),
        utils.conversation.listThreads.invalidate(),
        utils.session.list.invalidate(),
        utils.session.status.invalidate(),
        utils.session.listRuns.invalidate(),
        utils.session.listMessages.invalidate(),
        utils.diff.listByRun.invalidate(),
        utils.diff.getFilePatch.invalidate(),
        utils.checkpoint.list.invalidate(),
        utils.provider.listProviders.invalidate(),
        utils.provider.getDefaults.invalidate(),
        utils.provider.listModels.invalidate(),
        utils.provider.getAuthState.invalidate(),
        utils.provider.getAccountContext.invalidate(),
        utils.provider.getEndpointProfile.invalidate(),
        utils.provider.getModelRoutingPreference.invalidate(),
        utils.provider.listModelProviders.invalidate(),
        utils.provider.getUsageSummary.invalidate(),
        utils.provider.getOpenAISubscriptionUsage.invalidate(),
        utils.provider.getOpenAISubscriptionRateLimits.invalidate(),
        utils.plan.getActive.invalidate(),
        utils.orchestrator.latestBySession.invalidate(),
        utils.profile.list.invalidate(),
        utils.profile.getActive.invalidate(),
        utils.mode.list.invalidate(),
        utils.mode.getActive.invalidate(),
        utils.registry.listResolved.invalidate(),
        utils.registry.searchSkills.invalidate(),
        utils.permission.listPending.invalidate(),
        utils.tool.list.invalidate(),
        utils.mcp.listServers.invalidate(),
    ]);
}
