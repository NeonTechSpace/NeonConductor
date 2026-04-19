import type {
    ComposerImageAttachmentInput,
    ResolvedContextPolicy,
    ResolvedContextState,
    EntityId,
    RetrievedMemorySummary,
    SessionContextCompactionRecord,
    TokenCountEstimate,
    PreparedContextSummary,
    SkillfileDefinition,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { buildResolvedContextState } from '@/app/backend/runtime/services/context/resolvedContextStateBuilder';
import { buildSessionSystemPrelude } from '@/app/backend/runtime/services/runExecution/contextPrelude';
import { resolveModeExecution } from '@/app/backend/runtime/services/runExecution/mode';
import type {
    PreparedContextModeOverrides,
    PreparedContextProfileDefaults,
} from '@/app/backend/runtime/contracts';

export interface PreparedContextStateProjection {
    policy: ResolvedContextPolicy;
    preparedContext: PreparedContextSummary;
    estimate?: TokenCountEstimate;
    compaction?: SessionContextCompactionRecord;
    retrievedMemory?: RetrievedMemorySummary;
}

export async function resolveExecutionTargetContextPreview(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    providerId: ResolvedContextPolicy['providerId'];
    modelId: string;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
    workspaceFingerprint?: string;
    runId?: EntityId<'run'>;
    prompt?: string;
    prepareSessionContext: (input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        systemContributorSpecs: import('@/app/backend/runtime/services/context/preparedContextLedger').PreparedContextContributorSpec[];
        attachedSkillfiles: SkillfileDefinition[];
        preparedContextProfileDefaults: PreparedContextProfileDefaults;
        modePromptLayerOverrides: PreparedContextModeOverrides;
        prompt: string;
        attachments?: ComposerImageAttachmentInput[];
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
        workspaceContext?: import('@/shared/contracts').ResolvedWorkspaceContext;
        runId?: EntityId<'run'>;
        sideEffectMode?: 'execution' | 'preview';
    }) => Promise<OperationalResult<PreparedContextStateProjection>>;
}): Promise<OperationalResult<ResolvedContextState>> {
    const resolvedModeResult = await resolveModeExecution({
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (resolvedModeResult.isErr()) {
        return errOp(resolvedModeResult.error.code, resolvedModeResult.error.message);
    }

    const systemPreludeResult = await buildSessionSystemPrelude({
        profileId: input.profileId,
        sessionId: input.sessionId,
        prompt: '',
        topLevelTab: input.topLevelTab,
        resolvedMode: resolvedModeResult.value,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (systemPreludeResult.isErr()) {
        return errOp(systemPreludeResult.error.code, systemPreludeResult.error.message);
    }

    const preparedContext = await input.prepareSessionContext({
        profileId: input.profileId,
        sessionId: input.sessionId,
        providerId: input.providerId,
        modelId: input.modelId,
        systemContributorSpecs: systemPreludeResult.value.contributorSpecs,
        attachedSkillfiles: systemPreludeResult.value.attachedSkillfiles,
        preparedContextProfileDefaults: systemPreludeResult.value.preparedContextProfileDefaults,
        modePromptLayerOverrides: systemPreludeResult.value.modePromptLayerOverrides,
        prompt: input.prompt ?? '',
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        sideEffectMode: 'preview',
        ...(systemPreludeResult.value.resolvedWorkspaceContext
            ? { workspaceContext: systemPreludeResult.value.resolvedWorkspaceContext }
            : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.runId ? { runId: input.runId } : {}),
    });
    if (preparedContext.isErr()) {
        return errOp(preparedContext.error.code, preparedContext.error.message, {
            ...(preparedContext.error.details ? { details: preparedContext.error.details } : {}),
            ...(preparedContext.error.retryable !== undefined ? { retryable: preparedContext.error.retryable } : {}),
        });
    }

    return okOp(
        buildResolvedContextState({
            policy: preparedContext.value.policy,
            preparedContext: preparedContext.value.preparedContext,
            ...(preparedContext.value.estimate ? { estimate: preparedContext.value.estimate } : {}),
            ...(preparedContext.value.compaction ? { compaction: preparedContext.value.compaction } : {}),
            ...(preparedContext.value.retrievedMemory ? { retrievedMemory: preparedContext.value.retrievedMemory } : {}),
        })
    );
}
