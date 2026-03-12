import { Buffer } from 'node:buffer';

import { messageMediaStore, runStore, runUsageStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import { getProviderRuntimeBehavior } from '@/app/backend/providers/behaviors';
import type { ProviderRuntimeTransportSelection, ProviderRuntimeUsage } from '@/app/backend/providers/types';
import type { KiloDynamicSort, ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import {
    createAssistantMessagePartRecorder,
    emitTransportSelectionEvent,
} from '@/app/backend/runtime/services/runExecution/eventing';
import type {
    RunContextMessage,
    RunCacheResolution,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';
import { mergeUsage } from '@/app/backend/runtime/services/runExecution/usage';
import type { UsageAccumulator } from '@/app/backend/runtime/services/runExecution/usage';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { threadTitleService } from '@/app/backend/runtime/services/threadTitle/service';

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
    sessionId: string;
    runId: string;
    prompt: string;
    providerId: RuntimeProviderId;
    modelId: string;
    authMethod: ProviderAuthMethod | 'none';
    runtimeOptions: StartRunInput['runtimeOptions'];
    contextMessages?: RunContextMessage[];
    cache: RunCacheResolution;
    transportSelection: ProviderRuntimeTransportSelection;
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
    assistantMessageId: string;
    signal: AbortSignal;
    onBeforeFinalize?: () => Promise<void>;
}

export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

export async function executeRun(input: ExecuteRunInput): Promise<RunExecutionResult<void>> {
    const adapter = getProviderAdapter(input.providerId);
    const behavior = getProviderRuntimeBehavior(input.providerId);
    let usage: UsageAccumulator = {};
    let transportSelection = input.transportSelection;
    const partRecorder = createAssistantMessagePartRecorder({
        runId: input.runId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        messageId: input.assistantMessageId,
    });
    const resolvedContextMessages = input.contextMessages
        ? await Promise.all(
              input.contextMessages.map(async (message) => ({
                  role: message.role,
                  parts: (
                      await Promise.all(
                          message.parts.map(async (part) => {
                              if (part.type === 'text') {
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
          )
        : undefined;

    const streamResult = await adapter.streamCompletion(
        {
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: input.providerId,
            modelId: input.modelId,
            promptText: input.prompt,
            ...(resolvedContextMessages ? { contextMessages: resolvedContextMessages } : {}),
            runtimeOptions: input.runtimeOptions,
            cache: input.cache,
            authMethod: input.authMethod,
            ...(input.apiKey ? { apiKey: input.apiKey } : {}),
            ...(input.accessToken ? { accessToken: input.accessToken } : {}),
            ...(input.organizationId ? { organizationId: input.organizationId } : {}),
            ...(input.kiloRouting ? { kiloRouting: input.kiloRouting } : {}),
            signal: input.signal,
        },
        {
            onPart: async (part) => {
                await partRecorder.recordPart(part);
            },
            onUsage: (nextUsage: ProviderRuntimeUsage) => {
                usage = mergeUsage(usage, nextUsage);
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
