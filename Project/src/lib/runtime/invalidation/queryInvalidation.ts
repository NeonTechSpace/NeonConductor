import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type { EntityId } from '@/shared/contracts';

function toVoidPromise<TResult>(task: Promise<TResult>): Promise<void> {
    return task.then(() => undefined);
}

export function addInvalidation(invalidations: Promise<void>[], task: Promise<void> | undefined): void {
    if (task) {
        invalidations.push(task);
    }
}

export function invalidateThreadList(utils: TrpcUtils, profileId: string | undefined): Promise<void> {
    return toVoidPromise(
        profileId
            ? utils.conversation.listThreads.invalidate({ profileId })
            : utils.conversation.listThreads.invalidate()
    );
}

export function invalidateBucketList(utils: TrpcUtils, profileId: string | undefined): Promise<void> {
    return toVoidPromise(
        profileId
            ? utils.conversation.listBuckets.invalidate({ profileId })
            : utils.conversation.listBuckets.invalidate()
    );
}

export function invalidateTagList(utils: TrpcUtils, profileId: string | undefined): Promise<void> {
    return toVoidPromise(
        profileId ? utils.conversation.listTags.invalidate({ profileId }) : utils.conversation.listTags.invalidate()
    );
}

export function invalidateShellBootstrap(utils: TrpcUtils, profileId: string | undefined): Promise<void> {
    return toVoidPromise(
        profileId
            ? utils.runtime.getShellBootstrap.invalidate({ profileId })
            : utils.runtime.getShellBootstrap.invalidate()
    );
}

export function invalidateSessionList(utils: TrpcUtils, profileId: string | undefined): Promise<void> {
    return toVoidPromise(profileId ? utils.session.list.invalidate({ profileId }) : utils.session.list.invalidate());
}

export function invalidateSessionStatus(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined
): Promise<void> {
    if (profileId && sessionId) {
        return toVoidPromise(utils.session.status.invalidate({ profileId, sessionId }));
    }

    return toVoidPromise(utils.session.status.invalidate());
}

export function invalidateSessionRuns(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined
): Promise<void> {
    if (profileId && sessionId) {
        return toVoidPromise(utils.session.listRuns.invalidate({ profileId, sessionId }));
    }

    return toVoidPromise(utils.session.listRuns.invalidate());
}

export function invalidateRunDiffs(
    utils: TrpcUtils,
    profileId: string | undefined,
    runId: EntityId<'run'> | undefined
): Promise<void> {
    if (profileId && runId) {
        return toVoidPromise(utils.diff.listByRun.invalidate({ profileId, runId }));
    }

    return toVoidPromise(utils.diff.listByRun.invalidate());
}

export function invalidateSessionCheckpoints(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined
): Promise<void> {
    if (profileId && sessionId) {
        return toVoidPromise(utils.checkpoint.list.invalidate({ profileId, sessionId }));
    }

    return toVoidPromise(utils.checkpoint.list.invalidate());
}

export function invalidateSessionMessages(
    utils: TrpcUtils,
    profileId: string | undefined,
    sessionId: EntityId<'sess'> | undefined,
    runId?: EntityId<'run'>
): Promise<void> {
    if (profileId && sessionId) {
        return toVoidPromise(
            utils.session.listMessages.invalidate({
                profileId,
                sessionId,
                ...(runId ? { runId } : {}),
            })
        );
    }

    return toVoidPromise(utils.session.listMessages.invalidate());
}

export function invalidateSelectedMessages(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    return invalidateSessionMessages(
        utils,
        context.profileId,
        context.selection.selectedSessionId,
        context.selection.selectedRunId
    );
}

export function invalidatePlanActive(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    if (context.profileId && context.sessionId && context.topLevelTab) {
        return toVoidPromise(
            utils.plan.getActive.invalidate({
                profileId: context.profileId,
                sessionId: context.sessionId,
                topLevelTab: context.topLevelTab,
            })
        );
    }

    return toVoidPromise(utils.plan.getActive.invalidate());
}

export function invalidateOrchestratorLatest(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    if (context.profileId && context.sessionId) {
        return toVoidPromise(
            utils.orchestrator.latestBySession.invalidate({
                profileId: context.profileId,
                sessionId: context.sessionId,
            })
        );
    }

    return toVoidPromise(utils.orchestrator.latestBySession.invalidate());
}

export function invalidateProfileQueries(utils: TrpcUtils, profileId: string | undefined): Promise<void> {
    return Promise.all([
        utils.profile.list.invalidate(),
        utils.profile.getActive.invalidate(),
        utils.profile.getExecutionPreset.invalidate(),
        utils.profile.getUtilityModel.invalidate(),
        invalidateShellBootstrap(utils, profileId),
    ]).then(() => undefined);
}

export async function invalidateRuntimeResetQueries(utils: TrpcUtils): Promise<void> {
    const invalidations: Promise<void>[] = [
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
        utils.provider.getConnectionProfile.invalidate(),
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
        utils.registry.searchRules.invalidate(),
        utils.registry.searchSkills.invalidate(),
        utils.permission.listPending.invalidate(),
        utils.tool.list.invalidate(),
        utils.mcp.listServers.invalidate(),
        utils.mcp.getServer.invalidate(),
    ].map(toVoidPromise);

    invalidations.push(toVoidPromise(utils.profile.getExecutionPreset.invalidate()));
    invalidations.push(toVoidPromise(utils.profile.getUtilityModel.invalidate()));
    invalidations.push(toVoidPromise(utils.runtime.listWorkspaceRoots.invalidate()));
    invalidations.push(toVoidPromise(utils.sandbox.list.invalidate()));
    invalidations.push(toVoidPromise(utils.session.getAttachedRules.invalidate()));
    invalidations.push(toVoidPromise(utils.session.getAttachedSkills.invalidate()));
    invalidations.push(toVoidPromise(utils.conversation.getEditPreference.invalidate()));
    invalidations.push(toVoidPromise(utils.conversation.getThreadTitlePreference.invalidate()));

    await Promise.all(invalidations);
}

export function invalidateSessionAttachedRules(utils: TrpcUtils): Promise<void> {
    return toVoidPromise(utils.session.getAttachedRules.invalidate());
}

export function invalidateSessionAttachedSkills(utils: TrpcUtils): Promise<void> {
    return toVoidPromise(utils.session.getAttachedSkills.invalidate());
}
