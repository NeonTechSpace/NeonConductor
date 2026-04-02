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
    SessionSummaryRecord,
    ThreadRecord,
} from '@/app/backend/persistence/types';
import type { EntityId, ResolvedWorkspaceContext, RuntimeRunOptions, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { eventMetadata } from '@/app/backend/runtime/services/common/logContext';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';
import { runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

type WorkspaceExecutionTarget = Extract<ResolvedWorkspaceContext, { kind: 'workspace' | 'sandbox' }>;

export interface DelegatedChildRootExecutionContext {
    bucket: ConversationRecord;
    rootThread: ThreadRecord;
    executionTarget: WorkspaceExecutionTarget;
}

export interface DelegatedChildLaneStart {
    childThreadId: EntityId<'thr'>;
    childSessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
}

interface ChildLaneOwnerOrchestrator {
    kind: 'orchestrator';
    orchestratorRunId: EntityId<'orch'>;
}

interface ChildLaneOwnerPlanResearch {
    kind: 'plan_research';
    planResearchBatchId: EntityId<'prb'>;
}

export type ChildLaneOwner = ChildLaneOwnerOrchestrator | ChildLaneOwnerPlanResearch;

function readOwnerOrigin(owner: ChildLaneOwner): string {
    return owner.kind === 'orchestrator'
        ? 'runtime.orchestrator.delegateChildLane'
        : 'runtime.planResearch.delegateChildLane';
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
    origin: string;
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
                origin: input.origin,
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
                origin: input.origin,
            }),
        })
    );
}

function buildThreadOwnerFields(owner: ChildLaneOwner): {
    delegatedFromOrchestratorRunId?: EntityId<'orch'>;
    delegatedFromPlanResearchBatchId?: EntityId<'prb'>;
} {
    return owner.kind === 'orchestrator'
        ? { delegatedFromOrchestratorRunId: owner.orchestratorRunId }
        : { delegatedFromPlanResearchBatchId: owner.planResearchBatchId };
}

function buildSessionOwnerFields(owner: ChildLaneOwner): {
    delegatedFromOrchestratorRunId?: EntityId<'orch'>;
    delegatedFromPlanResearchBatchId?: EntityId<'prb'>;
} {
    return owner.kind === 'orchestrator'
        ? { delegatedFromOrchestratorRunId: owner.orchestratorRunId }
        : { delegatedFromPlanResearchBatchId: owner.planResearchBatchId };
}

function buildDeletionOwnerInput(input: {
    profileId: string;
    threadId: EntityId<'thr'>;
    owner: ChildLaneOwner;
    sessionId?: EntityId<'sess'>;
}):
    | {
          profileId: string;
          threadId: EntityId<'thr'>;
          sessionId?: EntityId<'sess'>;
          orchestratorRunId: EntityId<'orch'>;
      }
    | {
          profileId: string;
          threadId: EntityId<'thr'>;
          sessionId?: EntityId<'sess'>;
          planResearchBatchId: EntityId<'prb'>;
      } {
    return input.owner.kind === 'orchestrator'
        ? {
              profileId: input.profileId,
              threadId: input.threadId,
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
              orchestratorRunId: input.owner.orchestratorRunId,
          }
        : {
              profileId: input.profileId,
              threadId: input.threadId,
              ...(input.sessionId ? { sessionId: input.sessionId } : {}),
              planResearchBatchId: input.owner.planResearchBatchId,
          };
}

export async function resolveDelegatedChildRootExecutionContext(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
}): Promise<DelegatedChildRootExecutionContext | null> {
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

export async function startDelegatedChildLaneRun(input: {
    profileId: string;
    owner: ChildLaneOwner;
    rootContext: DelegatedChildRootExecutionContext;
    rootSessionId: EntityId<'sess'>;
    childTitle: string;
    prompt: string;
    modeKey: 'ask' | 'code';
    runtimeOptions: RuntimeRunOptions;
    providerId?: RuntimeProviderId;
    modelId?: string;
    workspaceFingerprint?: string;
    planId?: EntityId<'plan'>;
    planRevisionId?: EntityId<'prev'>;
}): Promise<{ accepted: true; started: DelegatedChildLaneStart } | { accepted: false; reason: string }> {
    const childExecutionBinding = buildChildExecutionBinding(input.rootContext.executionTarget);
    const createdThread = await threadStore.create({
        profileId: input.profileId,
        conversationId: input.rootContext.bucket.id,
        title: input.childTitle,
        topLevelTab: 'agent',
        parentThreadId: input.rootContext.rootThread.id,
        rootThreadId: input.rootContext.rootThread.id,
        executionEnvironmentMode: childExecutionBinding.executionEnvironmentMode,
        ...(childExecutionBinding.sandboxId ? { sandboxId: childExecutionBinding.sandboxId } : {}),
        ...buildThreadOwnerFields(input.owner),
    });
    if (createdThread.isErr()) {
        return {
            accepted: false,
            reason: createdThread.error.message,
        };
    }

    const childThreadId = parseEntityId(createdThread.value.id, 'threads.id', 'thr');
    const createdSession = await sessionStore.create(
        input.profileId,
        createdThread.value.id,
        childExecutionBinding.sessionKind,
        buildSessionOwnerFields(input.owner)
    );
    if (!createdSession.created) {
        await threadStore.deleteDelegatedChildLane(buildDeletionOwnerInput({
            profileId: input.profileId,
            threadId: childThreadId,
            owner: input.owner,
        }));
        return {
            accepted: false,
            reason: `Delegated child session could not be created: ${createdSession.reason}.`,
        };
    }

    await copyRootSessionAttachmentsToChildSession({
        profileId: input.profileId,
        rootSessionId: input.rootSessionId,
        childSessionId: createdSession.session.id,
    });

    const startedRun = await runExecutionService.startRun({
        profileId: input.profileId,
        sessionId: createdSession.session.id,
        prompt: input.prompt,
        topLevelTab: 'agent',
        modeKey: input.modeKey,
        runtimeOptions: input.runtimeOptions,
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.planId ? { planId: input.planId } : {}),
        ...(input.planRevisionId ? { planRevisionId: input.planRevisionId } : {}),
    });

    if (!startedRun.accepted) {
        await threadStore.deleteDelegatedChildLane(buildDeletionOwnerInput({
            profileId: input.profileId,
            threadId: childThreadId,
            sessionId: createdSession.session.id,
            owner: input.owner,
        }));
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
        origin: readOwnerOrigin(input.owner),
    });

    return {
        accepted: true,
        started: {
            childThreadId,
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
