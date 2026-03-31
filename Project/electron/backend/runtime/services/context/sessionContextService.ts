import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import type {
    CompactSessionResult,
    ResolvedContextPolicy,
    ResolvedContextState,
    RetrievedMemorySummary,
    TokenCountEstimate,
} from '@/app/backend/runtime/contracts';
import type { ComposerImageAttachmentInput } from '@/app/backend/runtime/contracts';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { contextPolicyService } from '@/app/backend/runtime/services/context/policyService';
import { contextCompactionPreparationCoordinator } from '@/app/backend/runtime/services/context/contextCompactionPreparationCoordinator';
import { applyPersistedCompaction, loadSessionReplaySnapshot } from '@/app/backend/runtime/services/context/sessionReplayLoader';
import {
    buildPreparedContextDigest,
    buildPreparedContextMessages,
} from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';
import { assessContextBudget, estimatePreparedContextMessages } from '@/app/backend/runtime/services/context/sessionContextBudgetEvaluator';
import { compactLoadedSessionContext } from '@/app/backend/runtime/services/context/contextCompactionLifecycle';
import { loadRetrievedMemoryInjection } from '@/app/backend/runtime/services/context/retrievedMemoryInjection';
import { buildResolvedContextState } from '@/app/backend/runtime/services/context/resolvedContextStateBuilder';
import {
    resolveExecutionTargetContextPreview,
} from '@/app/backend/runtime/services/context/executionTargetContextPreviewService';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

export interface PreparedSessionContext {
    messages: RunContextMessage[];
    digest: string;
    estimate?: TokenCountEstimate;
    policy: ResolvedContextPolicy;
    compaction?: SessionContextCompactionRecord;
    retrievedMemory?: RetrievedMemorySummary;
}

class SessionContextService {
    async getResolvedState(input: {
        profileId: string;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        sessionId?: string;
        systemMessages?: RunContextMessage[];
    }): Promise<ResolvedContextState> {
        const policy = await contextPolicyService.resolvePolicy(input);
        if (!input.sessionId) {
            return buildResolvedContextState({ policy });
        }

        const replaySnapshot = await loadSessionReplaySnapshot({
            profileId: input.profileId,
            sessionId: input.sessionId,
        });
        const persistedReplay = applyPersistedCompaction(replaySnapshot.replayMessages, replaySnapshot.compaction);
        const prepared = buildPreparedContextMessages({
            systemMessages: input.systemMessages ?? [],
            replayMessages: persistedReplay.replayMessages,
            prompt: '',
            ...(persistedReplay.summaryMessage ? { summaryMessage: persistedReplay.summaryMessage } : {}),
        });
        const estimated = await estimatePreparedContextMessages({
            profileId: input.profileId,
            policy,
            messages: prepared,
        });

        return buildResolvedContextState({
            policy,
            ...(estimated.estimate ? { estimate: estimated.estimate } : {}),
            ...(replaySnapshot.compaction ? { compaction: replaySnapshot.compaction } : {}),
        });
    }

