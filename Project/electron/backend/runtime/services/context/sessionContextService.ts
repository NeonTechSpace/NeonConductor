import { createHash } from 'node:crypto';

import { messageStore, providerStore, sessionContextCompactionStore } from '@/app/backend/persistence/stores';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import type { ComposerImageAttachmentInput } from '@/app/backend/runtime/contracts';
import {
    type EntityId,
    type CompactSessionResult,
    type ResolvedContextPolicy,
    type ResolvedContextState,
    type RetrievedMemorySummary,
    type TokenCountEstimate,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { contextPolicyService } from '@/app/backend/runtime/services/context/policyService';
import { tokenCountingService } from '@/app/backend/runtime/services/context/tokenCountingService';
import { memoryRetrievalService } from '@/app/backend/runtime/services/memory/retrieval';
import {
    appendPromptMessage,
    createTextMessage,
    hashablePartContent,
} from '@/app/backend/runtime/services/runExecution/contextParts';
import { buildSessionSystemPrelude } from '@/app/backend/runtime/services/runExecution/contextPrelude';
import {
    buildReplayMessages,
    toPartsMap,
    type ReplayMessage,
} from '@/app/backend/runtime/services/runExecution/contextReplay';
import { resolveModeExecution } from '@/app/backend/runtime/services/runExecution/mode';
import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';
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
        for (const part of message.parts) {
            hash.update(hashablePartContent(part));
            hash.update('\n');
        }
    }
    return `runctx-${hash.digest('hex').slice(0, 32)}`;
}

