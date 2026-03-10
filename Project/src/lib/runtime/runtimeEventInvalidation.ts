import { invalidateNoopDomain, invalidateOrchestratorQueries, invalidatePlanQueries, invalidateProfileDomainQueries, invalidateRuntimeQueries } from '@/web/lib/runtime/invalidation/miscDomain';
import { invalidateProviderQueries } from '@/web/lib/runtime/invalidation/providerDomain';
import { invalidateMessageQueries, invalidateRunQueries, invalidateSessionQueries } from '@/web/lib/runtime/invalidation/sessionDomain';
import { getRuntimeEventContext, type RuntimeEventContext, type TrpcUtils } from '@/web/lib/runtime/invalidation/shared';
import { invalidateConversationQueries, invalidateTagQueries, invalidateThreadQueries } from '@/web/lib/runtime/invalidation/threadDomain';
import { applyRuntimeEventPatches } from '@/web/lib/runtime/runtimeEventPatches';

import type { RuntimeEventDomain, RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

const runtimeEventInvalidators: Record<
    RuntimeEventDomain,
    (utils: TrpcUtils, event: RuntimeEventRecordV1, context: RuntimeEventContext) => Promise<void>
> = {
    conversation: async (utils, _event, context) => {
        await invalidateConversationQueries(utils, context);
    },
    thread: invalidateThreadQueries,
    tag: invalidateTagQueries,
    session: async (utils, _event, context) => {
        await invalidateSessionQueries(utils, context);
    },
    run: async (utils, _event, context) => {
        await invalidateRunQueries(utils, context);
    },
    message: async (utils, _event, context) => {
        await invalidateMessageQueries(utils, context);
    },
    messagePart: async (utils, _event, context) => {
        await invalidateMessageQueries(utils, context);
    },
    provider: invalidateProviderQueries,
    diff: async (utils, _event, context) => {
        await invalidateRunQueries(utils, context);
    },
    plan: invalidatePlanQueries,
    checkpoint: async (utils, _event, context) => {
        await invalidateSessionQueries(utils, context);
    },
    orchestrator: async (utils, _event, context) => {
        await invalidateOrchestratorQueries(utils, context);
    },
    profile: async (utils, _event, context) => {
        await invalidateProfileDomainQueries(utils, context);
    },
    permission: invalidateNoopDomain,
    tool: invalidateNoopDomain,
    mcp: invalidateNoopDomain,
    runtime: async (utils, event) => {
        await invalidateRuntimeQueries(utils, event);
    },
};

export async function invalidateQueriesForRuntimeEvent(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1
): Promise<void> {
    const context = getRuntimeEventContext(event);
    const patched = applyRuntimeEventPatches(utils, event, context);
    if (patched) {
        return;
    }

    await runtimeEventInvalidators[event.domain](utils, event, context);
}
