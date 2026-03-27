import { messageStore } from '@/app/backend/persistence/stores';
import { emitMessageCreatedEvent, createMessagePartRecorder } from '@/app/backend/runtime/services/runExecution/eventing';
import { serializeToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/results';
import type { ToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/types';
import type { EntityId } from '@/shared/contracts';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

import type { ExecutableToolCall } from '@/app/backend/runtime/services/runExecution/assistantTurnCollector';

type ProviderContextMessage = NonNullable<ProviderRuntimeInput['contextMessages']>[number];

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

export interface ToolResultContext {
    message: ProviderContextMessage;
    outputText: string;
    isError: boolean;
}

export async function persistToolResultMessage(input: {
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
