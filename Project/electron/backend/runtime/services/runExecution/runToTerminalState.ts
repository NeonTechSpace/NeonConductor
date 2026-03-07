import type { ProviderRuntimeTransportSelection } from '@/app/backend/providers/types';
import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { ensureCheckpointForRun } from '@/app/backend/runtime/services/checkpoint/service';
import { executeRun, isAbortError } from '@/app/backend/runtime/services/runExecution/executeRun';
import { moveRunToAbortedState, moveRunToFailedState } from '@/app/backend/runtime/services/runExecution/terminalState';
import type { ResolvedKiloRouting, RunCacheResolution, RunContextMessage, StartRunInput } from '@/app/backend/runtime/services/runExecution/types';
import { runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';

export async function runToTerminalState(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    topLevelTab: StartRunInput['topLevelTab'];
    modeKey: StartRunInput['modeKey'];
    prompt: string;
    providerId: RuntimeProviderId;
    modelId: string;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: StartRunInput['runtimeOptions'];
    cache: RunCacheResolution;
    transportSelection: ProviderRuntimeTransportSelection;
    apiKey?: string;
    accessToken?: string;
    organizationId?: string;
    kiloRouting?: ResolvedKiloRouting;
    contextMessages?: RunContextMessage[];
    workspaceFingerprint?: string;
    worktreeId?: EntityId<'wt'>;
    assistantMessageId: string;
    signal: AbortSignal;
}): Promise<void> {
    try {
        const executionResult = await executeRun({
            ...input,
            onBeforeFinalize: async () => {
                const artifactResult = await ensureCheckpointForRun({
                    profileId: input.profileId,
                    runId: input.runId,
                    sessionId: input.sessionId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                    ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                    ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
                });
                if (!artifactResult) {
                    return;
                }

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
                            },
                        })
                    );
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
