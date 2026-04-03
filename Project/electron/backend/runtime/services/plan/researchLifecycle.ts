import { messageStore, planStore } from '@/app/backend/persistence/stores';
import type {
    MessagePartRecord,
    PlanRecord,
    PlanResearchBatchRecord,
    PlanResearchWorkerRecord,
} from '@/app/backend/persistence/types';
import type {
    EntityId,
    PlanAbortResearchBatchInput,
    PlanRecordView,
    PlanStartResearchBatchInput,
} from '@/app/backend/runtime/contracts';
import {
    abortDelegatedChildRun,
    resolveDelegatedChildRootExecutionContext,
    startDelegatedChildLaneRun,
    waitForRunTerminal,
    type DelegatedChildRootExecutionContext,
} from '@/app/backend/runtime/services/common/delegatedChildLane';
import { readPlannerResearchCapacity } from '@/app/backend/runtime/services/plan/capacity';
import { errPlan, okPlan, type PlanServiceError } from '@/app/backend/runtime/services/plan/errors';
import {
    buildPlannerResearchWorkerPromptMarkdown,
    parsePlannerResearchWorkerResponse,
} from '@/app/backend/runtime/services/plan/prompt';
import { buildPlanResearchRecommendation } from '@/app/backend/runtime/services/plan/recommendation';
import { requirePlanView } from '@/app/backend/runtime/services/plan/views';
import { resolvePlanningWorkflowRoutingRunTarget } from '@/app/backend/runtime/services/plan/workflowRoutingTarget';
import { appLog } from '@/app/main/logging';

import type { Result } from 'neverthrow';

function trimPromptMarkdown(promptMarkdown: string): string {
    return promptMarkdown.trim();
}

function readWorkerThreadTitle(worker: PlanResearchWorkerRecord): string {
    const title = `Research ${String(worker.sequence)}: ${worker.label}`;
    return title.length <= 88 ? title : `${title.slice(0, 85).trimEnd()}...`;
}

function readTextPayload(part: MessagePartRecord): string {
    const text = part.partType === 'text' ? part.payload['text'] : undefined;
    return typeof text === 'string' ? text : '';
}

async function readLatestAssistantResponseMarkdown(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
}): Promise<string | null> {
    const [messages, parts] = await Promise.all([
        messageStore.listMessagesBySession(input.profileId, input.sessionId, input.runId),
        messageStore.listPartsBySession(input.profileId, input.sessionId, input.runId),
    ]);
    const messagesById = new Map(messages.map((message) => [message.id, message] as const));
    const lastAssistantMessage = messages
        .filter((message) => message.role === 'assistant')
        .at(-1);
    if (!lastAssistantMessage) {
        return null;
    }

    const text = parts
        .filter((part) => part.messageId === lastAssistantMessage.id)
        .filter((part) => messagesById.get(part.messageId)?.role === 'assistant')
        .map(readTextPayload)
        .join('\n')
        .trim();

    return text.length > 0 ? text : null;
}

async function loadPlanForResearch(input: {
    profileId: string;
    planId: EntityId<'plan'>;
}): Promise<{ found: false } | { found: true; plan: PlanRecord }> {
    const plan = await planStore.getById(input.profileId, input.planId);
    if (!plan) {
        return { found: false };
    }

    return { found: true, plan };
}

function validateEditableResearchPlan(plan: PlanRecord): Result<void, PlanServiceError> {
    if (plan.planningDepth !== 'advanced') {
        return errPlan('invalid_state', 'Planner research is only available on advanced plans.');
    }

    if (plan.status !== 'awaiting_answers' && plan.status !== 'draft') {
        return errPlan(
            'invalid_state',
            'Planner research can only start while the current advanced revision is still being drafted.'
        );
    }

    return okPlan(undefined);
}

async function failQueuedResearchWorkers(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    researchBatchId: EntityId<'prb'>;
    workers: PlanResearchWorkerRecord[];
    errorMessage: string;
}): Promise<void> {
    await Promise.all(
        input.workers.map(async (worker) => {
            await planStore.recordResearchWorkerFailure({
                researchBatchId: input.researchBatchId,
                researchWorkerId: worker.id,
                errorMessage: input.errorMessage,
            });
        })
    );

    appLog.warn({
        tag: 'plan',
        message: 'Marked planner research batch workers as failed before launch.',
        profileId: input.profileId,
        planId: input.planId,
        batchId: input.researchBatchId,
        workerCount: input.workers.length,
        error: input.errorMessage,
    });
}

