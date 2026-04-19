import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import type { CompactSessionResult, PreparedContextSummary, ResolvedContextPolicy } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { contextCompactionPreparationCoordinator } from '@/app/backend/runtime/services/context/contextCompactionPreparationCoordinator';
import { persistAppliedCompaction } from '@/app/backend/runtime/services/context/contextCompactionPersistence';
import {
    deriveCompactionCandidate,
    generateCompactionSummary,
    resolveCompactionSummarizerTarget,
} from '@/app/backend/runtime/services/context/contextCompactionShared';
import { buildPreparedContextMessages } from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';
import { buildResolvedContextState } from '@/app/backend/runtime/services/context/resolvedContextStateBuilder';
import { buildPreparedContextDigest } from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';
import { buildPreparedContextDigestSummary } from '@/app/backend/runtime/services/context/preparedContextLedger';
import { estimatePreparedContextMessages } from '@/app/backend/runtime/services/context/sessionContextBudgetEvaluator';
import { applyPersistedCompaction } from '@/app/backend/runtime/services/context/sessionReplayLoader';
import type { ReplayMessage } from '@/app/backend/runtime/services/runExecution/contextReplay';

export { selectMessagesToKeep } from '@/app/backend/runtime/services/context/contextCompactionShared';

function createEmptyPreparedContextSummary(input: {
    fullDigest: string;
    compactionReseedActive: boolean;
}): PreparedContextSummary {
    return {
        contributors: [],
        digest: buildPreparedContextDigestSummary({
            fullDigest: input.fullDigest,
            contributorDigest: 'ctxcontributors-empty',
            checkpointSummaries: {
                bootstrap: {
                    checkpoint: 'bootstrap',
                    includedContributorCount: 0,
                    excludedContributorCount: 0,
                    digest: 'ctxchk-bootstrap-empty',
                    active: true,
                },
                post_compaction_reseed: {
                    checkpoint: 'post_compaction_reseed',
                    includedContributorCount: 0,
                    excludedContributorCount: 0,
                    digest: 'ctxchk-post_compaction_reseed-empty',
                    active: input.compactionReseedActive,
                },
            },
            compactionReseedActive: input.compactionReseedActive,
        }),
        activeContributorCount: 0,
        compactionReseedActive: input.compactionReseedActive,
    };
}

export async function compactLoadedSessionContext(input: {
    profileId: string;
    sessionId: string;
    providerId: ResolvedContextPolicy['providerId'];
    modelId: string;
    source: 'auto' | 'manual';
    policy: ResolvedContextPolicy;
    replayMessages: ReplayMessage[];
    existingCompaction: SessionContextCompactionRecord | null;
}): Promise<OperationalResult<CompactSessionResult>> {
    if (!input.policy.enabled) {
        return okOp({
            compacted: false,
            reason: 'feature_disabled',
            state: buildResolvedContextState({
                policy: input.policy,
                preparedContext: createEmptyPreparedContextSummary({
                    fullDigest: 'runctx-empty',
                    compactionReseedActive: Boolean(input.existingCompaction),
                }),
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
    }

    if (input.policy.disabledReason === 'multimodal_counting_unavailable') {
        return okOp({
            compacted: false,
            reason: 'multimodal_counting_unavailable',
            state: buildResolvedContextState({
                policy: input.policy,
                preparedContext: createEmptyPreparedContextSummary({
                    fullDigest: 'runctx-empty',
                    compactionReseedActive: Boolean(input.existingCompaction),
                }),
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
    }

    if (!input.policy.limits.modelLimitsKnown || !input.policy.thresholdTokens) {
        return okOp({
            compacted: false,
            reason: 'missing_model_limits',
            state: buildResolvedContextState({
                policy: input.policy,
                preparedContext: createEmptyPreparedContextSummary({
                    fullDigest: 'runctx-empty',
                    compactionReseedActive: Boolean(input.existingCompaction),
                }),
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
    }

    const candidateResult = await deriveCompactionCandidate({
        profileId: input.profileId,
        policy: input.policy,
        replayMessages: input.replayMessages,
        existingCompaction: input.existingCompaction,
    });

    if (candidateResult.kind === 'skip') {
        return okOp({
            compacted: false,
            reason: candidateResult.reason,
            state: buildResolvedContextState({
                policy: input.policy,
                preparedContext: createEmptyPreparedContextSummary({
                    fullDigest: 'runctx-empty',
                    compactionReseedActive: Boolean(input.existingCompaction),
                }),
                ...(candidateResult.replayEstimate ? { estimate: candidateResult.replayEstimate } : {}),
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
    }

    const preparedCompaction = await contextCompactionPreparationCoordinator.consumePreparedCandidateIfCurrent({
        profileId: input.profileId,
        sessionId: input.sessionId,
        source: input.source,
        cutoffMessageId: candidateResult.candidate.latestSummarizedMessage.messageId,
        sourceDigest: candidateResult.candidate.sourceDigest,
        thresholdTokens: input.policy.thresholdTokens,
        estimatedInputTokens: candidateResult.candidate.replayEstimate?.totalTokens ?? 0,
    });

    let compaction = preparedCompaction;
    if (!compaction) {
        const summarizerTarget = await resolveCompactionSummarizerTarget({
            profileId: input.profileId,
            fallbackProviderId: input.providerId,
            fallbackModelId: input.modelId,
            summaryMessages: candidateResult.candidate.summaryMessages,
        });
        const summaryResult = await generateCompactionSummary({
            profileId: input.profileId,
            providerId: summarizerTarget.providerId,
            modelId: summarizerTarget.modelId,
            summaryMessages: candidateResult.candidate.summaryMessages,
        });
        if (summaryResult.isErr()) {
            return errOp(summaryResult.error.code, summaryResult.error.message, {
                ...(summaryResult.error.details ? { details: summaryResult.error.details } : {}),
                ...(summaryResult.error.retryable !== undefined ? { retryable: summaryResult.error.retryable } : {}),
            });
        }

        compaction = await persistAppliedCompaction({
            profileId: input.profileId,
            sessionId: input.sessionId,
            cutoffMessageId: candidateResult.candidate.latestSummarizedMessage.messageId,
            summaryText: summaryResult.value,
            source: input.source,
            thresholdTokens: input.policy.thresholdTokens,
            estimatedInputTokens: candidateResult.candidate.replayEstimate?.totalTokens ?? 0,
        });
    }

    const compactedReplay = applyPersistedCompaction(input.replayMessages, compaction);
    const nextEstimate = await estimatePreparedContextMessages({
        profileId: input.profileId,
        policy: input.policy,
        messages: buildPreparedContextMessages({
            bootstrapMessages: [],
            replayMessages: compactedReplay.replayMessages,
            prompt: '',
            ...(compactedReplay.summaryMessage ? { summaryMessage: compactedReplay.summaryMessage } : {}),
        }),
    });

    return okOp({
        compacted: true,
        state: buildResolvedContextState({
            policy: input.policy,
            preparedContext: createEmptyPreparedContextSummary({
                fullDigest: buildPreparedContextDigest(
                    buildPreparedContextMessages({
                        bootstrapMessages: [],
                        replayMessages: compactedReplay.replayMessages,
                        prompt: '',
                        ...(compactedReplay.summaryMessage ? { summaryMessage: compactedReplay.summaryMessage } : {}),
                    })
                ),
                compactionReseedActive: Boolean(compactedReplay.summaryMessage),
            }),
            ...(nextEstimate.estimate ? { estimate: nextEstimate.estimate } : {}),
            compaction,
        }),
    });
}
