import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';
import type {
    CompactSessionResult,
    ComposerAttachmentInput,
    ComposerDocumentAttachmentInput,
    PreparedContextSummary,
    ResolvedContextPolicy,
    ResolvedContextState,
    RunContractDocumentSummary,
    RetrievedMemorySummary,
    TokenCountEstimate,
} from '@/app/backend/runtime/contracts';
import type { EntityId } from '@/app/backend/runtime/contracts';
import {
    type PreparedContextModeOverrides,
    type PreparedContextProfileDefaults,
    type SkillfileDefinition,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { compactLoadedSessionContext } from '@/app/backend/runtime/services/context/contextCompactionLifecycle';
import { contextCompactionPreparationCoordinator } from '@/app/backend/runtime/services/context/contextCompactionPreparationCoordinator';
import {
    resolveExecutionTargetContextPreview,
} from '@/app/backend/runtime/services/context/executionTargetContextPreviewService';
import { contextPolicyService } from '@/app/backend/runtime/services/context/policyService';
import {
    buildEffectivePromptPreview,
    buildPreparedContextDigestSummary,
    resolvePreparedContextLedger,
    type PreparedContextContributorSpec,
} from '@/app/backend/runtime/services/context/preparedContextLedger';
import {
    buildPreparedContextDigest,
    buildPreparedContextMessages,
} from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';
import { buildResolvedContextState } from '@/app/backend/runtime/services/context/resolvedContextStateBuilder';
import { loadRetrievedMemoryInjection } from '@/app/backend/runtime/services/context/retrievedMemoryInjection';
import { assessContextBudget, estimatePreparedContextMessages } from '@/app/backend/runtime/services/context/sessionContextBudgetEvaluator';
import { applyPersistedCompaction, loadSessionReplaySnapshot } from '@/app/backend/runtime/services/context/sessionReplayLoader';
import { documentArtifactService } from '@/app/backend/runtime/services/documentArtifacts/service';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';
import {
    appendDynamicContributors,
    resolveDynamicSkillContextContributors,
} from '@/app/backend/runtime/services/sessionSkills/dynamicContextResolver';

import type { ResolvedWorkspaceContext } from '@/shared/contracts';

export interface PreparedSessionContext {
    messages: RunContextMessage[];
    digest: string;
    preparedContext: PreparedContextSummary;
    documentContexts?: RunContractDocumentSummary[];
    estimate?: TokenCountEstimate;
    policy: ResolvedContextPolicy;
    compaction?: SessionContextCompactionRecord;
    retrievedMemory?: RetrievedMemorySummary;
}

type ContextPreparationSideEffectMode = 'execution' | 'preview';

function createEmptyPreparedContextSummary(input: {
    fullDigest: string;
    compactionReseedActive: boolean;
}): PreparedContextSummary {
    const digestSummary = buildPreparedContextDigestSummary({
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
    });
    return {
        contributors: [],
        digest: digestSummary,
        effectivePromptPreview: buildEffectivePromptPreview({ contributors: [], digest: digestSummary.contributorDigest }),
        activeContributorCount: 0,
        compactionReseedActive: input.compactionReseedActive,
    };
}

function buildRetrievedMemoryContributorSpecs(messages: RunContextMessage[]): PreparedContextContributorSpec[] {
    return messages.map((message, index) => ({
        id: `retrieved_memory:${String(index)}`,
        kind: 'retrieved_memory',
        group: 'retrieved_memory',
        label: 'Retrieved memory',
        source: {
            kind: 'memory',
            key: `retrieved_memory:${String(index)}`,
            label: 'Retrieved memory',
        },
        messages: [message],
        fixedCheckpoint: 'bootstrap',
        inclusionReason: 'Included by memory retrieval for the active prompt.',
    }));
}

function buildCompactionContributorSpec(
    summaryMessage: RunContextMessage | undefined
): PreparedContextContributorSpec[] {
    if (!summaryMessage) {
        return [];
    }

    return [
        {
            id: 'compaction_summary',
            kind: 'compaction_summary',
            group: 'compaction',
            label: 'Compacted conversation summary',
            source: {
                kind: 'compaction',
                key: 'session_compaction_summary',
                label: 'Compacted conversation summary',
            },
            messages: [summaryMessage],
            fixedCheckpoint: 'post_compaction_reseed',
            inclusionReason: 'Included because session compaction replay is active.',
        },
    ];
}

function hasImageAttachments(attachments: ComposerAttachmentInput[] | undefined): boolean {
    return (attachments ?? []).some((attachment) => attachment.kind === undefined || attachment.kind === 'image_attachment');
}

function getDocumentAttachments(
    attachments: ComposerAttachmentInput[] | undefined
): ComposerDocumentAttachmentInput[] {
    return (attachments ?? []).filter(
        (attachment): attachment is ComposerDocumentAttachmentInput => attachment.kind === 'document_attachment'
    );
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
            return buildResolvedContextState({
                policy,
                preparedContext: createEmptyPreparedContextSummary({
                    fullDigest: 'runctx-empty',
                    compactionReseedActive: false,
                }),
            });
        }

        const replaySnapshot = await loadSessionReplaySnapshot({
            profileId: input.profileId,
            sessionId: input.sessionId,
        });
        const persistedReplay = applyPersistedCompaction(replaySnapshot.replayMessages, replaySnapshot.compaction);
        const preparedContextDigest = buildPreparedContextDigest(
            buildPreparedContextMessages({
                bootstrapMessages: input.systemMessages ?? [],
                replayMessages: persistedReplay.replayMessages,
                prompt: '',
                ...(persistedReplay.summaryMessage ? { summaryMessage: persistedReplay.summaryMessage } : {}),
            })
        );
        const prepared = buildPreparedContextMessages({
            bootstrapMessages: input.systemMessages ?? [],
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
            preparedContext: createEmptyPreparedContextSummary({
                fullDigest: preparedContextDigest,
                compactionReseedActive: Boolean(replaySnapshot.compaction),
            }),
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
        systemContributorSpecs: PreparedContextContributorSpec[];
        attachedSkillfiles: SkillfileDefinition[];
        preparedContextProfileDefaults: PreparedContextProfileDefaults;
        modePromptLayerOverrides: PreparedContextModeOverrides;
        prompt: string;
        attachments?: ComposerAttachmentInput[];
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
        workspaceContext?: ResolvedWorkspaceContext;
        runId?: EntityId<'run'>;
        sideEffectMode?: ContextPreparationSideEffectMode;
    }): Promise<OperationalResult<PreparedSessionContext>> {
        const replaySnapshot = await loadSessionReplaySnapshot({
            profileId: input.profileId,
            sessionId: input.sessionId,
        });
        const policy = await contextPolicyService.resolvePolicy({
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            hasMultimodalContent: replaySnapshot.hasMultimodalContent || hasImageAttachments(input.attachments),
        });
        const documentContextResult = await documentArtifactService.resolveRunContexts({
            profileId: input.profileId,
            sessionId: input.sessionId,
            ...(policy.thresholdTokens ? { thresholdTokens: policy.thresholdTokens } : {}),
            attachments: getDocumentAttachments(input.attachments),
        });
        if (documentContextResult.isErr()) {
            return errOp('invalid_payload', documentContextResult.error.message, {
                details: {
                    code: documentContextResult.error.code,
                    ...(documentContextResult.error.documentArtifactId
                        ? { documentArtifactId: documentContextResult.error.documentArtifactId }
                        : {}),
                },
            });
        }
        const documentContexts = documentContextResult.value;
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
        const dynamicSkillContextResult = await resolveDynamicSkillContextContributors({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            skillfiles: input.attachedSkillfiles,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
            sideEffectMode: input.sideEffectMode ?? 'execution',
        });
        if (dynamicSkillContextResult.isErr()) {
            return errOp(dynamicSkillContextResult.error.code, dynamicSkillContextResult.error.message, {
                ...(dynamicSkillContextResult.error.details
                    ? { details: dynamicSkillContextResult.error.details }
                    : {}),
                ...(dynamicSkillContextResult.error.retryable !== undefined
                    ? { retryable: dynamicSkillContextResult.error.retryable }
                    : {}),
            });
        }

        const baseContributorSpecs = appendDynamicContributors({
            baseContributorSpecs: [
                ...input.systemContributorSpecs,
                ...buildRetrievedMemoryContributorSpecs(retrievedMemoryResult.messages),
            ],
            dynamicContributors: dynamicSkillContextResult.value.contributors,
        });
        const ledger = await resolvePreparedContextLedger({
            modelId: input.modelId,
            contributorSpecs: [
                ...baseContributorSpecs,
                ...buildCompactionContributorSpec(persistedReplay.summaryMessage),
            ],
            profileDefaults: input.preparedContextProfileDefaults,
            modeOverrides: input.modePromptLayerOverrides,
            compactionReseedActive: Boolean(persistedReplay.summaryMessage),
        });
        const preparedMessages = buildPreparedContextMessages({
            bootstrapMessages: ledger.bootstrapMessages,
            postCompactionReseedMessages: ledger.postCompactionReseedMessages,
            replayMessages: persistedReplay.replayMessages,
            prompt: input.prompt,
            ...(input.attachments ? { attachments: input.attachments } : {}),
            ...(documentContexts.length > 0 ? { documentContexts } : {}),
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
            (input.sideEffectMode ?? 'execution') === 'execution' &&
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
                const compactedLedger = await resolvePreparedContextLedger({
                    modelId: input.modelId,
                    contributorSpecs: [
                        ...baseContributorSpecs,
                        ...buildCompactionContributorSpec(compactedReplay.summaryMessage),
                    ],
                    profileDefaults: input.preparedContextProfileDefaults,
                    modeOverrides: input.modePromptLayerOverrides,
                    compactionReseedActive: Boolean(compactedReplay.summaryMessage),
                });
                finalMessages = buildPreparedContextMessages({
                    bootstrapMessages: compactedLedger.bootstrapMessages,
                    postCompactionReseedMessages: compactedLedger.postCompactionReseedMessages,
                    replayMessages: compactedReplay.replayMessages,
                    prompt: input.prompt,
                    ...(input.attachments ? { attachments: input.attachments } : {}),
                    ...(documentContexts.length > 0 ? { documentContexts } : {}),
                    ...(compactedReplay.summaryMessage ? { summaryMessage: compactedReplay.summaryMessage } : {}),
                });
                preparedEstimate = await estimatePreparedContextMessages({
                    profileId: input.profileId,
                    policy,
                    messages: finalMessages,
                });
            }
        }

        const finalLedger = await resolvePreparedContextLedger({
            modelId: input.modelId,
            contributorSpecs: [
                ...baseContributorSpecs,
                ...buildCompactionContributorSpec(
                    compaction
                        ? {
                              role: 'system',
                              parts: [{ type: 'text', text: `Compacted conversation summary\n\n${compaction.summaryText}` }],
                          }
                        : undefined
                ),
            ],
            profileDefaults: input.preparedContextProfileDefaults,
            modeOverrides: input.modePromptLayerOverrides,
            compactionReseedActive: Boolean(compaction),
        });
        const digest = buildPreparedContextDigest(finalMessages);
        const digestSummary = buildPreparedContextDigestSummary({
            fullDigest: digest,
            contributorDigest: finalLedger.contributorDigest,
            checkpointSummaries: finalLedger.checkpointSummaries,
            compactionReseedActive: finalLedger.compactionReseedActive,
        });
        const preparedContext = {
            contributors: finalLedger.contributors,
            digest: digestSummary,
            effectivePromptPreview: buildEffectivePromptPreview({
                contributors: finalLedger.contributors,
                digest: digestSummary.contributorDigest,
            }),
            activeContributorCount: finalLedger.contributors.filter((contributor) => contributor.inclusionState === 'included').length,
            compactionReseedActive: finalLedger.compactionReseedActive,
        } satisfies PreparedContextSummary;

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
            digest,
            preparedContext,
            ...(documentContexts.length > 0
                ? { documentContexts: documentContexts.map((documentContext) => documentContext.summary) }
                : {}),
            ...(preparedEstimate.estimate ? { estimate: preparedEstimate.estimate } : {}),
            policy,
            ...(compaction ? { compaction } : {}),
            ...(retrievedMemoryResult.summary ? { retrievedMemory: retrievedMemoryResult.summary } : {}),
        });
    }
}

export const sessionContextService = new SessionContextService();
