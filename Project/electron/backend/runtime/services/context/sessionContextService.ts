import { createHash } from 'node:crypto';

import { messageStore, sessionContextCompactionStore } from '@/app/backend/persistence/stores';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import {
    createEntityId,
    type CompactSessionResult,
    type ResolvedContextPolicy,
    type ResolvedContextState,
    type TokenCountEstimate,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { contextPolicyService } from '@/app/backend/runtime/services/context/policyService';
import { tokenCountingService } from '@/app/backend/runtime/services/context/tokenCountingService';
import {
    buildReplayMessages,
    toPartsMap,
    type ReplayMessage,
} from '@/app/backend/runtime/services/runExecution/contextReplay';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
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

function buildDigest(messages: RunContextMessage[]): string {
    const hash = createHash('sha256');
    for (const message of messages) {
        hash.update(message.role);
        hash.update('|');
        hash.update(message.text);
        hash.update('\n');
    }
    return `runctx-${hash.digest('hex').slice(0, 32)}`;
}

function toSummaryMessage(compaction: SessionContextCompactionRecord): RunContextMessage {
    return {
        role: 'system',
        text: `Compacted conversation summary\n\n${compaction.summaryText}`,
    };
}

function applyPersistedCompaction(
    replayMessages: ReplayMessage[],
    compaction: SessionContextCompactionRecord | null
): { replayMessages: ReplayMessage[]; summaryMessage?: RunContextMessage } {
    if (!compaction) {
        return { replayMessages };
    }

    const cutoffIndex = replayMessages.findIndex((message) => message.messageId === compaction.cutoffMessageId);
    if (cutoffIndex < 0) {
        return { replayMessages };
    }

    return {
        replayMessages: replayMessages.slice(cutoffIndex + 1),
        summaryMessage: toSummaryMessage(compaction),
    };
}

function appendPrompt(messages: RunContextMessage[], prompt: string): RunContextMessage[] {
    const normalizedPrompt = prompt.trim();
    if (normalizedPrompt.length === 0) {
        return messages;
    }

    return [
        ...messages,
        {
            role: 'user',
            text: normalizedPrompt,
        },
    ];
}

function buildReplayContextMessages(input: {
    replayMessages: ReplayMessage[];
    prompt: string;
    summaryMessage?: RunContextMessage;
}): RunContextMessage[] {
    const baseMessages = [
        ...(input.summaryMessage ? [input.summaryMessage] : []),
        ...input.replayMessages.map<RunContextMessage>((message) => ({
            role: message.role,
            text: message.text,
        })),
    ];

    return appendPrompt(baseMessages, input.prompt);
}

function selectMessagesToKeep(
    replayMessages: ReplayMessage[],
    tokenParts: TokenCountEstimate['parts'],
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

    const adapter = getProviderAdapter(input.providerId);
    const summaryMessages: RunContextMessage[] = [
        { role: 'system', text: COMPACTION_SYSTEM_PROMPT },
        ...(input.existingSummary
            ? [
                  {
                      role: 'system' as const,
                      text: `Existing compacted summary\n\n${input.existingSummary}`,
                  },
              ]
            : []),
        ...input.replayMessages.map((message) => ({
            role: message.role,
            text: message.text,
        })),
        {
            role: 'user',
            text: 'Rewrite the compacted working summary for future turns. Preserve concrete decisions, files, constraints, and next steps.',
        },
    ];

    let summaryText = '';
    const result = await adapter.streamCompletion(
        {
            profileId: input.profileId,
            sessionId: createEntityId('sess'),
            runId: createEntityId('run'),
            providerId: input.providerId,
            modelId: input.modelId,
            promptText: '',
            contextMessages: summaryMessages,
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    openai: 'auto',
                },
            },
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

export interface PreparedSessionContext {
    messages: RunContextMessage[];
    digest: string;
    estimate?: TokenCountEstimate;
    policy: ResolvedContextPolicy;
    compaction?: SessionContextCompactionRecord;
}

class SessionContextService {
    private async loadReplayMessages(profileId: string, sessionId: string): Promise<ReplayMessage[]> {
        const [messages, parts] = await Promise.all([
            messageStore.listMessagesBySession(profileId, sessionId),
            messageStore.listPartsBySession(profileId, sessionId),
        ]);

        return buildReplayMessages({
            messages,
            partsByMessageId: toPartsMap(parts),
        });
    }

    private async estimateMessages(input: {
        profileId: string;
        policy: ResolvedContextPolicy;
        systemMessages: RunContextMessage[];
        replayMessages: ReplayMessage[];
        prompt: string;
        compaction: SessionContextCompactionRecord | null;
    }): Promise<{
        messages: RunContextMessage[];
        estimate?: TokenCountEstimate;
    }> {
        const persisted = applyPersistedCompaction(input.replayMessages, input.compaction);
        const replayContextMessages = buildReplayContextMessages({
            replayMessages: persisted.replayMessages,
            prompt: input.prompt,
            ...(persisted.summaryMessage ? { summaryMessage: persisted.summaryMessage } : {}),
        });
        const messages = [...input.systemMessages, ...replayContextMessages];

        if (!input.policy.limits.modelLimitsKnown) {
            return { messages };
        }

        const estimate = await tokenCountingService.estimate({
            profileId: input.profileId,
            providerId: input.policy.providerId,
            modelId: input.policy.modelId,
            messages,
        });

        return { messages, estimate };
    }

    private buildResolvedState(input: {
        policy: ResolvedContextPolicy;
        estimate?: TokenCountEstimate;
        compaction?: SessionContextCompactionRecord | null;
    }): ResolvedContextState {
        return {
            policy: input.policy,
            countingMode: input.estimate?.mode ?? tokenCountingService.getPreferredMode(input.policy),
            ...(input.estimate ? { estimate: input.estimate } : {}),
            ...(input.compaction ? { compaction: input.compaction } : {}),
            compactable:
                input.policy.enabled &&
                input.policy.limits.modelLimitsKnown &&
                input.policy.thresholdTokens !== undefined,
        };
    }

    async getResolvedState(input: {
        profileId: string;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        sessionId?: string;
        systemMessages?: RunContextMessage[];
    }): Promise<ResolvedContextState> {
        const policy = await contextPolicyService.resolvePolicy(input);
        if (!input.sessionId) {
            return this.buildResolvedState({ policy });
        }

        const [replayMessages, compaction] = await Promise.all([
            this.loadReplayMessages(input.profileId, input.sessionId),
            sessionContextCompactionStore.get(input.profileId, input.sessionId),
        ]);
        const estimated = await this.estimateMessages({
            profileId: input.profileId,
            policy,
            systemMessages: input.systemMessages ?? [],
            replayMessages,
            prompt: '',
            compaction,
        });

        return this.buildResolvedState({
            policy,
            ...(estimated.estimate ? { estimate: estimated.estimate } : {}),
            ...(compaction ? { compaction } : {}),
        });
    }

    async compactSession(input: {
        profileId: string;
        sessionId: string;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        source: 'auto' | 'manual';
    }): Promise<OperationalResult<CompactSessionResult>> {
        const [policy, replayMessages, existingCompaction] = await Promise.all([
            contextPolicyService.resolvePolicy(input),
            this.loadReplayMessages(input.profileId, input.sessionId),
            sessionContextCompactionStore.get(input.profileId, input.sessionId),
        ]);

        if (!policy.enabled) {
            return okOp({
                compacted: false,
                reason: 'feature_disabled',
                state: this.buildResolvedState({
                    policy,
                    ...(existingCompaction ? { compaction: existingCompaction } : {}),
                }),
            });
        }

        if (!policy.limits.modelLimitsKnown || !policy.thresholdTokens) {
            return okOp({
                compacted: false,
                reason: 'missing_model_limits',
                state: this.buildResolvedState({
                    policy,
                    ...(existingCompaction ? { compaction: existingCompaction } : {}),
                }),
            });
        }

        const persisted = applyPersistedCompaction(replayMessages, existingCompaction);
        const recentReplayMessages = persisted.replayMessages;
        const replayEstimate = await tokenCountingService.estimate({
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            messages: recentReplayMessages.map((message) => ({
                role: message.role,
                text: message.text,
            })),
        });

        if (replayEstimate.totalTokens <= policy.thresholdTokens) {
            return okOp({
                compacted: false,
                reason: 'not_needed',
                state: this.buildResolvedState({
                    policy,
                    estimate: replayEstimate,
                    ...(existingCompaction ? { compaction: existingCompaction } : {}),
                }),
            });
        }

        const keepSelection = selectMessagesToKeep(recentReplayMessages, replayEstimate.parts, policy.thresholdTokens);
        if (!keepSelection) {
            return okOp({
                compacted: false,
                reason: 'not_enough_messages',
                state: this.buildResolvedState({
                    policy,
                    estimate: replayEstimate,
                    ...(existingCompaction ? { compaction: existingCompaction } : {}),
                }),
            });
        }

        const messagesToSummarize = recentReplayMessages.slice(0, keepSelection.keepStartIndex);
        const latestSummarizedMessage = messagesToSummarize.at(-1);
        if (!latestSummarizedMessage) {
            return okOp({
                compacted: false,
                reason: 'not_enough_messages',
                state: this.buildResolvedState({
                    policy,
                    estimate: replayEstimate,
                    ...(existingCompaction ? { compaction: existingCompaction } : {}),
                }),
            });
        }

        const summaryResult = await summarizeReplayMessages({
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            replayMessages: messagesToSummarize,
            ...(existingCompaction ? { existingSummary: existingCompaction.summaryText } : {}),
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
            thresholdTokens: policy.thresholdTokens,
            estimatedInputTokens: replayEstimate.totalTokens,
        });

        const nextEstimate = await this.estimateMessages({
            profileId: input.profileId,
            policy,
            systemMessages: [],
            replayMessages,
            prompt: '',
            compaction,
        });

        return okOp({
            compacted: true,
            state: this.buildResolvedState({
                policy,
                ...(nextEstimate.estimate ? { estimate: nextEstimate.estimate } : {}),
                compaction,
            }),
        });
    }

    async prepareSessionContext(input: {
        profileId: string;
        sessionId: string;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        systemMessages: RunContextMessage[];
        prompt: string;
    }): Promise<OperationalResult<PreparedSessionContext>> {
        const replayMessages = await this.loadReplayMessages(input.profileId, input.sessionId);
        const policy = await contextPolicyService.resolvePolicy({
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
        });
        let compaction = await sessionContextCompactionStore.get(input.profileId, input.sessionId);

        let prepared = await this.estimateMessages({
            profileId: input.profileId,
            policy,
            systemMessages: input.systemMessages,
            replayMessages,
            prompt: input.prompt,
            compaction,
        });

        if (
            policy.enabled &&
            policy.limits.modelLimitsKnown &&
            policy.thresholdTokens &&
            prepared.estimate &&
            prepared.estimate.totalTokens > policy.thresholdTokens
        ) {
            const compactResult = await this.compactSession({
                profileId: input.profileId,
                sessionId: input.sessionId,
                providerId: input.providerId,
                modelId: input.modelId,
                source: 'auto',
            });
            if (compactResult.isErr()) {
                return errOp(compactResult.error.code, compactResult.error.message, {
                    ...(compactResult.error.details ? { details: compactResult.error.details } : {}),
                    ...(compactResult.error.retryable !== undefined
                        ? { retryable: compactResult.error.retryable }
                        : {}),
                });
            }
            if (compactResult.value.compacted) {
                compaction = compactResult.value.state.compaction ?? null;
                prepared = await this.estimateMessages({
                    profileId: input.profileId,
                    policy,
                    systemMessages: input.systemMessages,
                    replayMessages,
                    prompt: input.prompt,
                    compaction,
                });
            }
        }

        if (
            policy.limits.modelLimitsKnown &&
            policy.usableInputBudgetTokens &&
            prepared.estimate &&
            prepared.estimate.totalTokens > policy.usableInputBudgetTokens
        ) {
            return errOp(
                'invalid_payload',
                `Prepared context requires ${String(prepared.estimate.totalTokens)} tokens, which exceeds the usable input budget of ${String(policy.usableInputBudgetTokens)} for model "${input.modelId}".`
            );
        }

        return okOp({
            messages: prepared.messages,
            digest: buildDigest(prepared.messages),
            ...(prepared.estimate ? { estimate: prepared.estimate } : {}),
            policy,
            ...(compaction ? { compaction } : {}),
        });
    }
}

export const sessionContextService = new SessionContextService();