async function runPlannerResearchWorker(input: {
    profileId: string;
    plan: PlanRecord;
    researchBatch: PlanResearchBatchRecord;
    worker: PlanResearchWorkerRecord;
    rootContext: DelegatedChildRootExecutionContext;
    runtimeOptions: PlanStartResearchBatchInput['runtimeOptions'];
    providerId?: PlanStartResearchBatchInput['providerId'];
    modelId?: PlanStartResearchBatchInput['modelId'];
    workspaceFingerprint?: string;
}): Promise<void> {
    const currentBatch = await planStore.getResearchBatchById(input.researchBatch.id);
    if (!currentBatch || currentBatch.status !== 'running') {
        return;
    }

    const started = await startDelegatedChildLaneRun({
        profileId: input.profileId,
        owner: {
            kind: 'plan_research',
            planResearchBatchId: input.researchBatch.id,
        },
        rootContext: input.rootContext,
        rootSessionId: input.plan.sessionId,
        childTitle: readWorkerThreadTitle(input.worker),
        prompt: input.worker.promptMarkdown,
        topLevelTab: 'agent',
        modeKey: 'ask',
        runtimeOptions: input.runtimeOptions,
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.workspaceFingerprint ?? input.plan.workspaceFingerprint
            ? { workspaceFingerprint: input.workspaceFingerprint ?? input.plan.workspaceFingerprint }
            : {}),
        planId: input.plan.id,
        planRevisionId: input.plan.currentRevisionId,
    });
    if (!started.accepted) {
        await planStore.recordResearchWorkerFailure({
            researchBatchId: input.researchBatch.id,
            researchWorkerId: input.worker.id,
            errorMessage: started.reason,
        });
        return;
    }

    const runningWorker = await planStore.markResearchWorkerRunning({
        researchBatchId: input.researchBatch.id,
        researchWorkerId: input.worker.id,
        childThreadId: started.started.childThreadId,
        childSessionId: started.started.childSessionId,
        activeRunId: started.started.runId,
    });
    if (!runningWorker) {
        await abortDelegatedChildRun(input.profileId, started.started.childSessionId);
        return;
    }

    const terminalStatus = await waitForRunTerminal(started.started.runId);
    if (terminalStatus === 'completed') {
        const responseMarkdown = await readLatestAssistantResponseMarkdown({
            profileId: input.profileId,
            sessionId: started.started.childSessionId,
            runId: started.started.runId,
        });
        if (!responseMarkdown) {
            await planStore.recordResearchWorkerFailure({
                researchBatchId: input.researchBatch.id,
                researchWorkerId: input.worker.id,
                errorMessage: 'Planner research worker completed without a parseable assistant response.',
                childThreadId: started.started.childThreadId,
                childSessionId: started.started.childSessionId,
                activeRunId: started.started.runId,
                runId: started.started.runId,
            });
            return;
        }

        const recorded = await recordPlanResearchWorkerResult({
            profileId: input.profileId,
            planId: input.plan.id,
            researchBatchId: input.researchBatch.id,
            researchWorkerId: input.worker.id,
            rawResponseMarkdown: responseMarkdown,
            childThreadId: started.started.childThreadId,
            childSessionId: started.started.childSessionId,
            activeRunId: started.started.runId,
            runId: started.started.runId,
        });
        if (recorded.isErr()) {
            appLog.warn({
                tag: 'plan',
                message: 'Failed to record planner research worker result.',
                profileId: input.profileId,
                planId: input.plan.id,
                batchId: input.researchBatch.id,
                workerId: input.worker.id,
                code: recorded.error.code,
                error: recorded.error.message,
            });
        }
        return;
    }

    const refreshedBatch = await planStore.getResearchBatchById(input.researchBatch.id);
    if (refreshedBatch?.status === 'aborted') {
        return;
    }

    await planStore.recordResearchWorkerFailure({
        researchBatchId: input.researchBatch.id,
        researchWorkerId: input.worker.id,
        errorMessage:
            terminalStatus === 'aborted'
                ? 'Planner research worker run was aborted before it completed.'
                : 'Planner research worker run ended with error.',
        childThreadId: started.started.childThreadId,
        childSessionId: started.started.childSessionId,
        activeRunId: started.started.runId,
        runId: started.started.runId,
    });
}

async function processPlanResearchBatch(input: {
    profileId: string;
    plan: PlanRecord;
    researchBatch: PlanResearchBatchRecord;
    runtimeOptions: PlanStartResearchBatchInput['runtimeOptions'];
    providerId?: PlanStartResearchBatchInput['providerId'];
    modelId?: PlanStartResearchBatchInput['modelId'];
    workspaceFingerprint?: string;
}): Promise<void> {
    const workers = await planStore.listResearchWorkers(input.researchBatch.id);
    if (workers.length === 0) {
        return;
    }

    const rootContext = await resolveDelegatedChildRootExecutionContext({
        profileId: input.profileId,
        sessionId: input.plan.sessionId,
    });
    if (!rootContext) {
        await failQueuedResearchWorkers({
            profileId: input.profileId,
            planId: input.plan.id,
            researchBatchId: input.researchBatch.id,
            workers,
            errorMessage: 'The root planning session could not be resolved for delegated research.',
        });
        return;
    }

    await Promise.all(
        workers.map((worker) =>
            runPlannerResearchWorker({
                profileId: input.profileId,
                plan: input.plan,
                researchBatch: input.researchBatch,
                worker,
                rootContext,
                runtimeOptions: input.runtimeOptions,
                ...(input.providerId ? { providerId: input.providerId } : {}),
                ...(input.modelId ? { modelId: input.modelId } : {}),
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            })
        )
    );
}

