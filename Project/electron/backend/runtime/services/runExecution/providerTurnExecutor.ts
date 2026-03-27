import { getProviderAdapter } from '@/app/backend/providers/adapters';
import type {
    ProviderRuntimeDescriptor,
    ProviderRuntimeInput,
    ProviderRuntimePart,
    ProviderRuntimeTransportSelection,
    ProviderRuntimeToolDefinition,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';
import {
    publishProviderPartObservabilityEvent,
    publishUsageObservabilityEvent,
} from '@/app/backend/runtime/services/observability/publishers';
import { createAssistantTurnCollector, type ExecutableToolCall } from '@/app/backend/runtime/services/runExecution/assistantTurnCollector';
import { errRunExecution, okRunExecution, type RunExecutionResult, type RunExecutionErrorCode } from '@/app/backend/runtime/services/runExecution/errors';
import { createMessagePartRecorder } from '@/app/backend/runtime/services/runExecution/eventing';
import { appendAssistantLifecycleStatusPart, createFirstOutputWatchdog, FIRST_OUTPUT_TIMEOUT_MS } from '@/app/backend/runtime/services/runExecution/firstOutputWatchdog';
import { recordTransportSelectionIfChanged } from '@/app/backend/runtime/services/runExecution/transportSelectionRecorder';
import { accumulateUsage, type UsageAccumulator } from '@/app/backend/runtime/services/runExecution/usage';
import type { EntityId, KiloDynamicSort, ProviderAuthMethod, RuntimeProviderId } from '@/shared/contracts';
import type { KiloModeHeader } from '@/shared/kiloModels';

export interface ProviderTurnExecutionState {
    usage: UsageAccumulator;
    transportSelection: ProviderRuntimeTransportSelection;
    firstRenderableOutputReceived: boolean;
    firstOutputTimedOut: boolean;
}

export interface ProviderTurnExecutionResult extends ProviderTurnExecutionState {
    assistantContextMessage?: NonNullable<ProviderRuntimeInput['contextMessages']>[number];
    toolCalls: ExecutableToolCall[];
}

export interface ExecuteRunProviderTurnInput {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    prompt: string;
    topLevelTab: 'chat' | 'agent' | 'orchestrator';
    modeKey: string;
    providerId: RuntimeProviderId;
    modelId: string;
    runtime: ProviderRuntimeDescriptor;
    openAIExecutionMode?: import('@/shared/contracts').OpenAIExecutionMode;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: import('@/app/backend/runtime/services/runExecution/types').StartRunInput['runtimeOptions'];
    contextMessages?: import('@/app/backend/runtime/services/runExecution/types').RunContextMessage[];
    cache: import('@/app/backend/runtime/services/runExecution/types').RunCacheResolution;
    transportSelection: ProviderRuntimeTransportSelection;
    toolDefinitions: ProviderRuntimeToolDefinition[];
    apiKey?: string;
    accessToken?: string;
    organizationId?: string;
    kiloModeHeader?: KiloModeHeader;
    kiloRouting?:
        | {
              mode: 'dynamic';
              sort: KiloDynamicSort;
          }
        | {
              mode: 'pinned';
              providerId: string;
          };
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    assistantMessageId: EntityId<'msg'>;
    signal: AbortSignal;
}

function mapProviderAdapterError(input: {
    code: 'auth_missing' | 'invalid_payload' | 'provider_request_failed' | 'provider_request_unavailable';
    message: string;
}): ReturnType<typeof errRunExecution> {
    if (input.code === 'auth_missing') {
        return errRunExecution('provider_not_authenticated', input.message);
    }
    if (input.code === 'invalid_payload') {
        return errRunExecution('invalid_payload', input.message);
    }
    if (input.code === 'provider_request_unavailable') {
        return errRunExecution('provider_request_unavailable', input.message);
    }

    return errRunExecution('provider_request_failed', input.message);
}

function mapAbortToExecutionErrorCode(signal: AbortSignal): RunExecutionErrorCode {
    return signal.reason instanceof DOMException && signal.reason.name === 'AbortError'
        ? 'provider_request_unavailable'
        : 'provider_request_failed';
}

function isRenderableAssistantOutputPart(part: ProviderRuntimePart): boolean {
    return (
        part.partType === 'text' ||
        part.partType === 'reasoning' ||
        part.partType === 'reasoning_summary' ||
        part.partType === 'image' ||
        part.partType === 'tool_call'
    );
}

function createProviderRuntimeInput(input: {
    executeRunInput: ExecuteRunProviderTurnInput;
    conversationMessages: NonNullable<ProviderRuntimeInput['contextMessages']>;
    timeoutSignal: AbortSignal;
}): ProviderRuntimeInput {
    const { executeRunInput } = input;

    return {
        profileId: executeRunInput.profileId,
        sessionId: executeRunInput.sessionId,
        runId: executeRunInput.runId,
        providerId: executeRunInput.providerId,
        modelId: executeRunInput.modelId,
        runtime: executeRunInput.runtime,
        promptText: executeRunInput.prompt,
        ...(input.conversationMessages.length > 0 ? { contextMessages: input.conversationMessages } : {}),
        ...(executeRunInput.toolDefinitions.length > 0
            ? { tools: executeRunInput.toolDefinitions, toolChoice: 'auto' as const }
            : {}),
        cache: executeRunInput.cache,
        authMethod: executeRunInput.authMethod,
        ...(executeRunInput.apiKey ? { apiKey: executeRunInput.apiKey } : {}),
        ...(executeRunInput.accessToken ? { accessToken: executeRunInput.accessToken } : {}),
        ...(executeRunInput.organizationId ? { organizationId: executeRunInput.organizationId } : {}),
        ...(executeRunInput.kiloModeHeader ? { kiloModeHeader: executeRunInput.kiloModeHeader } : {}),
        ...(executeRunInput.kiloRouting ? { kiloRouting: executeRunInput.kiloRouting } : {}),
        runtimeOptions: {
            ...executeRunInput.runtimeOptions,
            execution: {
                ...(executeRunInput.openAIExecutionMode
                    ? { openAIExecutionMode: executeRunInput.openAIExecutionMode }
                    : {}),
            },
        },
        signal: input.timeoutSignal,
    };
}

export async function executeProviderTurn(input: {
    executeRunInput: ExecuteRunProviderTurnInput;
    assistantMessageId: EntityId<'msg'>;
    state: ProviderTurnExecutionState;
    conversationMessages: NonNullable<ProviderRuntimeInput['contextMessages']>;
}): Promise<RunExecutionResult<ProviderTurnExecutionResult>> {
    const adapter = getProviderAdapter(input.executeRunInput.providerId);
    const assistantCollector = createAssistantTurnCollector();
    const partRecorder = createMessagePartRecorder({
        runId: input.executeRunInput.runId,
        profileId: input.executeRunInput.profileId,
        sessionId: input.executeRunInput.sessionId,
        messageId: input.assistantMessageId,
    });
    const watchdog = createFirstOutputWatchdog({
        partRecorder,
        signal: input.executeRunInput.signal,
        observabilityContext: {
            profileId: input.executeRunInput.profileId,
            sessionId: input.executeRunInput.sessionId,
            runId: input.executeRunInput.runId,
            providerId: input.executeRunInput.providerId,
            modelId: input.executeRunInput.modelId,
        },
    });

    let usage = input.state.usage;
    let transportSelection = input.state.transportSelection;
    let firstRenderableOutputReceived = input.state.firstRenderableOutputReceived;
    let firstOutputTimedOut = input.state.firstOutputTimedOut;

    try {
        const streamResult = await adapter.streamCompletion(
            createProviderRuntimeInput({
                executeRunInput: input.executeRunInput,
                conversationMessages: input.conversationMessages,
                timeoutSignal: watchdog.timeoutSignal,
            }),
            {
                onPart: async (part) => {
                    if (!firstRenderableOutputReceived && isRenderableAssistantOutputPart(part)) {
                        firstRenderableOutputReceived = true;
                        watchdog.markRenderableOutputReceived();
                    }
                    publishProviderPartObservabilityEvent({
                        profileId: input.executeRunInput.profileId,
                        sessionId: input.executeRunInput.sessionId,
                        runId: input.executeRunInput.runId,
                        providerId: input.executeRunInput.providerId,
                        modelId: input.executeRunInput.modelId,
                        part,
                    });
                    await partRecorder.recordPart(part);
                    assistantCollector.recordPart(part);
                },
                onUsage: (nextUsage: ProviderRuntimeUsage) => {
                    usage = accumulateUsage(usage, nextUsage);
                    publishUsageObservabilityEvent({
                        profileId: input.executeRunInput.profileId,
                        sessionId: input.executeRunInput.sessionId,
                        runId: input.executeRunInput.runId,
                        providerId: input.executeRunInput.providerId,
                        modelId: input.executeRunInput.modelId,
                        usage: nextUsage,
                    });
                },
                onTransportSelected: async (selection) => {
                    transportSelection = await recordTransportSelectionIfChanged({
                        profileId: input.executeRunInput.profileId,
                        sessionId: input.executeRunInput.sessionId,
                        runId: input.executeRunInput.runId,
                        currentSelection: transportSelection,
                        nextSelection: selection,
                    });
                },
            }
        );
        firstOutputTimedOut = watchdog.hasTimedOut();

        if (streamResult.isErr()) {
            if (!firstRenderableOutputReceived && firstOutputTimedOut && !input.executeRunInput.signal.aborted) {
                await appendAssistantLifecycleStatusPart({
                    partRecorder,
                    code: 'failed_before_output',
                    label: 'Agent timed out before sending the first response chunk.',
                    elapsedMs: FIRST_OUTPUT_TIMEOUT_MS,
                    observabilityContext: {
                        profileId: input.executeRunInput.profileId,
                        sessionId: input.executeRunInput.sessionId,
                        runId: input.executeRunInput.runId,
                        providerId: input.executeRunInput.providerId,
                        modelId: input.executeRunInput.modelId,
                    },
                });

                return errRunExecution(
                    'provider_first_output_timeout',
                    `Agent did not begin streaming a response within ${String(FIRST_OUTPUT_TIMEOUT_MS / 1000)} seconds.`
                );
            }

            if (!firstRenderableOutputReceived && watchdog.hasTimedOut() && !input.executeRunInput.signal.aborted) {
                return errRunExecution(mapAbortToExecutionErrorCode(watchdog.timeoutSignal), streamResult.error.message);
            }

            return mapProviderAdapterError({
                code: streamResult.error.code,
                message: streamResult.error.message,
            });
        }

        const assistantContextMessage = assistantCollector.buildContextMessage();
        return okRunExecution({
            ...(assistantContextMessage ? { assistantContextMessage } : {}),
            toolCalls: assistantCollector.getToolCalls(),
            usage,
            transportSelection,
            firstRenderableOutputReceived,
            firstOutputTimedOut,
        });
    } finally {
        watchdog.dispose();
    }
}
