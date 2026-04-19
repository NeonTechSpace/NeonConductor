import type {
    ProviderRuntimeDescriptor,
    ProviderRuntimeToolDefinition,
    ProviderRuntimeTransportSelection,
} from '@/app/backend/providers/types';
import { captureCheckpointDiffForRun, ensureCheckpointForRun } from '@/app/backend/runtime/services/checkpoint/service';
import { executeRun, isAbortError } from '@/app/backend/runtime/services/runExecution/executeRun';
import {
    applyRunTerminalOutcome,
    moveRunToAbortedState,
    moveRunToFailedState,
} from '@/app/backend/runtime/services/runExecution/terminalState';
import type {
    ResolvedKiloRouting,
    RunCacheResolution,
    RunContextMessage,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';
import { runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

import type { OpenAIExecutionMode, ResolvedWorkspaceContext, RunContractPreview } from '@/shared/contracts';
import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/shared/contracts';
import type { KiloModeHeader } from '@/shared/kiloModels';

export async function runToTerminalState(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    threadId: EntityId<'thr'>;
    runId: EntityId<'run'>;
    topLevelTab: StartRunInput['topLevelTab'];
    modeKey: StartRunInput['modeKey'];
    prompt: string;
    providerId: RuntimeProviderId;
    modelId: string;
    runtime: ProviderRuntimeDescriptor;
    openAIExecutionMode?: OpenAIExecutionMode;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: StartRunInput['runtimeOptions'];
    cache: RunCacheResolution;
    transportSelection: ProviderRuntimeTransportSelection;
    toolDefinitions: ProviderRuntimeToolDefinition[];
    apiKey?: string;
    accessToken?: string;
    organizationId?: string;
    kiloModeHeader?: KiloModeHeader;
    kiloRouting?: ResolvedKiloRouting;
    contextMessages?: RunContextMessage[];
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    workspaceContext: ResolvedWorkspaceContext;
    assistantMessageId: EntityId<'msg'>;
    runContractPreview?: RunContractPreview;
    sourceOutboxEntryId?: EntityId<'outbox'>;
    signal: AbortSignal;
}): Promise<void> {
    try {
        const checkpoint = await ensureCheckpointForRun({
            profileId: input.profileId,
            runId: input.runId,
            sessionId: input.sessionId,
            threadId: input.threadId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            workspaceContext: input.workspaceContext,
        });
        if (checkpoint.isErr()) {
            await moveRunToFailedState({
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                errorCode: checkpoint.error.code,
                errorMessage: checkpoint.error.message,
                logMessage: 'Run moved to failed terminal state.',
                ...(input.runContractPreview ? { contract: input.runContractPreview } : {}),
                ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
            });
            return;
        }

        if (checkpoint.value) {
            await runtimeEventLogService.append(
                runtimeUpsertEvent({
                    entityType: 'checkpoint',
                    domain: 'checkpoint',
                    entityId: checkpoint.value.id,
                    eventType: 'checkpoint.created',
                    payload: {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        runId: input.runId,
                        checkpoint: checkpoint.value,
                        diff: null,
                    },
                })
            );
        }

        const executionResult = await executeRun({
            ...input,
            onBeforeFinalize: async () => {
                try {
                    const artifactResult = await captureCheckpointDiffForRun({
                        profileId: input.profileId,
                        runId: input.runId,
                        sessionId: input.sessionId,
                        topLevelTab: input.topLevelTab,
                        modeKey: input.modeKey,
                        workspaceContext: input.workspaceContext,
                    });
                    if (!artifactResult) {
                        return;
                    }

                    if (artifactResult.diff) {
                        await runtimeEventLogService.append(
                            runtimeUpsertEvent({
                                entityType: 'diff',
                                domain: 'diff',
                                entityId: artifactResult.diff.id,
                                eventType: 'diff.captured',
                                payload: {
                                    profileId: input.profileId,
                                    sessionId: input.sessionId,
                                    runId: input.runId,
                                    diff: artifactResult.diff,
                                },
                            })
                        );
                    }

                    if (artifactResult.checkpoint) {
                        await runtimeEventLogService.append(
                            runtimeUpsertEvent({
                                entityType: 'checkpoint',
                                domain: 'checkpoint',
                                entityId: artifactResult.checkpoint.id,
                                eventType: 'checkpoint.created',
                                payload: {
                                    profileId: input.profileId,
                                    sessionId: input.sessionId,
                                    runId: input.runId,
                                    checkpoint: artifactResult.checkpoint,
                                    diff: artifactResult.diff ?? null,
                                },
                            })
                        );
                    }
                } catch {
                    return;
                }
            },
        });
        if (executionResult.isErr()) {
            if (input.signal.aborted) {
                await moveRunToAbortedState({
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    runId: input.runId,
                    logMessage: 'Run moved to aborted terminal state.',
                    ...(input.runContractPreview ? { contract: input.runContractPreview } : {}),
                    ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
                });
                return;
            }
            await moveRunToFailedState({
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                errorCode: executionResult.error.code,
                errorMessage: executionResult.error.message,
                logMessage: 'Run moved to failed terminal state.',
                ...(input.runContractPreview ? { contract: input.runContractPreview } : {}),
                ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
            });
            return;
        }

        await applyRunTerminalOutcome({
            profileId: input.profileId,
            sessionId: input.sessionId,
            threadId: input.threadId,
            runId: input.runId,
            prompt: input.prompt,
            providerId: input.providerId,
            modelId: input.modelId,
            authMethod: input.authMethod,
            outcome: executionResult.value,
            logMessage: 'Run moved to completed terminal state.',
            ...(input.runContractPreview ? { contract: input.runContractPreview } : {}),
            ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
        });
    } catch (error) {
        if (isAbortError(error) || input.signal.aborted) {
            await moveRunToAbortedState({
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                logMessage: 'Run moved to aborted terminal state.',
                ...(input.runContractPreview ? { contract: input.runContractPreview } : {}),
                ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
            });
            return;
        }

        const message = error instanceof Error ? error.message : String(error);
        await moveRunToFailedState({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            errorCode: 'invariant_violation',
            errorMessage: message,
            logMessage: 'Run moved to failed terminal state.',
            ...(input.runContractPreview ? { contract: input.runContractPreview } : {}),
            ...(input.sourceOutboxEntryId ? { sourceOutboxEntryId: input.sourceOutboxEntryId } : {}),
        });
    }
}

