import { Buffer } from 'node:buffer';

import { messageMediaStore, messageStore, runStore } from '@/app/backend/persistence/stores';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import type {
    ProviderRuntimeInput,
    ProviderRuntimePart,
    ProviderRuntimeDescriptor,
    ProviderRuntimeToolDefinition,
    ProviderRuntimeTransportSelection,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import {
    publishProviderPartObservabilityEvent,
    publishToolStateChangedObservabilityEvent,
    publishUsageObservabilityEvent,
} from '@/app/backend/runtime/services/observability/publishers';
import { createReasoningPartFromProviderPart } from '@/app/backend/runtime/services/runExecution/contextParts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
    type RunExecutionErrorCode,
} from '@/app/backend/runtime/services/runExecution/errors';
import {
    createMessagePartRecorder,
    emitMessageCreatedEvent,
    emitToolResultObservabilityEvent,
    emitTransportSelectionEvent,
} from '@/app/backend/runtime/services/runExecution/eventing';
import type {
    RunContextMessage,
    RunCacheResolution,
    RunExecutionLoopOutcome,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';
import { accumulateUsage } from '@/app/backend/runtime/services/runExecution/usage';
import type { UsageAccumulator } from '@/app/backend/runtime/services/runExecution/usage';
import { serializeToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/results';
import { toolExecutionService } from '@/app/backend/runtime/services/toolExecution/service';
import type { ToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/types';

import type { OpenAIExecutionMode } from '@/shared/contracts';
import type { EntityId, KiloDynamicSort, ProviderAuthMethod, RuntimeProviderId } from '@/shared/contracts';
import { createAssistantStatusPartPayload } from '@/shared/contracts/types/messagePart';
import type { KiloModeHeader } from '@/shared/kiloModels';

interface ExecutableToolCall {
    callId: string;
    toolName: string;
    argumentsText: string;
    args: Record<string, unknown>;
}

interface ToolResultContext {
    message: ProviderContextMessage;
    outputText: string;
    isError: boolean;
}

interface ProviderTurnState {
    usage: UsageAccumulator;
    transportSelection: ProviderRuntimeTransportSelection;
    firstRenderableOutputReceived: boolean;
    firstOutputTimedOut: boolean;
}

interface ProviderTurnResult extends ProviderTurnState {
    assistantContextMessage?: ProviderContextMessage;
    toolCalls: ExecutableToolCall[];
}

const MAX_AGENT_TOOL_ROUNDS = 12;
const FIRST_OUTPUT_STALLED_MS = 10_000;
const FIRST_OUTPUT_TIMEOUT_MS = 30_000;
type ProviderContextMessage = NonNullable<ProviderRuntimeInput['contextMessages']>[number];
type ProviderContextPart = ProviderContextMessage['parts'][number];

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
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

async function appendAssistantLifecycleStatusPart(input: {
    partRecorder: ReturnType<typeof createMessagePartRecorder>;
    code: 'received' | 'stalled' | 'failed_before_output';
    label: string;
    elapsedMs?: number;
    observabilityContext?: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        runId: EntityId<'run'>;
        providerId: RuntimeProviderId;
        modelId: string;
    };
}): Promise<void> {
    if (input.observabilityContext) {
        publishProviderPartObservabilityEvent({
            ...input.observabilityContext,
            part: {
                partType: 'status',
                payload: createAssistantStatusPartPayload({
                    code: input.code,
                    label: input.label,
                    ...(input.elapsedMs !== undefined ? { elapsedMs: input.elapsedMs } : {}),
                }),
            },
        });
    }

    await input.partRecorder.recordPart({
        partType: 'status',
        payload: createAssistantStatusPartPayload({
            code: input.code,
            label: input.label,
            ...(input.elapsedMs !== undefined ? { elapsedMs: input.elapsedMs } : {}),
        }),
    });
}

export interface ExecuteRunInput {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    prompt: string;
    topLevelTab: StartRunInput['topLevelTab'];
    modeKey: StartRunInput['modeKey'];
    providerId: RuntimeProviderId;
    modelId: string;
    runtime: ProviderRuntimeDescriptor;
    openAIExecutionMode?: OpenAIExecutionMode;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: StartRunInput['runtimeOptions'];
    contextMessages?: RunContextMessage[];
    cache: RunCacheResolution;
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
    onBeforeFinalize?: () => Promise<void>;
}

export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function assertNotAborted(signal: AbortSignal): void {
    if (signal.aborted) {
        throw new DOMException('Run aborted.', 'AbortError');
    }
}

async function resolveContextMessages(input: ExecuteRunInput): Promise<ProviderContextMessage[] | undefined> {
    if (!input.contextMessages) {
        return undefined;
    }

    return Promise.all(
        input.contextMessages.map(async (message) => ({
            role: message.role,
            parts: (
                await Promise.all(
                    message.parts.map(async (part) => {
                        if (
                            part.type === 'text' ||
                            part.type === 'reasoning' ||
                            part.type === 'reasoning_summary' ||
                            part.type === 'reasoning_encrypted' ||
                            part.type === 'tool_call' ||
                            part.type === 'tool_result'
                        ) {
                            return part;
                        }

                        const mediaPayload = part.dataUrl
                            ? undefined
                            : part.mediaId
                              ? await messageMediaStore.getPayload(part.mediaId)
                              : null;
                        const dataUrl =
                            part.dataUrl ??
                            (mediaPayload
                                ? `data:${mediaPayload.mimeType};base64,${Buffer.from(mediaPayload.bytes).toString('base64')}`
                                : null);
                        if (!dataUrl) {
                            return null;
                        }

                        return {
                            type: 'image' as const,
                            dataUrl,
                            mimeType: part.mimeType,
                            width: part.width,
                            height: part.height,
                        };
                    })
                )
            ).filter((part): part is NonNullable<typeof part> => part !== null),
        }))
    );
}

function stringifyToolOutcome(outcome: ToolInvocationOutcome): {
    outputText: string;
    isError: boolean;
    normalizedPayload: Record<string, unknown>;
} {
    const serializedResult = serializeToolInvocationOutcome(outcome);
    const normalizedPayload = serializedResult.ok
        ? {
              ok: true,
              toolId: serializedResult.toolId,
              output: serializedResult.output,
              at: serializedResult.at,
              policy: serializedResult.policy,
          }
        : {
              ok: false,
              toolId: serializedResult.toolId,
              error: serializedResult.error,
              message: serializedResult.message,
              args: serializedResult.args,
              at: serializedResult.at,
              ...(serializedResult.policy ? { policy: serializedResult.policy } : {}),
              ...(serializedResult.requestId ? { requestId: serializedResult.requestId } : {}),
          };

    return {
        outputText: JSON.stringify(normalizedPayload, null, 2),
        isError: !serializedResult.ok,
        normalizedPayload,
    };
}

function readToolCallPayload(part: ProviderRuntimePart): ExecutableToolCall | null {
    if (part.partType !== 'tool_call') {
        return null;
    }

    const callId = part.payload['callId'];
    const toolName = part.payload['toolName'];
    const argumentsText = part.payload['argumentsText'];
    const args = part.payload['args'];
    if (
        typeof callId !== 'string' ||
        typeof toolName !== 'string' ||
        typeof argumentsText !== 'string' ||
        !isRecord(args)
    ) {
        return null;
    }

    return {
        callId,
        toolName,
        argumentsText,
        args,
    };
}

function createAssistantTurnCollector() {
    const parts: ProviderContextPart[] = [];
    const toolCalls: ExecutableToolCall[] = [];

    return {
        recordPart(part: ProviderRuntimePart): void {
            if (part.partType === 'text') {
                const text = part.payload['text'];
                if (typeof text !== 'string' || text.length === 0) {
                    return;
                }

                const previousPart = parts.at(-1);
                if (previousPart?.type === 'text') {
                    previousPart.text = `${previousPart.text}${text}`;
                    return;
                }

                if (text.length > 0) {
                    parts.push({
                        type: 'text',
                        text,
                    });
                }
                return;
            }

            const reasoningPart = createReasoningPartFromProviderPart(part);
            if (reasoningPart) {
                parts.push(reasoningPart);
                return;
            }

            const toolCall = readToolCallPayload(part);
            if (!toolCall) {
                return;
            }

            parts.push({
                type: 'tool_call',
                callId: toolCall.callId,
                toolName: toolCall.toolName,
                argumentsText: toolCall.argumentsText,
            });
            toolCalls.push(toolCall);
        },
        buildContextMessage(): ProviderContextMessage | undefined {
            return parts.length > 0
                ? {
                      role: 'assistant',
                      parts,
                  }
                : undefined;
        },
        getToolCalls(): ExecutableToolCall[] {
            return [...toolCalls];
        },
    };
}

async function createRuntimeMessage(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    role: 'assistant' | 'tool';
}): Promise<Awaited<ReturnType<typeof messageStore.createMessage>>> {
    const message = await messageStore.createMessage({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        role: input.role,
    });
    await emitMessageCreatedEvent({
        runId: input.runId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        message,
    });
    return message;
}

async function persistToolResultMessage(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    toolCall: ExecutableToolCall;
    toolOutcome: ToolInvocationOutcome;
}): Promise<ToolResultContext> {
    const toolMessage = await createRuntimeMessage({
        profileId: input.profileId,
        sessionId: input.sessionId,
        runId: input.runId,
        role: 'tool',
    });
    const partRecorder = createMessagePartRecorder({
        runId: input.runId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        messageId: toolMessage.id,
    });
    const serializedResult = stringifyToolOutcome(input.toolOutcome);
    await partRecorder.recordPart({
        partType: 'tool_result',
        payload: {
            callId: input.toolCall.callId,
            toolName: input.toolCall.toolName,
            outputText: serializedResult.outputText,
            isError: serializedResult.isError,
            result: serializedResult.normalizedPayload,
        },
    });

    return {
        message: {
            role: 'tool',
            parts: [
                {
                    type: 'tool_result',
                    callId: input.toolCall.callId,
                    toolName: input.toolCall.toolName,
                    outputText: serializedResult.outputText,
                    isError: serializedResult.isError,
                },
            ],
        },
        outputText: serializedResult.outputText,
        isError: serializedResult.isError,
    };
}

