import type { ProviderRuntimeInput, ProviderRuntimePart } from '@/app/backend/providers/types';
import { createReasoningPartFromProviderPart } from '@/app/backend/runtime/services/runExecution/contextParts';

export interface ExecutableToolCall {
    callId: string;
    toolName: string;
    argumentsText: string;
    args: Record<string, unknown>;
}

type ProviderContextMessage = NonNullable<ProviderRuntimeInput['contextMessages']>[number];
type ProviderContextPart = ProviderContextMessage['parts'][number];

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readToolCallPayload(part: ProviderRuntimePart): ExecutableToolCall | null {
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

export interface AssistantTurnCollector {
    recordPart(part: ProviderRuntimePart): void;
    buildContextMessage(): ProviderContextMessage | undefined;
    getToolCalls(): ExecutableToolCall[];
}

export function createAssistantTurnCollector(): AssistantTurnCollector {
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

                parts.push({
                    type: 'text',
                    text,
                });
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
