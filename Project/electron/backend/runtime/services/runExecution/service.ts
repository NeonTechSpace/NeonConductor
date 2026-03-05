import {
    kiloRoutingPreferenceStore,
    messageStore,
    providerStore,
    runStore,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import type { ProviderRuntimeInput, ProviderRuntimeTransportSelection } from '@/app/backend/providers/types';
import type { EntityId, ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { resolveRunCache } from '@/app/backend/runtime/services/runExecution/cacheKey';
import { validateRunCapabilities } from '@/app/backend/runtime/services/runExecution/capabilities';
import { buildChatReplayContext } from '@/app/backend/runtime/services/runExecution/chatContext';
import type { RunExecutionError } from '@/app/backend/runtime/services/runExecution/errors';
import {
    emitCacheResolutionEvent,
    emitTransportSelectionEvent,
} from '@/app/backend/runtime/services/runExecution/eventing';
import { executeRun, isAbortError } from '@/app/backend/runtime/services/runExecution/executeRun';
import { resolveModeExecution } from '@/app/backend/runtime/services/runExecution/mode';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import { resolveFirstRunnableRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunnableTarget';
import { resolveRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunTarget';
import { resolveInitialRunTransport } from '@/app/backend/runtime/services/runExecution/transport';
import type {
    ChatContextMessage,
    ResolvedRunAuth,
    RunCacheResolution,
    StartRunInput,
    StartRunResult,
} from '@/app/backend/runtime/services/runExecution/types';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { appLog } from '@/app/main/logging';

interface ActiveRun {
    profileId: string;
    sessionId: string;
    runId: string;
    controller: AbortController;
    completion: Promise<void>;
}

function createSessionKey(profileId: string, sessionId: string): string {
    return `${profileId}:${sessionId}`;
}

function toRunExecutionError(error: RunExecutionError): Error {
    const exception = new Error(error.message);
    (exception as { code?: string }).code = error.code;
    return exception;
}

export class RunExecutionService {
    private readonly activeRuns = new Map<string, ActiveRun>();
    private readonly activeRunsBySession = new Map<string, string>();

    async startRun(input: StartRunInput): Promise<StartRunResult> {
        const runnable = await sessionStore.ensureRunnableSession(input.profileId, input.sessionId);
        if (!runnable.ok) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start because session is not runnable.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                reason: runnable.reason,
            });
            return {
                accepted: false,
                reason: runnable.reason,
            };
        }
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (!sessionThread) {
            return {
                accepted: false,
                reason: 'not_found',
            };
        }
        if (sessionThread.thread.topLevelTab !== input.topLevelTab) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start because session thread mode does not match selected tab.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                expectedTopLevelTab: sessionThread.thread.topLevelTab,
                requestedTopLevelTab: input.topLevelTab,
            });
            throw toRunExecutionError({
                code: 'invalid_mode',
                message: `Thread mode "${sessionThread.thread.topLevelTab}" does not match tab "${input.topLevelTab}".`,
            });
        }

        const resolvedModeResult = await resolveModeExecution({
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
        });
        if (resolvedModeResult.isErr()) {
            throw toRunExecutionError(resolvedModeResult.error);
        }
        const resolvedMode = resolvedModeResult.value;

        const resolvedTargetResult = await resolveRunTarget({
            profileId: input.profileId,
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.modelId ? { modelId: input.modelId } : {}),
        });
        if (resolvedTargetResult.isErr()) {
            throw toRunExecutionError(resolvedTargetResult.error);
        }
        const resolvedTarget = resolvedTargetResult.value;
        const explicitTargetRequested = input.providerId !== undefined || input.modelId !== undefined;
        let activeTarget = resolvedTarget;
        let resolvedAuth: ResolvedRunAuth;
        const resolvedAuthResult = await resolveRunAuth({
            profileId: input.profileId,
            providerId: activeTarget.providerId,
        });
        if (resolvedAuthResult.isErr()) {
            if (explicitTargetRequested) {
                appLog.warn({
                    tag: 'run-execution',
                    message: 'Explicit provider/model target is not runnable with current auth state.',
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    providerId: activeTarget.providerId,
                    modelId: activeTarget.modelId,
                    error: resolvedAuthResult.error.message,
                });
                throw toRunExecutionError(resolvedAuthResult.error);
            }

            const fallback = await resolveFirstRunnableRunTarget(input.profileId, {
                providerId: activeTarget.providerId,
                modelId: activeTarget.modelId,
            });
            if (!fallback) {
                appLog.warn({
                    tag: 'run-execution',
                    message: 'No runnable provider/model fallback found for session run.',
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    providerId: activeTarget.providerId,
                    modelId: activeTarget.modelId,
                    error: resolvedAuthResult.error.message,
                });
                throw toRunExecutionError(resolvedAuthResult.error);
            }

            appLog.info({
                tag: 'run-execution',
                message: 'Using provider/model fallback for session run.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                requestedProviderId: activeTarget.providerId,
                requestedModelId: activeTarget.modelId,
                fallbackProviderId: fallback.target.providerId,
                fallbackModelId: fallback.target.modelId,
            });

            activeTarget = fallback.target;
            resolvedAuth = fallback.auth;
        } else {
            resolvedAuth = resolvedAuthResult.value;
        }
        const modelCapabilities = await providerStore.getModelCapabilities(
            input.profileId,
            activeTarget.providerId,
            activeTarget.modelId
        );
        if (!modelCapabilities) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Model capabilities missing for run target.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                providerId: activeTarget.providerId,
                modelId: activeTarget.modelId,
            });
            throw toRunExecutionError({
                code: 'provider_model_missing',
                message: `Model "${activeTarget.modelId}" is missing runtime capabilities.`,
            });
        }

        const capabilityValidation = validateRunCapabilities({
            providerId: activeTarget.providerId,
            modelId: activeTarget.modelId,
            modelCapabilities,
            runtimeOptions: input.runtimeOptions,
        });
        if (capabilityValidation.isErr()) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start because runtime options are invalid for the selected model.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                providerId: activeTarget.providerId,
                modelId: activeTarget.modelId,
                error: capabilityValidation.error.message,
            });
            throw toRunExecutionError(capabilityValidation.error);
        }

        const initialTransport = resolveInitialRunTransport({
            providerId: activeTarget.providerId,
            runtimeOptions: input.runtimeOptions,
        });
        const chatContext =
            input.topLevelTab === 'chat'
                ? await buildChatReplayContext({
                      profileId: input.profileId,
                      sessionId: input.sessionId,
                      prompt: input.prompt,
                  })
                : undefined;
        const resolvedCacheResult = resolveRunCache({
            profileId: input.profileId,
            sessionId: input.sessionId,
            ...(chatContext ? { cacheScopeKey: chatContext.digest } : {}),
            providerId: activeTarget.providerId,
            modelId: activeTarget.modelId,
            runtimeOptions: input.runtimeOptions,
        });
        if (resolvedCacheResult.isErr()) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Failed to resolve cache settings for run start.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                providerId: activeTarget.providerId,
                modelId: activeTarget.modelId,
                error: resolvedCacheResult.error.message,
            });
            throw toRunExecutionError(resolvedCacheResult.error);
        }
        const resolvedCache = resolvedCacheResult.value;
        const kiloRoutingPreference =
            activeTarget.providerId === 'kilo'
                ? await kiloRoutingPreferenceStore.getPreference(input.profileId, activeTarget.modelId)
                : null;
        const kiloRouting: ProviderRuntimeInput['kiloRouting'] =
            activeTarget.providerId !== 'kilo'
                ? undefined
                : kiloRoutingPreference
                  ? kiloRoutingPreference.routingMode === 'dynamic'
                      ? {
                            mode: 'dynamic' as const,
                            sort: kiloRoutingPreference.sort ?? 'default',
                        }
                      : kiloRoutingPreference.pinnedProviderId
                        ? {
                              mode: 'pinned' as const,
                              providerId: kiloRoutingPreference.pinnedProviderId,
                          }
                        : {
                              mode: 'dynamic' as const,
                              sort: 'default',
                          }
                  : {
                        mode: 'dynamic' as const,
                        sort: 'default',
                    };

        const run = await runStore.create({
            profileId: input.profileId,
            sessionId: input.sessionId,
            prompt: input.prompt,
            providerId: activeTarget.providerId,
            modelId: activeTarget.modelId,
            authMethod: resolvedAuth.authMethod,
            runtimeOptions: input.runtimeOptions,
            cache: resolvedCache,
            transport: {
                selected: initialTransport.selected,
                ...(initialTransport.degraded
                    ? {
                          degradedReason: initialTransport.degradedReason,
                      }
                    : {}),
            },
        });

        await sessionStore.markRunPending(input.profileId, input.sessionId, run.id);

        const userMessage = await messageStore.createMessage({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: run.id,
            role: 'user',
        });
        await messageStore.appendPart({
            messageId: userMessage.id,
            partType: 'text',
            payload: {
                text: input.prompt,
            },
        });

        const assistantMessage = await messageStore.createMessage({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: run.id,
            role: 'assistant',
        });

        await runtimeEventLogService.append({
            entityType: 'run',
            entityId: run.id,
            eventType: 'run.mode.context',
            payload: {
                runId: run.id,
                sessionId: input.sessionId,
                profileId: input.profileId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                workspaceFingerprint: input.workspaceFingerprint ?? null,
                mode: {
                    id: resolvedMode.mode.id,
                    label: resolvedMode.mode.label,
                    executionPolicy: resolvedMode.mode.executionPolicy,
                },
            },
        });

        await runtimeEventLogService.append({
            entityType: 'run',
            entityId: run.id,
            eventType: 'run.started',
            payload: {
                run,
                sessionId: input.sessionId,
                profileId: input.profileId,
            },
        });

        await emitCacheResolutionEvent({
            runId: run.id,
            profileId: input.profileId,
            sessionId: input.sessionId,
            cache: resolvedCache,
        });
        await emitTransportSelectionEvent({
            runId: run.id,
            profileId: input.profileId,
            sessionId: input.sessionId,
            selection: {
                selected: initialTransport.selected,
                requested: initialTransport.requested,
                degraded: initialTransport.degraded,
                ...(initialTransport.degradedReason ? { degradedReason: initialTransport.degradedReason } : {}),
            },
        });

        const controller = new AbortController();
        const completion = this.runToTerminalState({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: run.id,
            prompt: input.prompt,
            providerId: activeTarget.providerId,
            modelId: activeTarget.modelId,
            authMethod: resolvedAuth.authMethod,
            runtimeOptions: input.runtimeOptions,
            cache: resolvedCache,
            transportSelection: {
                selected: initialTransport.selected,
                requested: initialTransport.requested,
                degraded: initialTransport.degraded,
                ...(initialTransport.degradedReason ? { degradedReason: initialTransport.degradedReason } : {}),
            },
            ...(resolvedAuth.apiKey ? { apiKey: resolvedAuth.apiKey } : {}),
            ...(resolvedAuth.accessToken ? { accessToken: resolvedAuth.accessToken } : {}),
            ...(resolvedAuth.organizationId ? { organizationId: resolvedAuth.organizationId } : {}),
            ...(kiloRouting ? { kiloRouting } : {}),
            ...(chatContext ? { contextMessages: chatContext.messages } : {}),
            assistantMessageId: assistantMessage.id,
            signal: controller.signal,
        }).finally(() => {
            this.activeRuns.delete(run.id);
            this.activeRunsBySession.delete(createSessionKey(input.profileId, input.sessionId));
        });

        this.activeRuns.set(run.id, {
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: run.id,
            controller,
            completion,
        });
        this.activeRunsBySession.set(createSessionKey(input.profileId, input.sessionId), run.id);

        appLog.info({
            tag: 'run-execution',
            message: 'Started session run.',
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: run.id,
            providerId: activeTarget.providerId,
            modelId: activeTarget.modelId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
        });

        return {
            accepted: true,
            runId: run.id,
            runStatus: 'running',
        };
    }

    async abortRun(
        profileId: string,
        sessionId: EntityId<'sess'>
    ): Promise<{ aborted: false; reason: 'not_found' | 'not_running' } | { aborted: true; runId: string }> {
        const session = await sessionStore.status(profileId, sessionId);
        if (!session.found) {
            return { aborted: false, reason: 'not_found' };
        }

        if (!session.activeRunId) {
            return { aborted: false, reason: 'not_running' };
        }

        const runId = session.activeRunId;
        const activeRun = this.activeRuns.get(runId);
        if (activeRun) {
            activeRun.controller.abort();
            await activeRun.completion;
            appLog.info({
                tag: 'run-execution',
                message: 'Aborted active session run.',
                profileId,
                sessionId,
                runId,
            });
            return {
                aborted: true,
                runId,
            };
        }

        await runStore.finalize(runId, {
            status: 'aborted',
        });
        await sessionStore.markRunTerminal(profileId, sessionId, 'aborted');
        await runtimeEventLogService.append({
            entityType: 'run',
            entityId: runId,
            eventType: 'run.aborted',
            payload: {
                runId,
                sessionId,
                profileId,
            },
        });

        appLog.info({
            tag: 'run-execution',
            message: 'Aborted persisted run without active in-memory controller.',
            profileId,
            sessionId,
            runId,
        });

        return {
            aborted: true,
            runId,
        };
    }

    private async runToTerminalState(input: {
        profileId: string;
        sessionId: string;
        runId: string;
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
        kiloRouting?:
            | {
                  mode: 'dynamic';
                  sort: 'default' | 'price' | 'throughput' | 'latency';
              }
            | {
                  mode: 'pinned';
                  providerId: string;
              };
        contextMessages?: ChatContextMessage[];
        assistantMessageId: string;
        signal: AbortSignal;
    }): Promise<void> {
        try {
            await executeRun(input);
        } catch (error) {
            if (isAbortError(error) || input.signal.aborted) {
                await runStore.finalize(input.runId, {
                    status: 'aborted',
                });
                await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'aborted');
                await runtimeEventLogService.append({
                    entityType: 'run',
                    entityId: input.runId,
                    eventType: 'run.aborted',
                    payload: {
                        runId: input.runId,
                        sessionId: input.sessionId,
                        profileId: input.profileId,
                    },
                });
                appLog.info({
                    tag: 'run-execution',
                    message: 'Run moved to aborted terminal state.',
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    runId: input.runId,
                });
                return;
            }

            const message = error instanceof Error ? error.message : String(error);
            await runStore.finalize(input.runId, {
                status: 'error',
                errorCode: 'provider_transport_error',
                errorMessage: message,
            });
            await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'error');
            await runtimeEventLogService.append({
                entityType: 'run',
                entityId: input.runId,
                eventType: 'run.failed',
                payload: {
                    runId: input.runId,
                    sessionId: input.sessionId,
                    profileId: input.profileId,
                    errorCode: 'provider_transport_error',
                    errorMessage: message,
                },
            });
            appLog.warn({
                tag: 'run-execution',
                message: 'Run moved to failed terminal state.',
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                errorCode: 'provider_transport_error',
                errorMessage: message,
            });
        }
    }
}

export const runExecutionService = new RunExecutionService();