function createProviderRuntimeInput(input: {
    executeRunInput: ExecuteRunInput;
    conversationMessages: ProviderContextMessage[];
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

async function executeProviderTurn(input: {
    executeRunInput: ExecuteRunInput;
    assistantMessageId: EntityId<'msg'>;
    conversationMessages: ProviderContextMessage[];
    state: ProviderTurnState;
}): Promise<RunExecutionResult<ProviderTurnResult>> {
    const adapter = getProviderAdapter(input.executeRunInput.providerId);
    const assistantCollector = createAssistantTurnCollector();
    const partRecorder = createMessagePartRecorder({
        runId: input.executeRunInput.runId,
        profileId: input.executeRunInput.profileId,
        sessionId: input.executeRunInput.sessionId,
        messageId: input.assistantMessageId,
    });
    const timeoutController = new AbortController();
    const timeoutSignal = input.state.firstRenderableOutputReceived
        ? input.executeRunInput.signal
        : AbortSignal.any([input.executeRunInput.signal, timeoutController.signal]);
    let firstRenderableOutputReceived = input.state.firstRenderableOutputReceived;
    let firstOutputTimedOut = input.state.firstOutputTimedOut;
    let usage = input.state.usage;
    let transportSelection = input.state.transportSelection;
    const stalledTimer: ReturnType<typeof setTimeout> | null = input.state.firstRenderableOutputReceived
        ? null
        : globalThis.setTimeout(() => {
              if (firstRenderableOutputReceived || firstOutputTimedOut || input.executeRunInput.signal.aborted) {
                  return;
              }

              void appendAssistantLifecycleStatusPart({
                  partRecorder,
                  code: 'stalled',
                  label: 'Still waiting for the first response chunk...',
                  elapsedMs: FIRST_OUTPUT_STALLED_MS,
                  observabilityContext: {
                      profileId: input.executeRunInput.profileId,
                      sessionId: input.executeRunInput.sessionId,
                      runId: input.executeRunInput.runId,
                      providerId: input.executeRunInput.providerId,
                      modelId: input.executeRunInput.modelId,
                  },
              }).catch(() => undefined);
          }, FIRST_OUTPUT_STALLED_MS);
    const timeoutTimer: ReturnType<typeof setTimeout> | null = input.state.firstRenderableOutputReceived
        ? null
        : globalThis.setTimeout(() => {
              if (firstRenderableOutputReceived || firstOutputTimedOut || input.executeRunInput.signal.aborted) {
                  return;
              }

              firstOutputTimedOut = true;
              timeoutController.abort();
          }, FIRST_OUTPUT_TIMEOUT_MS);
    const disposeFirstOutputWatchdog = () => {
        if (stalledTimer !== null) {
            globalThis.clearTimeout(stalledTimer);
        }
        if (timeoutTimer !== null) {
            globalThis.clearTimeout(timeoutTimer);
        }
    };

    const streamResult = await adapter.streamCompletion(
        createProviderRuntimeInput({
            executeRunInput: input.executeRunInput,
            conversationMessages: input.conversationMessages,
            timeoutSignal,
        }),
        {
            onPart: async (part) => {
                if (!firstRenderableOutputReceived && isRenderableAssistantOutputPart(part)) {
                    firstRenderableOutputReceived = true;
                    disposeFirstOutputWatchdog();
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
                if (
                    selection.selected === transportSelection.selected &&
                    selection.degraded === transportSelection.degraded &&
                    selection.degradedReason === transportSelection.degradedReason
                ) {
                    return;
                }

                transportSelection = selection;
                const run = await runStore.updateRuntimeMetadata(input.executeRunInput.runId, {
                    transportSelected: selection.selected,
                    ...(selection.degradedReason
                        ? {
                              transportDegradedReason: selection.degradedReason,
                          }
                        : {}),
                });
                if (!run) {
                    throw new InvariantError(
                        'Run transport metadata persisted successfully but the updated run snapshot could not be reloaded.'
                    );
                }
                await emitTransportSelectionEvent({
                    runId: input.executeRunInput.runId,
                    profileId: input.executeRunInput.profileId,
                    sessionId: input.executeRunInput.sessionId,
                    selection,
                    run,
                });
            },
        }
    );
    disposeFirstOutputWatchdog();

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

        if (!firstRenderableOutputReceived && timeoutSignal.aborted && !input.executeRunInput.signal.aborted) {
            return errRunExecution(mapAbortToExecutionErrorCode(timeoutSignal), streamResult.error.message);
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
}

async function executeToolRound(input: {
    executeRunInput: ExecuteRunInput;
    toolCalls: ExecutableToolCall[];
    allowedToolIds: Set<string>;
    conversationMessages: ProviderContextMessage[];
}): Promise<RunExecutionResult<void>> {
    if (input.executeRunInput.toolDefinitions.length === 0) {
        return errRunExecution(
            'invalid_payload',
            'Provider emitted tool calls even though no runtime tools were exposed for this run.'
        );
    }

    for (const toolCall of input.toolCalls) {
        assertNotAborted(input.executeRunInput.signal);
        publishToolStateChangedObservabilityEvent({
            profileId: input.executeRunInput.profileId,
            sessionId: input.executeRunInput.sessionId,
            runId: input.executeRunInput.runId,
            providerId: input.executeRunInput.providerId,
            modelId: input.executeRunInput.modelId,
            toolCallId: toolCall.callId,
            toolName: toolCall.toolName,
            state: 'proposed',
            argumentsText: toolCall.argumentsText,
        });
        publishToolStateChangedObservabilityEvent({
            profileId: input.executeRunInput.profileId,
            sessionId: input.executeRunInput.sessionId,
            runId: input.executeRunInput.runId,
            providerId: input.executeRunInput.providerId,
            modelId: input.executeRunInput.modelId,
            toolCallId: toolCall.callId,
            toolName: toolCall.toolName,
            state: 'input_complete',
            argumentsText: toolCall.argumentsText,
        });

        if (!input.allowedToolIds.has(toolCall.toolName)) {
            return errRunExecution('invalid_payload', `Provider emitted unsupported tool "${toolCall.toolName}".`);
        }

        const toolOutcome = await toolExecutionService.invokeWithOutcome(
            {
                profileId: input.executeRunInput.profileId,
                toolId: toolCall.toolName,
                topLevelTab: input.executeRunInput.topLevelTab,
                modeKey: input.executeRunInput.modeKey,
                ...(input.executeRunInput.workspaceFingerprint
                    ? { workspaceFingerprint: input.executeRunInput.workspaceFingerprint }
                    : {}),
                ...(input.executeRunInput.sandboxId ? { sandboxId: input.executeRunInput.sandboxId } : {}),
                args: toolCall.args,
            },
            {
                sessionId: input.executeRunInput.sessionId,
                runId: input.executeRunInput.runId,
                providerId: input.executeRunInput.providerId,
                modelId: input.executeRunInput.modelId,
                toolCallId: toolCall.callId,
                toolName: toolCall.toolName,
                argumentsText: toolCall.argumentsText,
            }
        );

        const persistedToolResult = await persistToolResultMessage({
            profileId: input.executeRunInput.profileId,
            sessionId: input.executeRunInput.sessionId,
            runId: input.executeRunInput.runId,
            toolCall,
            toolOutcome,
        });
        input.conversationMessages.push(persistedToolResult.message);
        emitToolResultObservabilityEvent({
            profileId: input.executeRunInput.profileId,
            sessionId: input.executeRunInput.sessionId,
            runId: input.executeRunInput.runId,
            providerId: input.executeRunInput.providerId,
            modelId: input.executeRunInput.modelId,
            toolCallId: toolCall.callId,
            toolName: toolCall.toolName,
            outputText: persistedToolResult.outputText,
            isError: persistedToolResult.isError,
        });
    }

    return okRunExecution(undefined);
}

async function buildSuccessfulCompletionOutcome(input: {
    onBeforeFinalize?: () => Promise<void>;
    usage: UsageAccumulator;
}): Promise<RunExecutionResult<RunExecutionLoopOutcome>> {
    if (input.onBeforeFinalize) {
        await input.onBeforeFinalize();
    }

    return okRunExecution({
        kind: 'completed',
        usage: input.usage,
    });
}

export async function executeRun(input: ExecuteRunInput): Promise<RunExecutionResult<RunExecutionLoopOutcome>> {
    const resolvedContextMessages = await resolveContextMessages(input);
    const allowedToolIds = new Set(input.toolDefinitions.map((tool) => tool.id));
    let assistantMessageId = input.assistantMessageId;
    const conversationMessages: ProviderContextMessage[] =
        resolvedContextMessages && resolvedContextMessages.length > 0
            ? [...resolvedContextMessages]
            : input.prompt.trim().length > 0
              ? [
                    {
                        role: 'user' as const,
                        parts: [{ type: 'text' as const, text: input.prompt }],
                    },
                ]
              : [];
    let providerTurnState: ProviderTurnState = {
        usage: {},
        transportSelection: input.transportSelection,
        firstRenderableOutputReceived: false,
        firstOutputTimedOut: false,
    };

    for (let roundIndex = 0; roundIndex < MAX_AGENT_TOOL_ROUNDS; roundIndex += 1) {
        assertNotAborted(input.signal);

        const providerTurnResult = await executeProviderTurn({
            executeRunInput: input,
            assistantMessageId,
            conversationMessages,
            state: providerTurnState,
        });
        if (providerTurnResult.isErr()) {
            return errRunExecution(
                providerTurnResult.error.code,
                providerTurnResult.error.message,
                providerTurnResult.error.action ? { action: providerTurnResult.error.action } : undefined
            );
        }

        providerTurnState = {
            usage: providerTurnResult.value.usage,
            transportSelection: providerTurnResult.value.transportSelection,
            firstRenderableOutputReceived: providerTurnResult.value.firstRenderableOutputReceived,
            firstOutputTimedOut: providerTurnResult.value.firstOutputTimedOut,
        };

        if (providerTurnResult.value.assistantContextMessage) {
            conversationMessages.push(providerTurnResult.value.assistantContextMessage);
        }

        if (providerTurnResult.value.toolCalls.length === 0) {
            return buildSuccessfulCompletionOutcome({
                usage: providerTurnState.usage,
                ...(input.onBeforeFinalize ? { onBeforeFinalize: input.onBeforeFinalize } : {}),
            });
        }

        const toolRoundResult = await executeToolRound({
            executeRunInput: input,
            toolCalls: providerTurnResult.value.toolCalls,
            allowedToolIds,
            conversationMessages,
        });
        if (toolRoundResult.isErr()) {
            return errRunExecution(
                toolRoundResult.error.code,
                toolRoundResult.error.message,
                toolRoundResult.error.action ? { action: toolRoundResult.error.action } : undefined
            );
        }

        if (roundIndex === MAX_AGENT_TOOL_ROUNDS - 1) {
            return errRunExecution(
                'provider_request_failed',
                `Run exceeded the maximum of ${String(MAX_AGENT_TOOL_ROUNDS)} tool rounds.`
            );
        }

        const nextAssistantMessage = await createRuntimeMessage({
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            role: 'assistant',
        });
        await appendAssistantLifecycleStatusPart({
            partRecorder: createMessagePartRecorder({
                runId: input.runId,
                profileId: input.profileId,
                sessionId: input.sessionId,
                messageId: nextAssistantMessage.id,
            }),
            code: 'received',
            label: 'Agent received message',
            observabilityContext: {
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                providerId: input.providerId,
                modelId: input.modelId,
            },
        });
        assistantMessageId = nextAssistantMessage.id;
    }

    return errRunExecution(
        'provider_request_failed',
        `Run exceeded the maximum of ${String(MAX_AGENT_TOOL_ROUNDS)} tool rounds.`
    );
}

