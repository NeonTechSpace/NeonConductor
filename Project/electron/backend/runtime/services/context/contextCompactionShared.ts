import { createHash } from 'node:crypto';

import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import type { ResolvedContextPolicy, RuntimeProviderId, TokenCountEstimate } from '@/app/backend/runtime/contracts';
import { generatePlainTextFromMessages } from '@/app/backend/runtime/services/common/plainTextGeneration';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { resolveSummaryGenerationTarget } from '@/app/backend/runtime/services/common/summaryGenerationTarget';
import { buildPreparedContextMessages } from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';
import { estimatePreparedContextMessages } from '@/app/backend/runtime/services/context/sessionContextBudgetEvaluator';
import { utilityModelConsumerPreferencesService } from '@/app/backend/runtime/services/profile/utilityModelConsumerPreferences';
import { applyPersistedCompaction } from '@/app/backend/runtime/services/context/sessionReplayLoader';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import type { ReplayMessage } from '@/app/backend/runtime/services/runExecution/contextReplay';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

const MIN_RECENT_REPLAY_MESSAGES = 4;
const MIN_MESSAGES_TO_COMPACT = 6;
const MIN_RECENT_TOKEN_BUDGET = 2_048;
const RECENT_TOKEN_BUDGET_RATIO = 0.35;

const COMPACTION_SYSTEM_PROMPT = [
    'You are compacting conversation context for continued execution.',
    'Rewrite the older conversation into a concise but complete working summary.',
    'Preserve decisions, file paths, tool outcomes, constraints, open questions, and the next useful step.',
    'Do not add new ideas. Do not omit unresolved work. Output plain text only.',
].join(' ');

const COMPACTION_USER_PROMPT =
    'Rewrite the compacted working summary for future turns. Preserve concrete decisions, files, constraints, and next steps.';

export interface CompactionCandidate {
    replayEstimate?: TokenCountEstimate;
    latestSummarizedMessage: ReplayMessage;
    summaryMessages: RunContextMessage[];
    sourceDigest: string;
}

export type CompactionCandidateResolution =
    | { kind: 'skip'; reason: 'not_needed' | 'not_enough_messages'; replayEstimate?: TokenCountEstimate }
    | { kind: 'ready'; candidate: CompactionCandidate };

function createSkipResolution(
    reason: 'not_needed' | 'not_enough_messages',
    replayEstimate?: TokenCountEstimate
): CompactionCandidateResolution {
    return replayEstimate
        ? {
              kind: 'skip',
              reason,
              replayEstimate,
          }
        : {
              kind: 'skip',
              reason,
          };
}

export function selectMessagesToKeep(
    replayMessages: ReplayMessage[],
    tokenParts: { tokenCount: number }[],
    thresholdTokens: number
): { keepStartIndex: number } | null {
    if (replayMessages.length < MIN_MESSAGES_TO_COMPACT) {
        return null;
    }

    const recentBudget = Math.max(MIN_RECENT_TOKEN_BUDGET, Math.floor(thresholdTokens * RECENT_TOKEN_BUDGET_RATIO));
    let keepStartIndex = replayMessages.length;
    let runningTokens = 0;
    let keptMessages = 0;

    for (let index = replayMessages.length - 1; index >= 0; index -= 1) {
        const tokenCount = tokenParts[index]?.tokenCount ?? 0;
        const wouldReachBudget = runningTokens + tokenCount > recentBudget;
        if (keptMessages >= MIN_RECENT_REPLAY_MESSAGES && wouldReachBudget) {
            break;
        }

        keepStartIndex = index;
        runningTokens += tokenCount;
        keptMessages += 1;
    }

    if (keepStartIndex <= 0) {
        return null;
    }

    return { keepStartIndex };
}

function toCompactionTextMessage(message: ReplayMessage): RunContextMessage {
    return {
        role: message.role,
        parts: message.parts
            .filter(
                (
                    part
                ): part is {
                    type: 'text';
                    text: string;
                } => part.type === 'text' || part.type === 'reasoning' || part.type === 'reasoning_summary'
            )
            .map((part) => ({
                type: 'text' as const,
                text: part.text,
            })),
    };
}

export function buildCompactionSummaryMessages(input: {
    replayMessages: ReplayMessage[];
    existingSummary?: string;
}): RunContextMessage[] {
    return [
        createTextMessage('system', COMPACTION_SYSTEM_PROMPT),
        ...(input.existingSummary
            ? [createTextMessage('system', `Existing compacted summary\n\n${input.existingSummary}`)]
            : []),
        ...input.replayMessages.map(toCompactionTextMessage),
        createTextMessage('user', COMPACTION_USER_PROMPT),
    ];
}

