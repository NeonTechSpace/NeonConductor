import { runStore, runUsageStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import { getProviderAdapter } from '@/app/backend/providers/adapters';
import { getProviderRuntimeBehavior } from '@/app/backend/providers/behaviors';
import type { ProviderRuntimeTransportSelection, ProviderRuntimeUsage } from '@/app/backend/providers/types';
import type { KiloDynamicSort, ProviderAuthMethod, RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { emitPartEvents, emitTransportSelectionEvent } from '@/app/backend/runtime/services/runExecution/eventing';
import type {
    ChatContextMessage,
    RunCacheResolution,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';
import { mergeUsage } from '@/app/backend/runtime/services/runExecution/usage';
import type { UsageAccumulator } from '@/app/backend/runtime/services/runExecution/usage';
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
    billedVia: 'kilo_gateway' | 'openai_api' | 'openai_subscription';
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
    contextMessages?: ChatContextMessage[];
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
}

export function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

export async function executeRun(input: ExecuteRunInput): Promise<void> {
    const adapter = getProviderAdapter(input.providerId);
    const behavior = getProviderRuntimeBehavior(input.providerId);
    let usage: UsageAccumulator = {};
    let transportSelection = input.transportSelection;

    await adapter.streamCompletion(
        {
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: input.runId,
            providerId: input.providerId,
            modelId: input.modelId,
            promptText: input.prompt,
            ...(input.contextMessages ? { contextMessages: input.contextMessages } : {}),
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
                await emitPartEvents({
                    runId: input.runId,
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    messageId: input.assistantMessageId,
                    part,
                });
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

    await runtimeEventLogService.append({
        entityType: 'run',
        entityId: input.runId,
        eventType: 'run.completed',
        payload: {
            runId: input.runId,
            sessionId: input.sessionId,
            profileId: input.profileId,
        },
    });

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

    await runtimeEventLogService.append({
        entityType: 'run',
        entityId: input.runId,
        eventType: 'run.usage.recorded',
        payload: {
            runId: input.runId,
            usage: recordedUsage,
        },
    });
}
