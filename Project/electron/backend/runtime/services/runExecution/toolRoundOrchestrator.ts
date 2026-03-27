import { errRunExecution, okRunExecution, type RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import { publishToolStateChangedObservabilityEvent } from '@/app/backend/runtime/services/observability/publishers';
import { persistToolResultMessage } from '@/app/backend/runtime/services/runExecution/toolResultMessageRecorder';
import { toolExecutionService } from '@/app/backend/runtime/services/toolExecution/service';
import type { EntityId, RuntimeProviderId } from '@/shared/contracts';

import type { ExecutableToolCall } from '@/app/backend/runtime/services/runExecution/assistantTurnCollector';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

export interface ToolRoundExecutionResult {
    kind: 'ok';
}

export async function executeToolRound(input: {
    executeRunInput: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        runId: EntityId<'run'>;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
        sandboxId?: EntityId<'sb'>;
        providerId: RuntimeProviderId;
        modelId: string;
        toolDefinitions: { id: string }[];
    };
    toolCalls: ExecutableToolCall[];
    allowedToolIds: Set<string>;
    conversationMessages: NonNullable<ProviderRuntimeInput['contextMessages']>;
}): Promise<RunExecutionResult<void>> {
    if (input.executeRunInput.toolDefinitions.length === 0) {
        return errRunExecution(
            'invalid_payload',
            'Provider emitted tool calls even though no runtime tools were exposed for this run.'
        );
    }

    for (const toolCall of input.toolCalls) {
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
    }

    return okRunExecution(undefined);
}
