import { orchestratorStore, orchestratorSwarmStore } from '@/app/backend/persistence/stores';
import type {
    OrchestratorRunRecord,
    OrchestratorStepRecord,
    OrchestratorSwarmContextEntryRecord,
    OrchestratorSwarmLaneRecord,
} from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';

export type OrchestratorStatusResult =
    | { found: false }
    | {
          found: true;
          run: OrchestratorRunRecord;
          steps: OrchestratorStepRecord[];
          swarmLanes: OrchestratorSwarmLaneRecord[];
          swarmContextEntries: OrchestratorSwarmContextEntryRecord[];
      };

export async function getOrchestratorStatus(
    profileId: string,
    orchestratorRunId: EntityId<'orch'>
): Promise<OrchestratorStatusResult> {
    const run = await orchestratorStore.getRunById(profileId, orchestratorRunId);
    if (!run) {
        return { found: false };
    }

    return {
        found: true,
        run,
        steps: await orchestratorStore.listSteps(orchestratorRunId),
        swarmLanes: await orchestratorSwarmStore.listLanes(orchestratorRunId),
        swarmContextEntries: await orchestratorSwarmStore.listContextEntries(orchestratorRunId),
    };
}

export async function getLatestOrchestratorBySession(
    profileId: string,
    sessionId: EntityId<'sess'>
): Promise<OrchestratorStatusResult> {
    const run = await orchestratorStore.getLatestBySession(profileId, sessionId);
    if (!run) {
        return { found: false };
    }

    return {
        found: true,
        run,
        steps: await orchestratorStore.listSteps(run.id),
        swarmLanes: await orchestratorSwarmStore.listLanes(run.id),
        swarmContextEntries: await orchestratorSwarmStore.listContextEntries(run.id),
    };
}
