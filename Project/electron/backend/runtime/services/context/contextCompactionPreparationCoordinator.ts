import {
    sessionContextCompactionPreparationStore,
    sessionContextCompactionStore,
} from '@/app/backend/persistence/stores';
import type {
    SessionContextCompactionPreparationRecord,
    SessionContextCompactionRecord,
} from '@/app/backend/persistence/types';
import type { ResolvedContextPolicy } from '@/app/backend/runtime/contracts';
import {
    deriveCompactionCandidate,
    generateCompactionSummary,
    resolveCompactionSummarizerTarget,
} from '@/app/backend/runtime/services/context/contextCompactionShared';
import type { ReplayMessage } from '@/app/backend/runtime/services/runExecution/contextReplay';
import { appLog } from '@/app/main/logging';

const PREPARATION_TRIGGER_RATIO = 0.85;

function buildPreparationKey(profileId: string, sessionId: string): string {
    return `${profileId}:${sessionId}`;
}

function isCurrentPreparation(
    record: SessionContextCompactionPreparationRecord,
    input: { cutoffMessageId: string; sourceDigest: string; thresholdTokens: number }
): boolean {
    return (
        record.cutoffMessageId === input.cutoffMessageId &&
        record.sourceDigest === input.sourceDigest &&
        record.thresholdTokens === input.thresholdTokens
    );
}

class ContextCompactionPreparationCoordinator {
    private readonly inFlight = new Map<string, Promise<void>>();

    shouldPrepare(input: { thresholdTokens?: number; totalTokens?: number }): boolean {
        if (!input.thresholdTokens || input.totalTokens === undefined) {
            return false;
        }

        const startAt = Math.floor(input.thresholdTokens * PREPARATION_TRIGGER_RATIO);
        return input.totalTokens >= startAt && input.totalTokens < input.thresholdTokens;
    }

    schedulePreparation(input: {
        profileId: string;
        sessionId: string;
        policy: ResolvedContextPolicy;
        replayMessages: ReplayMessage[];
        existingCompaction: SessionContextCompactionRecord | null;
    }): Promise<void> {
        const key = buildPreparationKey(input.profileId, input.sessionId);
        const inFlight = this.inFlight.get(key);
        if (inFlight) {
            return inFlight;
        }

        const task = this.runPreparation(input)
            .catch((error: unknown) => {
                appLog.warn({
                    tag: 'context-compaction-preparation',
                    message: 'Failed to prepare background context compaction.',
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    error: error instanceof Error ? error.message : String(error),
                });
            })
            .finally(() => {
                if (this.inFlight.get(key) === task) {
                    this.inFlight.delete(key);
                }
            });

        this.inFlight.set(key, task);
        return task;
    }

    private async runPreparation(input: {
        profileId: string;
        sessionId: string;
        policy: ResolvedContextPolicy;
        replayMessages: ReplayMessage[];
        existingCompaction: SessionContextCompactionRecord | null;
    }): Promise<void> {
        const candidateResult = await deriveCompactionCandidate(input);
        if (candidateResult.kind === 'skip') {
            await sessionContextCompactionPreparationStore.deleteBySession(input.profileId, input.sessionId);
            return;
        }

        const currentPreparation = await sessionContextCompactionPreparationStore.get(input.profileId, input.sessionId);
        if (
            currentPreparation &&
            isCurrentPreparation(currentPreparation, {
                cutoffMessageId: candidateResult.candidate.latestSummarizedMessage.messageId,
                sourceDigest: candidateResult.candidate.sourceDigest,
                thresholdTokens: input.policy.thresholdTokens ?? 0,
            })
        ) {
            return;
        }

        const summarizerTarget = await resolveCompactionSummarizerTarget({
            profileId: input.profileId,
            fallbackProviderId: input.policy.providerId,
            fallbackModelId: input.policy.modelId,
            summaryMessages: candidateResult.candidate.summaryMessages,
        });
        const summaryResult = await generateCompactionSummary({
            profileId: input.profileId,
            providerId: summarizerTarget.providerId,
            modelId: summarizerTarget.modelId,
            summaryMessages: candidateResult.candidate.summaryMessages,
        });
        if (summaryResult.isErr()) {
            throw new Error(summaryResult.error.message);
        }

        await sessionContextCompactionPreparationStore.upsert({
            profileId: input.profileId,
            sessionId: input.sessionId,
            cutoffMessageId: candidateResult.candidate.latestSummarizedMessage.messageId,
            sourceDigest: candidateResult.candidate.sourceDigest,
            summaryText: summaryResult.value,
            summarizerProviderId: summarizerTarget.providerId,
            summarizerModelId: summarizerTarget.modelId,
            thresholdTokens: input.policy.thresholdTokens ?? 0,
            estimatedInputTokens: candidateResult.candidate.replayEstimate?.totalTokens ?? 0,
        });
    }

    async consumePreparedCandidateIfCurrent(input: {
        profileId: string;
        sessionId: string;
        source: 'auto' | 'manual';
        cutoffMessageId: string;
        sourceDigest: string;
        thresholdTokens: number;
        estimatedInputTokens: number;
    }): Promise<SessionContextCompactionRecord | null> {
        const preparation = await sessionContextCompactionPreparationStore.get(input.profileId, input.sessionId);
        if (!preparation) {
            return null;
        }

        if (
            !isCurrentPreparation(preparation, {
                cutoffMessageId: input.cutoffMessageId,
                sourceDigest: input.sourceDigest,
                thresholdTokens: input.thresholdTokens,
            })
        ) {
            await sessionContextCompactionPreparationStore.deleteBySession(input.profileId, input.sessionId);
            return null;
        }

        const compaction = await sessionContextCompactionStore.upsert({
            profileId: input.profileId,
            sessionId: input.sessionId,
            cutoffMessageId: input.cutoffMessageId,
            summaryText: preparation.summaryText,
            source: input.source,
            thresholdTokens: input.thresholdTokens,
            estimatedInputTokens: input.estimatedInputTokens,
        });
        await sessionContextCompactionPreparationStore.deleteBySession(input.profileId, input.sessionId);
        return compaction;
    }
}

export const contextCompactionPreparationCoordinator = new ContextCompactionPreparationCoordinator();