export function createCompactionSourceDigest(summaryMessages: RunContextMessage[]): string {
    const normalized = summaryMessages.map((message) => ({
        role: message.role,
        parts: message.parts
            .filter(
                (
                    part
                ): part is {
                    type: 'text';
                    text: string;
                } => part.type === 'text'
            )
            .map((part) => part.text),
    }));

    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
}

export async function deriveCompactionCandidate(input: {
    profileId: string;
    policy: ResolvedContextPolicy;
    replayMessages: ReplayMessage[];
    existingCompaction: SessionContextCompactionRecord | null;
}): Promise<CompactionCandidateResolution> {
    const thresholdTokens = input.policy.thresholdTokens;
    if (!thresholdTokens) {
        return createSkipResolution('not_needed');
    }

    const persisted = applyPersistedCompaction(input.replayMessages, input.existingCompaction);
    const replayEstimate = await estimatePreparedContextMessages({
        profileId: input.profileId,
        policy: input.policy,
        messages: buildPreparedContextMessages({
            bootstrapMessages: [],
            replayMessages: persisted.replayMessages,
            prompt: '',
            ...(persisted.summaryMessage ? { summaryMessage: persisted.summaryMessage } : {}),
        }),
    });

    if (replayEstimate.estimate && replayEstimate.estimate.totalTokens <= thresholdTokens) {
        return createSkipResolution('not_needed', replayEstimate.estimate);
    }

    const keepSelection = selectMessagesToKeep(
        persisted.replayMessages,
        replayEstimate.estimate?.parts ?? [],
        thresholdTokens
    );
    if (!keepSelection) {
        return createSkipResolution('not_enough_messages', replayEstimate.estimate);
    }

    const messagesToSummarize = persisted.replayMessages.slice(0, keepSelection.keepStartIndex);
    const latestSummarizedMessage = messagesToSummarize.at(-1);
    if (!latestSummarizedMessage) {
        return createSkipResolution('not_enough_messages', replayEstimate.estimate);
    }

    const summaryMessages = buildCompactionSummaryMessages({
        replayMessages: messagesToSummarize,
        ...(input.existingCompaction ? { existingSummary: input.existingCompaction.summaryText } : {}),
    });

    const candidate: CompactionCandidate = replayEstimate.estimate
        ? {
              latestSummarizedMessage,
              summaryMessages,
              sourceDigest: createCompactionSourceDigest(summaryMessages),
              replayEstimate: replayEstimate.estimate,
          }
        : {
              latestSummarizedMessage,
              summaryMessages,
              sourceDigest: createCompactionSourceDigest(summaryMessages),
          };

    return {
        kind: 'ready',
        candidate,
    };
}

export async function resolveCompactionSummarizerTarget(input: {
    profileId: string;
    fallbackProviderId: RuntimeProviderId;
    fallbackModelId: string;
    summaryMessages: RunContextMessage[];
}): Promise<{ providerId: RuntimeProviderId; modelId: string; source: 'utility' | 'fallback' }> {
    const compactionUsesUtilityModel = await utilityModelConsumerPreferencesService.shouldUseUtilityModel(
        input.profileId,
        'context_compaction'
    );
    if (!compactionUsesUtilityModel) {
        return {
            providerId: input.fallbackProviderId,
            modelId: input.fallbackModelId,
            source: 'fallback',
        };
    }

    const target = await resolveSummaryGenerationTarget({
        profileId: input.profileId,
        fallbackProviderId: input.fallbackProviderId,
        fallbackModelId: input.fallbackModelId,
        summaryMessages: input.summaryMessages,
    });

    return (
        target ?? {
            providerId: input.fallbackProviderId,
            modelId: input.fallbackModelId,
            source: 'fallback',
        }
    );
}

export async function generateCompactionSummary(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    summaryMessages: RunContextMessage[];
}): Promise<OperationalResult<string>> {
    const generated = await generatePlainTextFromMessages({
        profileId: input.profileId,
        providerId: input.providerId,
        modelId: input.modelId,
        messages: input.summaryMessages,
    });
    if (generated.isErr()) {
        return errOp(generated.error.code, generated.error.message);
    }

    const normalizedSummary = generated.value.trim();
    if (normalizedSummary.length === 0) {
        return errOp('provider_request_failed', 'Context compaction returned an empty summary.');
    }

    return okOp(normalizedSummary);
}
