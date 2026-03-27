import { providerStore, sessionContextCompactionStore } from '@/app/backend/persistence/stores';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import type { CompactSessionResult, ResolvedContextPolicy } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { buildPreparedContextMessages } from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';
import { estimatePreparedContextMessages } from '@/app/backend/runtime/services/context/sessionContextBudgetEvaluator';
import { buildResolvedContextState } from '@/app/backend/runtime/services/context/resolvedContextStateBuilder';
import { applyPersistedCompaction } from '@/app/backend/runtime/services/context/sessionReplayLoader';
import { createTextMessage } from '@/app/backend/runtime/services/runExecution/contextParts';
import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import type { ReplayMessage } from '@/app/backend/runtime/services/runExecution/contextReplay';

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

async function summarizeReplayMessages(input: {
    profileId: string;
    providerId: ResolvedContextPolicy['providerId'];
    modelId: string;
    replayMessages: ReplayMessage[];
    existingSummary?: string;
}): Promise<OperationalResult<string>> {
    const authResult = await resolveRunAuth({
        profileId: input.profileId,
        providerId: input.providerId,
    });
    if (authResult.isErr()) {
        return errOp(authResult.error.code, authResult.error.message);
    }

    const modelCapabilities = await providerStore.getModelCapabilities(
        input.profileId,
        input.providerId,
        input.modelId
    );
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
    const summaryMessages = [
        createTextMessage('system', COMPACTION_SYSTEM_PROMPT),
        ...(input.existingSummary
            ? [createTextMessage('system', `Existing compacted summary\n\n${input.existingSummary}`)]
            : []),
        ...input.replayMessages.map((message) => ({
            role: message.role,
            parts: message.parts,
        })),
        createTextMessage(
            'user',
            'Rewrite the compacted working summary for future turns. Preserve concrete decisions, files, constraints, and next steps.'
        ),
    ];

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
            contextMessages: summaryMessages.map((message) => ({
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
            })),
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
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
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

    if (replayEstimate.estimate && replayEstimate.estimate.totalTokens <= input.policy.thresholdTokens) {
        return okOp({
            compacted: false,
            reason: 'not_needed',
            state: buildResolvedContextState({
                policy: input.policy,
                ...(replayEstimate.estimate ? { estimate: replayEstimate.estimate } : {}),
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
    }

    const keepSelection = selectMessagesToKeep(persisted.replayMessages, replayEstimate.estimate?.parts ?? [], input.policy.thresholdTokens);
    if (!keepSelection) {
        return okOp({
            compacted: false,
            reason: 'not_enough_messages',
            state: buildResolvedContextState({
                policy: input.policy,
                ...(replayEstimate.estimate ? { estimate: replayEstimate.estimate } : {}),
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
    }

    const messagesToSummarize = persisted.replayMessages.slice(0, keepSelection.keepStartIndex);
    const latestSummarizedMessage = messagesToSummarize.at(-1);
    if (!latestSummarizedMessage) {
        return okOp({
            compacted: false,
            reason: 'not_enough_messages',
            state: buildResolvedContextState({
                policy: input.policy,
                ...(replayEstimate.estimate ? { estimate: replayEstimate.estimate } : {}),
                ...(input.existingCompaction ? { compaction: input.existingCompaction } : {}),
            }),
        });
    }

    const summaryResult = await summarizeReplayMessages({
        profileId: input.profileId,
        providerId: input.providerId,
        modelId: input.modelId,
        replayMessages: messagesToSummarize,
        ...(input.existingCompaction ? { existingSummary: input.existingCompaction.summaryText } : {}),
    });
    if (summaryResult.isErr()) {
        return errOp(summaryResult.error.code, summaryResult.error.message, {
            ...(summaryResult.error.details ? { details: summaryResult.error.details } : {}),
            ...(summaryResult.error.retryable !== undefined ? { retryable: summaryResult.error.retryable } : {}),
        });
    }

    const compaction = await sessionContextCompactionStore.upsert({
        profileId: input.profileId,
        sessionId: input.sessionId,
        cutoffMessageId: latestSummarizedMessage.messageId,
        summaryText: summaryResult.value,
        source: input.source,
        thresholdTokens: input.policy.thresholdTokens,
        estimatedInputTokens: replayEstimate.estimate?.totalTokens ?? 0,
    });

    const nextEstimate = await estimatePreparedContextMessages({
        profileId: input.profileId,
        policy: input.policy,
        messages: buildPreparedContextMessages({
            systemMessages: [],
            replayMessages: input.replayMessages,
            prompt: '',
            summaryMessage: {
                role: 'system',
                parts: [
                    {
                        type: 'text',
                        text: `Compacted conversation summary\n\n${compaction.summaryText}`,
                    },
                ],
            },
        }),
    });

    return okOp({
        compacted: true,
        state: buildResolvedContextState({
            policy: input.policy,
            ...(nextEstimate.estimate ? { estimate: nextEstimate.estimate } : {}),
            compaction,
        }),
    });
}