function toSummaryMessage(compaction: SessionContextCompactionRecord): RunContextMessage {
    return createTextMessage('system', `Compacted conversation summary\n\n${compaction.summaryText}`);
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

function buildReplayContextMessages(input: {
    replayMessages: ReplayMessage[];
    prompt: string;
    attachments?: ComposerImageAttachmentInput[];
    summaryMessage?: RunContextMessage;
}): RunContextMessage[] {
    const baseMessages = [
        ...(input.summaryMessage ? [input.summaryMessage] : []),
        ...input.replayMessages.map<RunContextMessage>((message) => ({
            role: message.role,
            parts: message.parts,
        })),
    ];

    return appendPromptMessage({
        messages: baseMessages,
        prompt: input.prompt,
        ...(input.attachments ? { attachments: input.attachments } : {}),
    });
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
    const summaryMessages: RunContextMessage[] = [
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

export interface PreparedSessionContext {
    messages: RunContextMessage[];
    digest: string;
    estimate?: TokenCountEstimate;
    policy: ResolvedContextPolicy;
    compaction?: SessionContextCompactionRecord;
    retrievedMemory?: RetrievedMemorySummary;
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
        attachments?: ComposerImageAttachmentInput[];
        compaction: SessionContextCompactionRecord | null;
    }): Promise<{
        messages: RunContextMessage[];
        estimate?: TokenCountEstimate;
    }> {
        const persisted = applyPersistedCompaction(input.replayMessages, input.compaction);
        const replayContextMessages = buildReplayContextMessages({
            replayMessages: persisted.replayMessages,
            prompt: input.prompt,
            ...(input.attachments ? { attachments: input.attachments } : {}),
            ...(persisted.summaryMessage ? { summaryMessage: persisted.summaryMessage } : {}),
        });
        const messages = [...input.systemMessages, ...replayContextMessages];

        if (
            !input.policy.limits.modelLimitsKnown ||
            input.policy.disabledReason === 'multimodal_counting_unavailable'
        ) {
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
        retrievedMemory?: RetrievedMemorySummary;
    }): ResolvedContextState {
        return {
            policy: input.policy,
            countingMode: input.estimate?.mode ?? tokenCountingService.getPreferredMode(input.policy),
            ...(input.estimate ? { estimate: input.estimate } : {}),
            ...(input.compaction ? { compaction: input.compaction } : {}),
            ...(input.retrievedMemory ? { retrievedMemory: input.retrievedMemory } : {}),
            compactable:
                input.policy.enabled &&
                input.policy.disabledReason === undefined &&
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
        if (!input.sessionId) {
            const policy = await contextPolicyService.resolvePolicy(input);
            return this.buildResolvedState({ policy });
        }

        const [replayMessages, compaction] = await Promise.all([
            this.loadReplayMessages(input.profileId, input.sessionId),
            sessionContextCompactionStore.get(input.profileId, input.sessionId),
        ]);
        const policy = await contextPolicyService.resolvePolicy({
            ...input,
            hasMultimodalContent: replayMessages.some((message) => message.parts.some((part) => part.type === 'image')),
        });
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

        const preparedContext = await this.prepareSessionContext({
            profileId: input.profileId,
            sessionId: input.sessionId,
            providerId: input.providerId,
            modelId: input.modelId,
            systemMessages: systemPreludeResult.value,
            prompt: input.prompt ?? '',
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
        });
        if (preparedContext.isErr()) {
            return errOp(preparedContext.error.code, preparedContext.error.message, {
                ...(preparedContext.error.details ? { details: preparedContext.error.details } : {}),
                ...(preparedContext.error.retryable !== undefined
                    ? { retryable: preparedContext.error.retryable }
                    : {}),
            });
        }

        return okOp(
            this.buildResolvedState({
                policy: preparedContext.value.policy,
                ...(preparedContext.value.estimate ? { estimate: preparedContext.value.estimate } : {}),
                ...(preparedContext.value.compaction ? { compaction: preparedContext.value.compaction } : {}),
                ...(preparedContext.value.retrievedMemory
                    ? { retrievedMemory: preparedContext.value.retrievedMemory }
                    : {}),
            })
        );
    }

    async compactSession(input: {
        profileId: string;
        sessionId: string;
        providerId: ResolvedContextPolicy['providerId'];
        modelId: string;
        source: 'auto' | 'manual';
    }): Promise<OperationalResult<CompactSessionResult>> {
        const [replayMessages, existingCompaction] = await Promise.all([
            this.loadReplayMessages(input.profileId, input.sessionId),
            sessionContextCompactionStore.get(input.profileId, input.sessionId),
        ]);
        const policy = await contextPolicyService.resolvePolicy({
            ...input,
            hasMultimodalContent: replayMessages.some((message) => message.parts.some((part) => part.type === 'image')),
        });

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

        if (policy.disabledReason === 'multimodal_counting_unavailable') {
            return okOp({
                compacted: false,
                reason: 'multimodal_counting_unavailable',
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
                parts: message.parts,
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
        const replayMessages = await this.loadReplayMessages(input.profileId, input.sessionId);
        const policy = await contextPolicyService.resolvePolicy({
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            hasMultimodalContent:
                replayMessages.some((message) => message.parts.some((part) => part.type === 'image')) ||
                Boolean(input.attachments && input.attachments.length > 0),
        });
        const retrievedMemory = await memoryRetrievalService.retrieveRelevantMemory({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            prompt: input.prompt,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.runId ? { runId: input.runId } : {}),
        });
        const combinedSystemMessages = [...input.systemMessages, ...retrievedMemory.messages];
        let compaction = await sessionContextCompactionStore.get(input.profileId, input.sessionId);

        let prepared = await this.estimateMessages({
            profileId: input.profileId,
            policy,
            systemMessages: combinedSystemMessages,
            replayMessages,
            prompt: input.prompt,
            ...(input.attachments ? { attachments: input.attachments } : {}),
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
                    systemMessages: combinedSystemMessages,
                    replayMessages,
                    prompt: input.prompt,
                    ...(input.attachments ? { attachments: input.attachments } : {}),
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
            ...(retrievedMemory.summary ? { retrievedMemory: retrievedMemory.summary } : {}),
        });
    }
}

export const sessionContextService = new SessionContextService();
