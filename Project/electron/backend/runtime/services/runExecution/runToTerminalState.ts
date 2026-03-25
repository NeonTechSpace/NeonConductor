import type {
    ProviderRuntimeDescriptor,
    ProviderRuntimeToolDefinition,
    ProviderRuntimeTransportSelection,
} from '@/app/backend/providers/types';
import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import type { OpenAIExecutionMode } from '@/app/backend/runtime/contracts';
import { captureCheckpointDiffForRun, ensureCheckpointForRun } from '@/app/backend/runtime/services/checkpoint/service';
import { executeRun, isAbortError } from '@/app/backend/runtime/services/runExecution/executeRun';
import { moveRunToAbortedState, moveRunToFailedState } from '@/app/backend/runtime/services/runExecution/terminalState';
import type { ResolvedKiloRouting, RunCacheResolution, RunContextMessage, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';
import { runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import type { ResolvedWorkspaceContext } from '@/app/backend/runtime/contracts';

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
    kiloRouting?: ResolvedKiloRouting;
    contextMessages?: RunContextMessage[];
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    workspaceContext: ResolvedWorkspaceContext;
    assistantMessageId: EntityId<'msg'>;
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
            });
            return;
        }
    } catch (error) {
        if (isAbortError(error) || input.signal.aborted) {
            await moveRunToAbortedState({
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                logMessage: 'Run moved to aborted terminal state.',
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
        });
    }
}
