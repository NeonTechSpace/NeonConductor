import { messageStore } from '@/app/backend/persistence/stores';
import type {
    ProviderRuntimeDescriptor,
    ProviderRuntimeInput,
    ProviderRuntimeToolDefinition,
    ProviderRuntimeTransportSelection,
} from '@/app/backend/providers/types';
import { errRunExecution, type RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import { createMessagePartRecorder, emitMessageCreatedEvent } from '@/app/backend/runtime/services/runExecution/eventing';
import { appendAssistantLifecycleStatusPart } from '@/app/backend/runtime/services/runExecution/firstOutputWatchdog';
import { executeRunCompletionHook } from '@/app/backend/runtime/services/runExecution/runCompletionHookExecutor';
import { executeProviderTurn, type ProviderTurnExecutionState } from '@/app/backend/runtime/services/runExecution/providerTurnExecutor';
import { executeToolRound } from '@/app/backend/runtime/services/runExecution/toolRoundOrchestrator';
import { resolveRunContextMessages } from '@/app/backend/runtime/services/runExecution/runContextMessageAdapter';
import type {
    RunCacheResolution,
    RunExecutionLoopOutcome,
    RunContextMessage,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';

import type { OpenAIExecutionMode } from '@/shared/contracts';
import type { EntityId, KiloDynamicSort, ProviderAuthMethod, RuntimeProviderId } from '@/shared/contracts';
import type { KiloModeHeader } from '@/shared/kiloModels';

const MAX_AGENT_TOOL_ROUNDS = 12;

type ProviderContextMessage = NonNullable<ProviderRuntimeInput['contextMessages']>[number];

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

export async function executeRun(input: ExecuteRunInput): Promise<RunExecutionResult<RunExecutionLoopOutcome>> {
    const resolvedContextMessages = await resolveRunContextMessages({
        ...(input.contextMessages ? { contextMessages: input.contextMessages } : {}),
    });
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
    let providerTurnState: ProviderTurnExecutionState = {
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
            return executeRunCompletionHook({
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