export async function abortRunningResearchWorkers(input: {
    profileId: string;
    researchBatchId: EntityId<'prb'>;
}): Promise<void> {
    const workers = await planStore.listResearchWorkers(input.researchBatchId);
    const runningWorkers = workers.filter((worker) => worker.status === 'running' && worker.childSessionId);
    await Promise.all(
        runningWorkers.map((worker) =>
            abortDelegatedChildRun(input.profileId, worker.childSessionId as EntityId<'sess'>)
        )
    );
}

export async function ensureNoRunningResearchBatch(input: {
    plan: PlanRecord;
    actionLabel: string;
}): Promise<Result<void, PlanServiceError>> {
    const activeBatch = await planStore.getActiveResearchBatchByRevision(input.plan.currentRevisionId);
    if (!activeBatch) {
        return okPlan(undefined);
    }

    return errPlan(
        'research_conflict',
        `Cannot ${input.actionLabel} while research batch "${activeBatch.id}" is running for the current revision.`
    );
}

export async function startPlanResearchBatch(
    input: PlanStartResearchBatchInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const loaded = await loadPlanForResearch({
        profileId: input.profileId,
        planId: input.planId,
    });
    if (!loaded.found) {
        return okPlan({ found: false });
    }

    const plan = loaded.plan;
    const validation = validateEditableResearchPlan(plan);
    if (validation.isErr()) {
        return errPlan(validation.error.code, validation.error.message);
    }

    const trimmedPromptMarkdown = trimPromptMarkdown(input.promptMarkdown);
    if (trimmedPromptMarkdown.length === 0) {
        return errPlan('invalid_state', 'Planner research requires a non-empty research request.');
    }

    const capacity = readPlannerResearchCapacity();
    if (!Number.isInteger(input.workerCount) || input.workerCount <= 0 || input.workerCount > capacity.hardMaxWorkerCount) {
        return errPlan(
            'invalid_worker_count',
            `Worker count must be between 1 and ${String(capacity.hardMaxWorkerCount)} for this machine.`
        );
    }

    const runningBatchCheck = await ensureNoRunningResearchBatch({
        plan,
        actionLabel: 'start another research batch',
    });
    if (runningBatchCheck.isErr()) {
        return errPlan(runningBatchCheck.error.code, runningBatchCheck.error.message);
    }

    const resolvedPlanningRunTarget =
        input.providerId && input.modelId
            ? {
                  providerId: input.providerId,
                  modelId: input.modelId,
              }
            : await resolvePlanningWorkflowRoutingRunTarget({
                  profileId: input.profileId,
                  planningDepth: plan.planningDepth,
                  ...(input.workspaceFingerprint ?? plan.workspaceFingerprint
                      ? { workspaceFingerprint: input.workspaceFingerprint ?? plan.workspaceFingerprint }
                      : {}),
              });

    const currentItems = await planStore.listItems(plan.id);
    const projectionBeforeStart = await planStore.getProjectionById(input.profileId, input.planId);
    const recommendation = buildPlanResearchRecommendation({
        plan,
        items: currentItems,
        followUps: await planStore.listOpenFollowUps(plan.id),
        evidenceAttachments: projectionBeforeStart?.evidenceAttachments ?? [],
        capacity,
        ...(plan.advancedSnapshot ? { advancedSnapshot: plan.advancedSnapshot } : {}),
    });

    const researchBatch = await planStore.startResearchBatch({
        planId: plan.id,
        planRevisionId: plan.currentRevisionId,
        variantId: plan.currentVariantId,
        promptMarkdown: trimmedPromptMarkdown,
        requestedWorkerCount: input.workerCount,
        recommendedWorkerCount: recommendation.suggestedWorkerCount,
        hardMaxWorkerCount: capacity.hardMaxWorkerCount,
        workers: Array.from({ length: input.workerCount }, (_, index) => ({
            sequence: index + 1,
            label: `Worker ${String(index + 1)} of ${String(input.workerCount)}`,
            promptMarkdown: buildPlannerResearchWorkerPromptMarkdown({
                plan,
                currentItemDescriptions: currentItems.map((item) => item.description),
                researchRequestMarkdown: trimmedPromptMarkdown,
                capacity,
                recommendation,
                workerIndex: index + 1,
                workerCount: input.workerCount,
                ...(plan.advancedSnapshot ? { advancedSnapshot: plan.advancedSnapshot } : {}),
            }),
        })),
    });

    if (!researchBatch) {
        return errPlan(
            'research_conflict',
            'Unable to start a research batch for the current plan revision.'
        );
    }

    void processPlanResearchBatch({
        profileId: input.profileId,
        plan,
        researchBatch,
        runtimeOptions: input.runtimeOptions,
        ...(resolvedPlanningRunTarget ? { providerId: resolvedPlanningRunTarget.providerId } : {}),
        ...(resolvedPlanningRunTarget ? { modelId: resolvedPlanningRunTarget.modelId } : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    }).catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        appLog.error({
            tag: 'plan',
            message: 'Planner research batch processing failed unexpectedly.',
            profileId: input.profileId,
            planId: input.planId,
            batchId: researchBatch.id,
            error: message,
        });
    });

    appLog.info({
        tag: 'plan',
        message: 'Started planner research batch.',
        profileId: input.profileId,
        planId: input.planId,
        batchId: researchBatch.id,
        workerCount: input.workerCount,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.startResearchBatch'),
    });
}

