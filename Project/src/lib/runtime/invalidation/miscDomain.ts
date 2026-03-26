import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/shared';
import {
    addInvalidation,
    hasPayloadKey,
    invalidateOrchestratorLatest,
    invalidatePlanActive,
    invalidateProfileQueries,
    invalidateRuntimeResetQueries,
    invalidateSessionRuns,
} from '@/web/lib/runtime/invalidation/shared';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

export async function invalidatePlanQueries(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): Promise<void> {
    const invalidations: Promise<void>[] = [invalidatePlanActive(utils, context)];
    if (hasPayloadKey(event, 'runId') || hasPayloadKey(event, 'orchestratorRunId')) {
        addInvalidation(invalidations, invalidateSessionRuns(utils, context.profileId, context.sessionId));
    }

    await Promise.all(invalidations);
}

export async function invalidateOrchestratorQueries(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    await invalidateOrchestratorLatest(utils, context);
}

export async function invalidateProfileDomainQueries(utils: TrpcUtils, context: RuntimeEventContext): Promise<void> {
    await invalidateProfileQueries(utils, context.profileId);
}

export async function invalidateRuntimeQueries(utils: TrpcUtils, event: RuntimeEventRecordV1): Promise<void> {
    if (event.operation !== 'reset') {
        return;
    }

    await invalidateRuntimeResetQueries(utils);
}

export async function invalidateNoopDomain(): Promise<void> {}
