import { orchestratorLazyStore, orchestratorStore, orchestratorSwarmStore } from '@/app/backend/persistence/stores';
import type {
    OrchestratorRunRecord,
    OrchestratorStepRecord,
    OrchestratorSwarmContextEntryRecord,
    OrchestratorSwarmLaneRecord,
} from '@/app/backend/persistence/types';
import type { EntityId, OrchestratorLazyProjectionView } from '@/app/backend/runtime/contracts';

export type OrchestratorStatusResult =
    | { found: false }
    | {
          found: true;
          run: OrchestratorRunRecord;
          steps: OrchestratorStepRecord[];
          swarmLanes: OrchestratorSwarmLaneRecord[];
          swarmContextEntries: OrchestratorSwarmContextEntryRecord[];
          lazy?: OrchestratorLazyProjectionView;
      };

async function getLazyProjection(orchestratorRunId: EntityId<'orch'>): Promise<OrchestratorLazyProjectionView | undefined> {
    const objective = await orchestratorLazyStore.getObjectiveByRunId(orchestratorRunId);
    if (!objective) {
        return undefined;
    }

    const walkthrough = await orchestratorLazyStore.getWalkthrough(orchestratorRunId);
    return {
        objective,
        objectiveSegments: await orchestratorLazyStore.listObjectiveSegments(orchestratorRunId),
        taskTree: await orchestratorLazyStore.listTasks(orchestratorRunId),
        checkpoints: await orchestratorLazyStore.listCheckpoints(orchestratorRunId),
        techDecisions: await orchestratorLazyStore.listTechDecisions(orchestratorRunId),
        packageAssessments: await orchestratorLazyStore.listPackageAssessments(orchestratorRunId),
        workingArtifacts: await orchestratorLazyStore.listWorkingArtifacts(orchestratorRunId),
        executionPhases: await orchestratorLazyStore.listExecutionPhases(orchestratorRunId),
        ...(walkthrough ? { walkthrough } : {}),
    };
}

export async function getOrchestratorStatus(
    profileId: string,
    orchestratorRunId: EntityId<'orch'>
): Promise<OrchestratorStatusResult> {
    const run = await orchestratorStore.getRunById(profileId, orchestratorRunId);
    if (!run) {
        return { found: false };
    }

    const lazy = await getLazyProjection(orchestratorRunId);
    return {
        found: true,
        run,
        steps: await orchestratorStore.listSteps(orchestratorRunId),
        swarmLanes: await orchestratorSwarmStore.listLanes(orchestratorRunId),
        swarmContextEntries: await orchestratorSwarmStore.listContextEntries(orchestratorRunId),
        ...(lazy ? { lazy } : {}),
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

    const lazy = await getLazyProjection(run.id);
    return {
        found: true,
        run,
        steps: await orchestratorStore.listSteps(run.id),
        swarmLanes: await orchestratorSwarmStore.listLanes(run.id),
        swarmContextEntries: await orchestratorSwarmStore.listContextEntries(run.id),
        ...(lazy ? { lazy } : {}),
    };
}
