import {
    conversationStore,
    runStore,
    sessionAttachedRuleStore,
    sessionAttachedSkillStore,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type {
    ConversationRecord,
    OrchestratorStepRecord,
    PlanRecord,
    SessionSummaryRecord,
    ThreadRecord,
} from '@/app/backend/persistence/types';
import type { EntityId, OrchestratorStartInput, ResolvedWorkspaceContext } from '@/app/backend/runtime/contracts';
import { eventMetadata } from '@/app/backend/runtime/services/common/logContext';
import type { ApprovedPlanExecutionArtifact } from '@/app/backend/runtime/services/plan/approvedExecutionArtifact';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';
import { runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

type WorkspaceExecutionTarget = Extract<ResolvedWorkspaceContext, { kind: 'workspace' | 'sandbox' }>;

interface OrchestratorRootExecutionContext {
    bucket: ConversationRecord;
    rootThread: ThreadRecord;
    executionTarget: WorkspaceExecutionTarget;
}

export interface OrchestratorChildRunStart {
    childThreadId: EntityId<'thr'>;
    childSessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
}

function toSingleLine(value: string): string {
    return value
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
        .join(' ');
}

function buildChildThreadTitle(step: OrchestratorStepRecord): string {
    const titleSource = toSingleLine(step.description);
    const titleSuffix = titleSource.length > 0 ? titleSource : 'Delegated worker task';
    const title = `Step ${String(step.sequence)}: ${titleSuffix}`;
    return title.length <= 88 ? title : `${title.slice(0, 85).trimEnd()}...`;
}

export function buildStepPrompt(
    approvedArtifact: ApprovedPlanExecutionArtifact,
    step: OrchestratorStepRecord
): string {
    return [
        `Execute step ${String(step.sequence)} from approved orchestrator plan.`,
        '',
        'Plan summary:',
        approvedArtifact.summaryMarkdown,
        '',
        'Step task:',
        step.description,
    ].join('\n');
}

export async function resolveOrchestratorRootExecutionContext(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
}): Promise<OrchestratorRootExecutionContext | null> {
    const initialSessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
    if (!initialSessionThread) {
        return null;
    }

    const bucket = await conversationStore.getBucketById(input.profileId, initialSessionThread.thread.conversationId);
    if (!bucket) {
        return null;
    }

    const executionTarget = await workspaceContextService.resolveForSession({
        profileId: input.profileId,
        sessionId: input.sessionId,
        topLevelTab: initialSessionThread.thread.topLevelTab,
        allowLazySandboxCreation: true,
    });
    if (!executionTarget || executionTarget.kind === 'detached') {
        return null;
    }
    if (executionTarget.kind === 'workspace' && executionTarget.executionEnvironmentMode === 'new_sandbox') {
        return null;
    }

    const refreshedSessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
    if (!refreshedSessionThread) {
        return null;
    }

    return {
        bucket,
        rootThread: refreshedSessionThread.thread,
        executionTarget,
    };
}

function buildChildExecutionBinding(executionTarget: WorkspaceExecutionTarget): {
    executionEnvironmentMode: ThreadRecord['executionEnvironmentMode'];
    sessionKind: SessionSummaryRecord['kind'];
    sandboxId?: EntityId<'sb'>;
} {
    if (executionTarget.kind === 'sandbox') {
        return {
            executionEnvironmentMode: 'sandbox',
            sessionKind: 'sandbox',
            sandboxId: executionTarget.sandbox.id,
        };
    }

    return {
        executionEnvironmentMode: 'local',
        sessionKind: 'local',
    };
}

async function copyRootSessionAttachmentsToChildSession(input: {
    profileId: string;
    rootSessionId: EntityId<'sess'>;
    childSessionId: EntityId<'sess'>;
}): Promise<void> {
    const [attachedRules, attachedSkills] = await Promise.all([
        sessionAttachedRuleStore.listBySession(input.profileId, input.rootSessionId),
        sessionAttachedSkillStore.listBySession(input.profileId, input.rootSessionId),
    ]);

    await Promise.all([
        sessionAttachedRuleStore.replaceForSession({
            profileId: input.profileId,
            sessionId: input.childSessionId,
            assetKeys: attachedRules.map((attachedRule) => attachedRule.assetKey),
        }),
        sessionAttachedSkillStore.replaceForSession({
            profileId: input.profileId,
            sessionId: input.childSessionId,
            assetKeys: attachedSkills.map((attachedSkill) => attachedSkill.assetKey),
        }),
    ]);
}

async function appendDelegatedChildLaneEvents(input: {
    profileId: string;
    bucket: ConversationRecord;
    thread: ThreadRecord;
    session: SessionSummaryRecord;
}): Promise<void> {
    await runtimeEventLogService.append(
        runtimeUpsertEvent({
            entityType: 'thread',
            domain: 'thread',
            entityId: input.thread.id,
            eventType: 'conversation.thread.created',
            payload: {
                profileId: input.profileId,
                bucket: input.bucket,
                thread: input.thread,
            },
            ...eventMetadata({
                origin: 'runtime.orchestrator.delegateChildLane',
            }),
        })
    );

    await runtimeEventLogService.append(
        runtimeUpsertEvent({
            entityType: 'session',
            domain: 'session',
            entityId: input.session.id,
            eventType: 'session.created',
            payload: {
                session: input.session,
            },
            ...eventMetadata({
                origin: 'runtime.orchestrator.delegateChildLane',
            }),
        })
    );
}

export async function startDelegatedChildRun(input: {
    profileId: string;
    orchestratorRunId: EntityId<'orch'>;
    rootContext: OrchestratorRootExecutionContext;
    plan: PlanRecord;
    approvedArtifact: ApprovedPlanExecutionArtifact;
    step: OrchestratorStepRecord;
    startInput: OrchestratorStartInput;
}): Promise<{ accepted: true; started: OrchestratorChildRunStart } | { accepted: false; reason: string }> {
    const childExecutionBinding = buildChildExecutionBinding(input.rootContext.executionTarget);
    const createdThread = await threadStore.create({
        profileId: input.profileId,
        conversationId: input.rootContext.bucket.id,
        title: buildChildThreadTitle(input.step),
        topLevelTab: 'agent',
        parentThreadId: input.rootContext.rootThread.id,
        rootThreadId: input.rootContext.rootThread.id,
        delegatedFromOrchestratorRunId: input.orchestratorRunId,
        executionEnvironmentMode: childExecutionBinding.executionEnvironmentMode,
        ...(childExecutionBinding.sandboxId ? { sandboxId: childExecutionBinding.sandboxId } : {}),
    });
    if (createdThread.isErr()) {
        return {
            accepted: false,
            reason: createdThread.error.message,
        };
    }

    const createdSession = await sessionStore.create(
        input.profileId,
        createdThread.value.id,
        childExecutionBinding.sessionKind,
        {
            delegatedFromOrchestratorRunId: input.orchestratorRunId,
        }
    );
    if (!createdSession.created) {
        await threadStore.deleteDelegatedChildLane({
            profileId: input.profileId,
            threadId: parseEntityId(createdThread.value.id, 'threads.id', 'thr'),
            orchestratorRunId: input.orchestratorRunId,
        });
        return {
            accepted: false,
            reason: `Delegated child session could not be created: ${createdSession.reason}.`,
        };
    }

    await copyRootSessionAttachmentsToChildSession({
        profileId: input.profileId,
        rootSessionId: input.plan.sessionId,
        childSessionId: createdSession.session.id,
    });

    const startedRun = await runExecutionService.startRun({
        profileId: input.startInput.profileId,
        sessionId: createdSession.session.id,
        planId: input.approvedArtifact.planId,
        planRevisionId: input.approvedArtifact.approvedRevisionId,
        prompt: buildStepPrompt(input.approvedArtifact, input.step),
        topLevelTab: 'agent',
        modeKey: 'code',
        runtimeOptions: input.startInput.runtimeOptions,
        ...(input.startInput.providerId ? { providerId: input.startInput.providerId } : {}),
        ...(input.startInput.modelId ? { modelId: input.startInput.modelId } : {}),
        ...(input.rootContext.bucket.workspaceFingerprint
            ? { workspaceFingerprint: input.rootContext.bucket.workspaceFingerprint }
            : {}),
    });

    if (!startedRun.accepted) {
        await threadStore.deleteDelegatedChildLane({
            profileId: input.profileId,
            threadId: parseEntityId(createdThread.value.id, 'threads.id', 'thr'),
            sessionId: createdSession.session.id,
            orchestratorRunId: input.orchestratorRunId,
        });
        return {
            accepted: false,
            reason: startedRun.reason,
        };
    }

    await appendDelegatedChildLaneEvents({
        profileId: input.profileId,
        bucket: input.rootContext.bucket,
        thread: createdThread.value,
        session: createdSession.session,
    });

    return {
        accepted: true,
        started: {
            childThreadId: parseEntityId(createdThread.value.id, 'threads.id', 'thr'),
            childSessionId: createdSession.session.id,
            runId: startedRun.runId,
        },
    };
}

export async function abortDelegatedChildRun(profileId: string, childSessionId: EntityId<'sess'>): Promise<void> {
    await runExecutionService.abortRun(profileId, childSessionId);
}

export async function waitForRunTerminal(runId: EntityId<'run'>): Promise<'completed' | 'aborted' | 'error'> {
    for (;;) {
        const run = await runStore.getById(runId);
        if (!run) {
            return 'error';
        }

        if (run.status === 'completed' || run.status === 'aborted' || run.status === 'error') {
            return run.status;
        }

        await new Promise((resolve) => setTimeout(resolve, 200));
    }
}
