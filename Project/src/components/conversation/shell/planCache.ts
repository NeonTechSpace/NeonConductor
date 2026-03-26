import { trpc } from '@/web/trpc/client';

import type { EntityId, PlanRecordView, TopLevelTab } from '@/shared/contracts';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type OrchestratorLatestData = Awaited<ReturnType<TrpcUtils['orchestrator']['latestBySession']['fetch']>>;

export function setActivePlanCache(input: {
    utils: TrpcUtils;
    profileId: string;
    sessionId: EntityId<'sess'>;
    topLevelTab: TopLevelTab;
    planResult: { found: false } | { found: true; plan: PlanRecordView };
}) {
    input.utils.plan.getActive.setData(
        {
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
        },
        input.planResult
    );
}

export function setOrchestratorLatestCache(input: {
    utils: TrpcUtils;
    profileId: string;
    sessionId: EntityId<'sess'>;
    latest: OrchestratorLatestData;
}) {
    input.utils.orchestrator.latestBySession.setData(
        {
            profileId: input.profileId,
            sessionId: input.sessionId,
        },
        input.latest
    );
}