export async function abortPlanResearchBatch(
    input: PlanAbortResearchBatchInput
): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const loaded = await loadPlanForResearch({
        profileId: input.profileId,
        planId: input.planId,
    });
    if (!loaded.found) {
        return okPlan({ found: false });
    }

    await abortRunningResearchWorkers({
        profileId: input.profileId,
        researchBatchId: input.researchBatchId,
    });

    const aborted = await planStore.abortResearchBatch(input.planId, input.researchBatchId);
    if (!aborted) {
        return errPlan('research_conflict', 'Unable to abort the requested research batch.');
    }

    appLog.info({
        tag: 'plan',
        message: 'Aborted planner research batch.',
        profileId: input.profileId,
        planId: input.planId,
        batchId: input.researchBatchId,
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.abortResearchBatch'),
    });
}

export async function recordPlanResearchWorkerResult(input: {
    profileId: string;
    planId: EntityId<'plan'>;
    researchBatchId: EntityId<'prb'>;
    researchWorkerId: EntityId<'prw'>;
    rawResponseMarkdown: string;
    childThreadId?: EntityId<'thr'>;
    childSessionId?: EntityId<'sess'>;
    activeRunId?: EntityId<'run'>;
    runId?: EntityId<'run'>;
}): Promise<Result<{ found: false } | { found: true; plan: PlanRecordView }, PlanServiceError>> {
    const loaded = await loadPlanForResearch({
        profileId: input.profileId,
        planId: input.planId,
    });
    if (!loaded.found) {
        return okPlan({ found: false });
    }

    const batch = await planStore.getResearchBatchById(input.researchBatchId);
    if (!batch || batch.planId !== input.planId) {
        return errPlan('research_conflict', 'Research batch does not belong to this plan.');
    }

    const worker = await planStore.getResearchWorkerById(input.researchWorkerId);
    if (!worker || worker.batchId !== input.researchBatchId) {
        return errPlan('research_conflict', 'Research worker does not belong to the requested batch.');
    }

    const parsed = parsePlannerResearchWorkerResponse(input.rawResponseMarkdown);
    if (!parsed) {
        await planStore.recordResearchWorkerFailure({
            researchBatchId: input.researchBatchId,
            researchWorkerId: input.researchWorkerId,
            errorMessage: 'Failed to parse the research worker result contract.',
            ...(input.childThreadId ? { childThreadId: input.childThreadId } : {}),
            ...(input.childSessionId ? { childSessionId: input.childSessionId } : {}),
            ...(input.activeRunId ? { activeRunId: input.activeRunId } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
        });

        return errPlan('research_parse_failed', 'Failed to parse the research worker response contract.');
    }

    await planStore.recordResearchWorkerCompletion({
        researchBatchId: input.researchBatchId,
        researchWorkerId: input.researchWorkerId,
        resultSummaryMarkdown: parsed.resultSummaryMarkdown,
        resultDetailsMarkdown: parsed.resultDetailsMarkdown,
        ...(input.childThreadId ? { childThreadId: input.childThreadId } : {}),
        ...(input.childSessionId ? { childSessionId: input.childSessionId } : {}),
        ...(input.activeRunId ? { activeRunId: input.activeRunId } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
    });

    const projection = await planStore.getProjectionById(input.profileId, input.planId);
    return okPlan({
        found: true,
        plan: requirePlanView(projection, 'plan.recordResearchWorkerResult'),
    });
}