    async getResolvedStateForExecutionTarget(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
        runId?: EntityId<'run'>;
        prompt?: string;
    }): Promise<OperationalResult<ResolvedContextState>> {
        return resolveExecutionTargetContextPreview({
            profileId: input.profileId,
            sessionId: input.sessionId,
            providerId: input.providerId,
            modelId: input.modelId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
            prompt: input.prompt ?? '',
            prepareSessionContext: this.prepareSessionContext.bind(this),
        });
    }

    async compactSession(input: {
        profileId: string;
        sessionId: string;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        source: 'auto' | 'manual';
    }): Promise<OperationalResult<CompactSessionResult>> {
        const replaySnapshot = await loadSessionReplaySnapshot({
            profileId: input.profileId,
            sessionId: input.sessionId,
        });
        const policy = await contextPolicyService.resolvePolicy({
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            hasMultimodalContent: replaySnapshot.hasMultimodalContent,
        });

        return compactLoadedSessionContext({
            profileId: input.profileId,
            sessionId: input.sessionId,
            providerId: input.providerId,
            modelId: input.modelId,
            source: input.source,
            policy,
            replayMessages: replaySnapshot.replayMessages,
            existingCompaction: replaySnapshot.compaction,
        });
    }

    async prepareSessionContext(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        systemMessages: RunContextMessage[];
        prompt: string;
        attachments?: ComposerImageAttachmentInput[];
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
        runId?: EntityId<'run'>;
    }): Promise<OperationalResult<PreparedSessionContext>> {
        const replaySnapshot = await loadSessionReplaySnapshot({
            profileId: input.profileId,
            sessionId: input.sessionId,
        });
        const policy = await contextPolicyService.resolvePolicy({
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            hasMultimodalContent:
                replaySnapshot.hasMultimodalContent || Boolean(input.attachments && input.attachments.length > 0),
        });
        const retrievedMemoryResult = await loadRetrievedMemoryInjection({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            prompt: input.prompt,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
        });

        const persistedReplay = applyPersistedCompaction(replaySnapshot.replayMessages, replaySnapshot.compaction);
        const combinedSystemMessages = [...input.systemMessages, ...retrievedMemoryResult.messages];
        const preparedMessages = buildPreparedContextMessages({
            systemMessages: combinedSystemMessages,
            replayMessages: persistedReplay.replayMessages,
            prompt: input.prompt,
            ...(input.attachments ? { attachments: input.attachments } : {}),
            ...(persistedReplay.summaryMessage ? { summaryMessage: persistedReplay.summaryMessage } : {}),
        });
        let preparedEstimate = await estimatePreparedContextMessages({
            profileId: input.profileId,
            policy,
            messages: preparedMessages,
        });
        let compaction = replaySnapshot.compaction;
        let finalMessages = preparedMessages;

        if (
            policy.enabled &&
            policy.limits.modelLimitsKnown &&
            policy.thresholdTokens &&
            preparedEstimate.estimate &&
            contextCompactionPreparationCoordinator.shouldPrepare({
                thresholdTokens: policy.thresholdTokens,
                totalTokens: preparedEstimate.estimate.totalTokens,
            })
        ) {
            void contextCompactionPreparationCoordinator.schedulePreparation({
                profileId: input.profileId,
                sessionId: input.sessionId,
                policy,
                replayMessages: replaySnapshot.replayMessages,
                existingCompaction: replaySnapshot.compaction,
            });
        }

        if (
            policy.enabled &&
            policy.limits.modelLimitsKnown &&
            policy.thresholdTokens &&
            preparedEstimate.estimate &&
            preparedEstimate.estimate.totalTokens > policy.thresholdTokens
        ) {
            const compactResult = await compactLoadedSessionContext({
                profileId: input.profileId,
                sessionId: input.sessionId,
                providerId: input.providerId,
                modelId: input.modelId,
                source: 'auto',
                policy,
                replayMessages: replaySnapshot.replayMessages,
                existingCompaction: replaySnapshot.compaction,
            });
            if (compactResult.isErr()) {
                return errOp(compactResult.error.code, compactResult.error.message, {
                    ...(compactResult.error.details ? { details: compactResult.error.details } : {}),
                    ...(compactResult.error.retryable !== undefined ? { retryable: compactResult.error.retryable } : {}),
                });
            }
            if (compactResult.value.compacted) {
                compaction = compactResult.value.state.compaction ?? null;
                const compactedReplay = applyPersistedCompaction(replaySnapshot.replayMessages, compaction);
                finalMessages = buildPreparedContextMessages({
                    systemMessages: combinedSystemMessages,
                    replayMessages: compactedReplay.replayMessages,
                    prompt: input.prompt,
                    ...(input.attachments ? { attachments: input.attachments } : {}),
                    ...(compactedReplay.summaryMessage ? { summaryMessage: compactedReplay.summaryMessage } : {}),
                });
                preparedEstimate = await estimatePreparedContextMessages({
                    profileId: input.profileId,
                    policy,
                    messages: finalMessages,
                });
            }
        }

        const budgetAssessment = assessContextBudget({
            policy,
            ...(preparedEstimate.estimate ? { estimate: preparedEstimate.estimate } : {}),
        });
        if (budgetAssessment.overUsableBudget) {
            return errOp(
                'invalid_payload',
                `Prepared context requires ${String(preparedEstimate.estimate?.totalTokens ?? 0)} tokens, which exceeds the usable input budget of ${String(policy.usableInputBudgetTokens)} for model "${input.modelId}".`
            );
        }

        return okOp({
            messages: finalMessages,
            digest: buildPreparedContextDigest(finalMessages),
            ...(preparedEstimate.estimate ? { estimate: preparedEstimate.estimate } : {}),
            policy,
            ...(compaction ? { compaction } : {}),
            ...(retrievedMemoryResult.summary ? { retrievedMemory: retrievedMemoryResult.summary } : {}),
        });
    }
}

export const sessionContextService = new SessionContextService();
