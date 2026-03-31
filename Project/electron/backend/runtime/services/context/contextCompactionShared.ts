import { createHash } from 'node:crypto';

import { getProviderAdapter } from '@/app/backend/providers/adapters';
import { providerStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import type { ResolvedContextPolicy, RuntimeProviderId, TokenCountEstimate } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { contextPolicyService } from '@/app/backend/runtime/services/context/policyService';
import { buildPreparedContextMessages } from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';
import { estimatePreparedContextMessages } from '@/app/backend/runtime/services/context/sessionContextBudgetEvaluator';
import { applyPersistedCompaction } from '@/app/backend/runtime/services/context/sessionReplayLoader';
import { utilityModelService } from '@/app/backend/runtime/services/profile/utilityModel';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
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

function toProviderContextMessages(
    summaryMessages: RunContextMessage[]
): NonNullable<ProviderRuntimeInput['contextMessages']> {
    return summaryMessages.map((message) => ({
        role: message.role,
        parts: message.parts.flatMap((part) =>
            part.type === 'text'
                ? [
                      {
                          type: 'text' as const,
                          text: part.text,
                      },
                  ]
                : []
        ),
    }));
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
            systemMessages: [],
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
    const target = await utilityModelService.resolveUtilityModelTarget({
        profileId: input.profileId,
        fallbackProviderId: input.fallbackProviderId,
        fallbackModelId: input.fallbackModelId,
    });
    if (target.source !== 'utility') {
        return {
            providerId: target.providerId,
            modelId: target.modelId,
            source: 'fallback',
        };
    }

    const utilityPolicy = await contextPolicyService.resolvePolicy({
        profileId: input.profileId,
        providerId: target.providerId,
        modelId: target.modelId,
    });
    if (!utilityPolicy.limits.modelLimitsKnown || !utilityPolicy.usableInputBudgetTokens || utilityPolicy.disabledReason) {
        return {
            providerId: input.fallbackProviderId,
            modelId: input.fallbackModelId,
            source: 'fallback',
        };
    }

    const estimate = await estimatePreparedContextMessages({
        profileId: input.profileId,
        policy: utilityPolicy,
        messages: input.summaryMessages,
    });
    if (!estimate.estimate || estimate.estimate.totalTokens > utilityPolicy.usableInputBudgetTokens) {
        return {
            providerId: input.fallbackProviderId,
            modelId: input.fallbackModelId,
            source: 'fallback',
        };
    }

    return target;
}

export async function generateCompactionSummary(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    summaryMessages: RunContextMessage[];
}): Promise<OperationalResult<string>> {
    const authResult = await resolveRunAuth({
        profileId: input.profileId,
        providerId: input.providerId,
    });
    if (authResult.isErr()) {
        return errOp(authResult.error.code, authResult.error.message);
    }

    const modelCapabilities = await providerStore.getModelCapabilities(input.profileId, input.providerId, input.modelId);
    if (!modelCapabilities) {
        return errOp('provider_model_missing', `Model "${input.modelId}" is missing runtime capabilities.`);
    }

    const runtimeOptions = {
        reasoning: {
            effort: 'none' as const,
            summary: 'none' as const,
            includeEncrypted: false,
        },
        cache: {
            strategy: 'auto' as const,
        },
        transport: {
            family: 'auto' as const,
        },
        execution: {},
    };
    const runtimeProtocol = await resolveRuntimeProtocol({
        profileId: input.profileId,
        providerId: input.providerId,
        modelId: input.modelId,
        modelCapabilities,
        authMethod: authResult.value.authMethod,
        runtimeOptions,
    });
    if (runtimeProtocol.isErr()) {
        return errOp(runtimeProtocol.error.code, runtimeProtocol.error.message);
    }

    const adapter = getProviderAdapter(input.providerId);
    let summaryText = '';
    const result = await adapter.streamCompletion(
        {
            profileId: input.profileId,
            sessionId: createEntityId('sess'),
            runId: createEntityId('run'),
            providerId: input.providerId,
            modelId: input.modelId,
            runtime: runtimeProtocol.value.runtime,
            promptText: '',
            contextMessages: toProviderContextMessages(input.summaryMessages),
            runtimeOptions,
            cache: {
                strategy: 'auto',
                applied: false,
            },
            authMethod: authResult.value.authMethod,
            ...(authResult.value.apiKey ? { apiKey: authResult.value.apiKey } : {}),
            ...(authResult.value.accessToken ? { accessToken: authResult.value.accessToken } : {}),
            ...(authResult.value.organizationId ? { organizationId: authResult.value.organizationId } : {}),
            signal: new AbortController().signal,
        },
        {
            onPart: (part) => {
                if (part.partType === 'text' || part.partType === 'reasoning_summary') {
                    const nextText = part.payload['text'];
                    if (typeof nextText === 'string') {
                        summaryText += nextText;
                    }
                }
            },
        }
    );
    if (result.isErr()) {
        return errOp(result.error.code, result.error.message);
    }

    const normalizedSummary = summaryText.trim();
    if (normalizedSummary.length === 0) {
        return errOp('provider_request_failed', 'Context compaction returned an empty summary.');
    }

    return okOp(normalizedSummary);
}
