import { Buffer } from 'node:buffer';

import { messageMediaStore, messageStore, runStore, runUsageStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import { getProviderRuntimeBehavior } from '@/app/backend/providers/behaviors';
import type {
    ProviderRuntimeInput,
    ProviderRuntimePart,
    ProviderRuntimeToolDefinition,
    ProviderRuntimeTransportSelection,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';
import type { EntityId, KiloDynamicSort, ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import {
    createMessagePartRecorder,
    emitMessageCreatedEvent,
    emitTransportSelectionEvent,
} from '@/app/backend/runtime/services/runExecution/eventing';
import type {
    RunContextMessage,
    RunCacheResolution,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';
import { accumulateUsage } from '@/app/backend/runtime/services/runExecution/usage';
import type { UsageAccumulator } from '@/app/backend/runtime/services/runExecution/usage';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { threadTitleService } from '@/app/backend/runtime/services/threadTitle/service';
import { toolExecutionService } from '@/app/backend/runtime/services/toolExecution/service';
import type { ToolExecutionResult } from '@/app/backend/runtime/services/toolExecution/types';

interface RunUsageWriteInput {
    runId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    costMicrounits?: number;
    billedVia: 'kilo_gateway' | 'openai_api' | 'openai_subscription' | 'zai_api' | 'moonshot_api';
}

interface ExecutableToolCall {
    callId: string;
    toolName: string;
    argumentsText: string;
    args: Record<string, unknown>;
}

interface ToolResultContext {
    message: ProviderContextMessage;
}

const MAX_AGENT_TOOL_ROUNDS = 12;
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

export interface ExecuteRunInput {
    profileId: string;
    sessionId: EntityId<'sess'>;
    runId: EntityId<'run'>;
    prompt: string;
    topLevelTab: StartRunInput['topLevelTab'];
    modeKey: StartRunInput['modeKey'];
    providerId: RuntimeProviderId;
    modelId: string;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: StartRunInput['runtimeOptions'];
    contextMessages?: RunContextMessage[];
    cache: RunCacheResolution;
    transportSelection: ProviderRuntimeTransportSelection;
    toolDefinitions: ProviderRuntimeToolDefinition[];
    apiKey?: string;
    accessToken?: string;
    organizationId?: string;
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
    worktreeId?: EntityId<'wt'>;
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

async function resolveContextMessages(
    input: ExecuteRunInput
): Promise<ProviderContextMessage[] | undefined> {
    if (!input.contextMessages) {
        return undefined;
    }

    return Promise.all(
        input.contextMessages.map(async (message) => ({
            role: message.role,
            parts: (
                await Promise.all(
                    message.parts.map(async (part) => {
                        if (part.type === 'text' || part.type === 'tool_call' || part.type === 'tool_result') {
                            return part;
                        }

                        const mediaPayload =
                            part.dataUrl
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

function stringifyToolResult(result: ToolExecutionResult): {
    outputText: string;
    isError: boolean;
    normalizedPayload: Record<string, unknown>;
} {
    const normalizedPayload = result.ok
        ? {
              ok: true,
              toolId: result.toolId,
              output: result.output,
              at: result.at,
              policy: result.policy,
          }
        : {
              ok: false,
              toolId: result.toolId,
              error: result.error,
              message: result.message,
              args: result.args,
              at: result.at,
              ...(result.policy ? { policy: result.policy } : {}),
              ...(result.requestId ? { requestId: result.requestId } : {}),
          };

    return {
        outputText: JSON.stringify(normalizedPayload, null, 2),
        isError: !result.ok,
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
    sessionId: string;
    runId: string;
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
    sessionId: string;
    runId: string;
    toolCall: ExecutableToolCall;
    toolResult: ToolExecutionResult;
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
    const serializedResult = stringifyToolResult(input.toolResult);
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
        };
}

export async function executeRun(input: ExecuteRunInput): Promise<RunExecutionResult<void>> {
    const adapter = getProviderAdapter(input.providerId);
    const behavior = getProviderRuntimeBehavior(input.providerId);
    const resolvedContextMessages = await resolveContextMessages(input);
    const allowedToolIds = new Set(input.toolDefinitions.map((tool) => tool.id));
    let usage: UsageAccumulator = {};
    let transportSelection = input.transportSelection;
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

    for (let roundIndex = 0; roundIndex < MAX_AGENT_TOOL_ROUNDS; roundIndex += 1) {
        assertNotAborted(input.signal);

        const assistantCollector = createAssistantTurnCollector();
        const partRecorder = createMessagePartRecorder({
            runId: input.runId,
            profileId: input.profileId,
            sessionId: input.sessionId,
            messageId: assistantMessageId,
        });

        const runtimeInput: ProviderRuntimeInput = {
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: input.providerId,
            modelId: input.modelId,
            promptText: input.prompt,
            ...(conversationMessages.length > 0 ? { contextMessages: conversationMessages } : {}),
            ...(input.toolDefinitions.length > 0 ? { tools: input.toolDefinitions, toolChoice: 'auto' as const } : {}),
            runtimeOptions: input.runtimeOptions,
            cache: input.cache,
            authMethod: input.authMethod,
            ...(input.apiKey ? { apiKey: input.apiKey } : {}),
            ...(input.accessToken ? { accessToken: input.accessToken } : {}),
            ...(input.organizationId ? { organizationId: input.organizationId } : {}),
            ...(input.kiloRouting ? { kiloRouting: input.kiloRouting } : {}),
            signal: input.signal,
        };

        const streamResult = await adapter.streamCompletion(
            runtimeInput,
            {
                onPart: async (part) => {
                    await partRecorder.recordPart(part);
                    assistantCollector.recordPart(part);
                },
                onUsage: (nextUsage: ProviderRuntimeUsage) => {
                    usage = accumulateUsage(usage, nextUsage);
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
                    await runStore.updateRuntimeMetadata(input.runId, {
                        transportSelected: selection.selected,
                        ...(selection.degradedReason
                            ? {
                                  transportDegradedReason: selection.degradedReason,
                              }
                            : {}),
                    });
                    await emitTransportSelectionEvent({
                        runId: input.runId,
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        selection,
                    });
                },
            }
        );
        if (streamResult.isErr()) {
            return mapProviderAdapterError({
                code: streamResult.error.code,
                message: streamResult.error.message,
            });
        }

        const assistantContextMessage = assistantCollector.buildContextMessage();
        if (assistantContextMessage) {
            conversationMessages.push(assistantContextMessage);
        }

        const toolCalls = assistantCollector.getToolCalls();
        if (toolCalls.length === 0) {
            if (input.onBeforeFinalize) {
                await input.onBeforeFinalize();
            }

            await runStore.finalize(input.runId, {
                status: 'completed',
            });
            await sessionStore.markRunTerminal(input.profileId, input.sessionId, 'completed');
            const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
            if (sessionThread) {
                await threadStore.markAssistantActivity(input.profileId, sessionThread.thread.id, new Date().toISOString());
            }
            await threadTitleService.maybeApply({
                profileId: input.profileId,
                sessionId: input.sessionId,
                prompt: input.prompt,
                providerId: input.providerId,
                modelId: input.modelId,
            });

            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'run',
                    domain: 'run',
                    entityId: input.runId,
                    eventType: 'run.completed',
                    payload: {
                        runId: input.runId,
                        sessionId: input.sessionId,
                        profileId: input.profileId,
                    },
                })
            );

            const usageRecordInput: RunUsageWriteInput = {
                runId: input.runId,
                providerId: input.providerId,
                modelId: input.modelId,
                billedVia: behavior.resolveBilledVia(input.authMethod),
            };

            if (usage.inputTokens !== undefined) usageRecordInput.inputTokens = usage.inputTokens;
            if (usage.outputTokens !== undefined) usageRecordInput.outputTokens = usage.outputTokens;
            if (usage.cachedTokens !== undefined) usageRecordInput.cachedTokens = usage.cachedTokens;
            if (usage.reasoningTokens !== undefined) usageRecordInput.reasoningTokens = usage.reasoningTokens;
            if (usage.totalTokens !== undefined) usageRecordInput.totalTokens = usage.totalTokens;
            if (usage.latencyMs !== undefined) usageRecordInput.latencyMs = usage.latencyMs;
            if (usage.costMicrounits !== undefined) usageRecordInput.costMicrounits = usage.costMicrounits;

            const recordedUsage = await runUsageStore.upsert(usageRecordInput);

            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'run',
                    domain: 'run',
                    entityId: input.runId,
                    eventType: 'run.usage.recorded',
                    payload: {
                        runId: input.runId,
                        usage: recordedUsage,
                    },
                })
            );

            return okRunExecution(undefined);
        }

        if (input.toolDefinitions.length === 0) {
            return errRunExecution(
                'invalid_payload',
                'Provider emitted tool calls even though no runtime tools were exposed for this run.'
            );
        }

        for (const toolCall of toolCalls) {
            assertNotAborted(input.signal);

            if (!allowedToolIds.has(toolCall.toolName)) {
                return errRunExecution(
                    'invalid_payload',
                    `Provider emitted unsupported tool "${toolCall.toolName}".`
                );
            }

            const toolResult = await toolExecutionService.invoke({
                profileId: input.profileId,
                toolId: toolCall.toolName,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                ...(input.worktreeId ? { worktreeId: input.worktreeId } : {}),
                args: toolCall.args,
            });

            const persistedToolResult = await persistToolResultMessage({
                profileId: input.profileId,
                sessionId: input.sessionId,
                runId: input.runId,
                toolCall,
                toolResult,
            });
            conversationMessages.push(persistedToolResult.message);
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
        assistantMessageId = nextAssistantMessage.id;
    }

    return errRunExecution(
        'provider_request_failed',
        `Run exceeded the maximum of ${String(MAX_AGENT_TOOL_ROUNDS)} tool rounds.`
    );
}
