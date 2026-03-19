import { messageStore, runStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeTransportSelection } from '@/app/backend/providers/types';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { isEntityId } from '@/app/backend/runtime/contracts';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { withCorrelationContext } from '@/app/backend/runtime/services/common/logContext';
import { sessionContextService } from '@/app/backend/runtime/services/context/sessionContextService';
import type { RunExecutionError } from '@/app/backend/runtime/services/runExecution/errors';
import { persistRunStart } from '@/app/backend/runtime/services/runExecution/persistRunStart';
import { prepareRunStart } from '@/app/backend/runtime/services/runExecution/prepareRunStart';
import { toRejectedStartResult } from '@/app/backend/runtime/services/runExecution/rejection';
import { runToTerminalState } from '@/app/backend/runtime/services/runExecution/runToTerminalState';
import { moveRunToAbortedState } from '@/app/backend/runtime/services/runExecution/terminalState';
import type { StartRunInput, StartRunResult } from '@/app/backend/runtime/services/runExecution/types';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import { appLog } from '@/app/main/logging';
import type { ProviderRuntimeTransportFamily } from '@/app/backend/providers/types';

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

function toTransportSelection(input: {
    selected: ProviderRuntimeTransportFamily;
    requested: StartRunInput['runtimeOptions']['transport']['family'];
    degraded: boolean;
    degradedReason?: string;
}): ProviderRuntimeTransportSelection {
    return {
        selected: input.selected,
        requested: input.requested,
        degraded: input.degraded,
        ...(input.degradedReason ? { degradedReason: input.degradedReason } : {}),
    };
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
                ...withCorrelationContext(
                    { requestId: input.requestId, correlationId: input.correlationId },
                    {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        reason: runnable.reason,
                    }
                ),
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
            const error = {
                code: 'invalid_mode',
                message: `Thread mode "${sessionThread.thread.topLevelTab}" does not match tab "${input.topLevelTab}".`,
                action: {
                    code: 'mode_invalid',
                    modeKey: input.modeKey,
                    topLevelTab: input.topLevelTab,
                },
            } satisfies RunExecutionError;

            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start because session thread mode does not match selected tab.',
                ...withCorrelationContext(
                    { requestId: input.requestId, correlationId: input.correlationId },
                    {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        expectedTopLevelTab: sessionThread.thread.topLevelTab,
                        requestedTopLevelTab: input.topLevelTab,
                    }
                ),
            });
            return toRejectedStartResult(error, input);
        }

        const workspaceContext = await workspaceContextService.resolveForSession({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            allowLazySandboxCreation: input.topLevelTab !== 'chat',
        });
        if (!workspaceContext) {
            return {
                accepted: false,
                reason: 'not_found',
            };
        }
        if (
            input.topLevelTab !== 'chat' &&
            (sessionThread.thread.executionEnvironmentMode === 'new_sandbox' ||
                sessionThread.thread.executionEnvironmentMode === 'sandbox') &&
            workspaceContext.kind !== 'sandbox'
        ) {
            return toRejectedStartResult(
                {
                    code: 'provider_request_unavailable',
                    message:
                        'Managed sandbox could not be materialized. Switch this thread to local workspace mode to allow shared-path editing.',
                },
                input
            );
        }

        const preparedResult = await prepareRunStart({
            ...input,
            ...(workspaceContext.kind === 'sandbox' ? { sandboxId: workspaceContext.sandbox.id } : {}),
        });
        if (preparedResult.isErr()) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start during run preparation.',
                ...withCorrelationContext(
                    { requestId: input.requestId, correlationId: input.correlationId },
                    {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        providerId: input.providerId ?? null,
                        modelId: input.modelId ?? null,
                        errorCode: preparedResult.error.code,
                        error: preparedResult.error.message,
                    }
                ),
            });
            return toRejectedStartResult(preparedResult.error, input);
        }

        const prepared = preparedResult.value;
        prepared.workspaceContext = workspaceContext;
        const persisted = await persistRunStart({
            input,
            prepared,
        });
        if (!isEntityId(sessionThread.thread.id, 'thr')) {
            throw new InvariantError('Session thread id is invalid for run execution.');
        }
        const transportSelection = toTransportSelection({
            selected: prepared.initialTransport.selected,
            requested: prepared.initialTransport.requested,
            degraded: prepared.initialTransport.degraded,
            ...(prepared.initialTransport.degradedReason
                ? { degradedReason: prepared.initialTransport.degradedReason }
                : {}),
        });

        const controller = new AbortController();
        const completion = runToTerminalState({
            profileId: input.profileId,
            sessionId: input.sessionId,
            threadId: sessionThread.thread.id,
            runId: persisted.run.id,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            prompt: input.prompt,
            providerId: prepared.activeTarget.providerId,
            modelId: prepared.activeTarget.modelId,
            toolProtocol: prepared.runtimeProtocol,
            ...(prepared.apiFamily ? { apiFamily: prepared.apiFamily } : {}),
            ...(prepared.routedApiFamily ? { routedApiFamily: prepared.routedApiFamily } : {}),
            ...(prepared.openAIExecutionMode ? { openAIExecutionMode: prepared.openAIExecutionMode } : {}),
            authMethod: prepared.resolvedAuth.authMethod,
            runtimeOptions: input.runtimeOptions,
            cache: prepared.resolvedCache,
            transportSelection,
            toolDefinitions: prepared.toolDefinitions,
            ...(prepared.resolvedAuth.apiKey ? { apiKey: prepared.resolvedAuth.apiKey } : {}),
            ...(prepared.resolvedAuth.accessToken ? { accessToken: prepared.resolvedAuth.accessToken } : {}),
            ...(prepared.resolvedAuth.organizationId
                ? { organizationId: prepared.resolvedAuth.organizationId }
                : {}),
            ...(prepared.kiloRouting ? { kiloRouting: prepared.kiloRouting } : {}),
            ...(prepared.runContext ? { contextMessages: prepared.runContext.messages } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(workspaceContext.kind === 'sandbox' ? { sandboxId: workspaceContext.sandbox.id } : {}),
            workspaceContext,
            assistantMessageId: persisted.assistantMessageId,
            signal: controller.signal,
        })
            .catch((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                appLog.error({
                    tag: 'run-execution',
                    message: 'Background run execution terminated with an unhandled error after start.',
                    ...withCorrelationContext(
                        { requestId: input.requestId, correlationId: input.correlationId },
                        {
                            profileId: input.profileId,
                            sessionId: input.sessionId,
                            runId: persisted.run.id,
                            providerId: prepared.activeTarget.providerId,
                            modelId: prepared.activeTarget.modelId,
                            error: errorMessage,
                        }
                    ),
                });
            })
            .finally(() => {
                this.activeRuns.delete(persisted.run.id);
                this.activeRunsBySession.delete(createSessionKey(input.profileId, input.sessionId));
            });

        this.activeRuns.set(persisted.run.id, {
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: persisted.run.id,
            controller,
            completion,
        });
        this.activeRunsBySession.set(createSessionKey(input.profileId, input.sessionId), persisted.run.id);

        appLog.info({
            tag: 'run-execution',
            message: 'Started session run.',
            ...withCorrelationContext(
                { requestId: input.requestId, correlationId: input.correlationId },
                {
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    runId: persisted.run.id,
                    providerId: prepared.activeTarget.providerId,
                    modelId: prepared.activeTarget.modelId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                }
            ),
        });

        const [run, sessionStatus, thread, resolvedContextStateResult, initialMessages, initialMessageParts] = await Promise.all([
            runStore.getById(persisted.run.id),
            sessionStore.status(input.profileId, input.sessionId),
            threadStore.getListRecordById(input.profileId, sessionThread.thread.id),
            sessionContextService.getResolvedStateForExecutionTarget({
                profileId: input.profileId,
                sessionId: input.sessionId,
                providerId: prepared.activeTarget.providerId,
                modelId: prepared.activeTarget.modelId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                prompt: input.prompt,
                runId: persisted.run.id,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            }),
            messageStore.listMessagesBySession(input.profileId, input.sessionId, persisted.run.id),
            messageStore.listPartsBySession(input.profileId, input.sessionId, persisted.run.id),
        ]);

        if (!run || !sessionStatus.found) {
            throw new InvariantError(
                'Run start persisted successfully but the updated session state could not be reloaded.'
            );
        }

        const resolvedContextState = resolvedContextStateResult.isOk()
            ? resolvedContextStateResult.value
            : await sessionContextService.getResolvedState({
                  profileId: input.profileId,
                  sessionId: input.sessionId,
                  providerId: prepared.activeTarget.providerId,
                  modelId: prepared.activeTarget.modelId,
              });

        return {
            accepted: true,
            runId: persisted.run.id,
            runStatus: 'running',
            run,
            session: sessionStatus.session,
            initialMessages: {
                messages: initialMessages,
                messageParts: initialMessageParts,
            },
            resolvedContextState,
            ...(thread ? { thread } : {}),
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

        await moveRunToAbortedState({
            profileId,
            sessionId,
            runId,
            logMessage: 'Aborted persisted run without active in-memory controller.',
        });

        return {
            aborted: true,
            runId,
        };
    }
}

export const runExecutionService = new RunExecutionService();
