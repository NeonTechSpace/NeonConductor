import { planStore } from '@/app/backend/persistence/stores';
import type { EntityId, PlanImplementInput, PlanRecordView } from '@/app/backend/runtime/contracts';
import { orchestratorExecutionService } from '@/app/backend/runtime/services/orchestrator/executionService';
import type { PlanServiceError } from '@/app/backend/runtime/services/plan/errors';
import { appendPlanImplementationStartedEvent } from '@/app/backend/runtime/services/plan/events';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';
import { appLog } from '@/app/main/logging';

type StoredPlan = NonNullable<Awaited<ReturnType<typeof planStore.getById>>>;

export type PlanImplementationResult =
    | { started: true; mode: 'agent.code'; runId: EntityId<'run'>; plan: PlanRecordView }
    | { started: true; mode: 'orchestrator.orchestrate'; orchestratorRunId: EntityId<'orch'>; plan: PlanRecordView };

function buildAgentImplementationPrompt(input: { summaryMarkdown: string; itemDescriptions: string[] }): string {
    const taskList = input.itemDescriptions.map((description) => `- ${description}`).join('\n');
    return [
        'Implement the approved plan.',
        '',
        'Plan summary:',
        input.summaryMarkdown,
        '',
        'Plan steps:',
        taskList.length > 0 ? taskList : '- No explicit steps were provided.',
    ].join('\n');
}

export async function implementApprovedPlan(input: {
    profileId: string;
    plan: StoredPlan;
    implementationInput: PlanImplementInput;
}): Promise<PlanImplementationResult | PlanServiceError> {
    if (input.plan.topLevelTab === 'agent') {
        const items = await planStore.listItems(input.plan.id);
        const implementationPrompt = buildAgentImplementationPrompt({
            summaryMarkdown: input.plan.summaryMarkdown,
            itemDescriptions: items.map((item) => item.description),
        });

        const result = await runExecutionService.startRun({
            profileId: input.profileId,
            sessionId: input.plan.sessionId,
            prompt: implementationPrompt,
            topLevelTab: 'agent',
            modeKey: 'code',
            runtimeOptions: input.implementationInput.runtimeOptions,
            ...(input.implementationInput.providerId ? { providerId: input.implementationInput.providerId } : {}),
            ...(input.implementationInput.modelId ? { modelId: input.implementationInput.modelId } : {}),
            ...(input.implementationInput.workspaceFingerprint
                ? { workspaceFingerprint: input.implementationInput.workspaceFingerprint }
                : {}),
        });

        if (!result.accepted) {
            const failure: PlanServiceError = {
                code: 'run_start_failed',
                message: `Plan implementation failed to start: ${result.reason}.`,
            };
            appLog.warn({
                tag: 'plan',
                message: 'Failed to start implementation run for approved plan.',
                profileId: input.profileId,
                planId: input.plan.id,
                code: failure.code,
                error: failure.message,
                reason: result.reason,
            });
            return failure;
        }

        const implementing = await planStore.markImplementing(input.plan.id, result.runId);
        await appendPlanImplementationStartedEvent({
            profileId: input.profileId,
            planId: input.plan.id,
            mode: 'agent.code',
            runId: result.runId,
        });

        appLog.info({
            tag: 'plan',
            message: 'Started agent implementation run from approved plan.',
            profileId: input.profileId,
            planId: input.plan.id,
            runId: result.runId,
        });

        return {
            started: true,
            mode: 'agent.code',
            runId: result.runId,
            plan: requirePlanView(implementing, items, 'plan.implement.agent'),
        };
    }

    if (input.plan.topLevelTab === 'orchestrator') {
        const startedResult = await orchestratorExecutionService.start({
            profileId: input.profileId,
            planId: input.plan.id,
            runtimeOptions: input.implementationInput.runtimeOptions,
            ...(input.implementationInput.executionStrategy
                ? { executionStrategy: input.implementationInput.executionStrategy }
                : {}),
            ...(input.implementationInput.providerId ? { providerId: input.implementationInput.providerId } : {}),
            ...(input.implementationInput.modelId ? { modelId: input.implementationInput.modelId } : {}),
            ...(input.implementationInput.workspaceFingerprint
                ? { workspaceFingerprint: input.implementationInput.workspaceFingerprint }
                : {}),
        });
        if (startedResult.isErr()) {
            return {
                code: 'run_start_failed',
                message: `Plan implementation failed to start: ${startedResult.error.message}`,
            };
        }
        const started = startedResult.value;
        const implementing = await planStore.markImplementing(input.plan.id, undefined, started.run.id);
        const items = await planStore.listItems(input.plan.id);

        await appendPlanImplementationStartedEvent({
            profileId: input.profileId,
            planId: input.plan.id,
            mode: 'orchestrator.orchestrate',
            orchestratorRunId: started.run.id,
        });

        appLog.info({
            tag: 'plan',
            message: 'Started orchestrator implementation run from approved plan.',
            profileId: input.profileId,
            planId: input.plan.id,
            orchestratorRunId: started.run.id,
        });

        return {
            started: true,
            mode: 'orchestrator.orchestrate',
            orchestratorRunId: started.run.id,
            plan: requirePlanView(implementing, items, 'plan.implement.orchestrator'),
        };
    }

    return {
        code: 'unsupported_tab',
        message: 'Chat plans cannot be implemented through plan.implement.',
    };
}
