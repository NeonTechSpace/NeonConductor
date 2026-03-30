import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

function toUpstreamModelId(modelId: string, modelPrefix: string): string {
    return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}

function mapReasoningEffort(
    effort: ProviderRuntimeInput['runtimeOptions']['reasoning']['effort']
): 'minimal' | 'low' | 'medium' | 'high' | undefined {
    if (effort === 'none') {
        return undefined;
    }

    if (effort === 'xhigh') {
        return 'high';
    }

    return effort;
}

export function buildOpenAIResponsesRequestBody(
    input: ProviderRuntimeInput,
    modelPrefix: string
): Record<string, unknown> {
    const effort = mapReasoningEffort(input.runtimeOptions.reasoning.effort);
    const include = input.runtimeOptions.reasoning.includeEncrypted ? ['reasoning.encrypted_content'] : [];
    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [{ role: 'user' as const, parts: [{ type: 'text' as const, text: input.promptText }] }];

    const responseInputItems = contextMessages.flatMap((message) => {
        const textAndImageParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'text' | 'image' }> =>
                part.type === 'text' || part.type === 'image'
        );
        const toolCallParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'tool_call' }> => part.type === 'tool_call'
        );
        const toolResultParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'tool_result' }> =>
                part.type === 'tool_result'
        );

        const items: Array<Record<string, unknown>> = [];
        if (textAndImageParts.length > 0) {
            items.push({
                role: message.role,
                content: textAndImageParts.map((part) =>
                    part.type === 'text'
                        ? {
                              type: 'input_text',
                              text: part.text,
                          }
                        : {
                              type: 'input_image',
                              image_url: part.dataUrl,
                          }
                ),
            });
        }

        for (const toolCallPart of toolCallParts) {
            items.push({
                type: 'function_call',
                call_id: toolCallPart.callId,
                name: toolCallPart.toolName,
                arguments: toolCallPart.argumentsText,
            });
        }

        for (const toolResultPart of toolResultParts) {
            items.push({
                type: 'function_call_output',
                call_id: toolResultPart.callId,
                output: toolResultPart.outputText,
            });
        }

        return items;
    });

    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        stream: true,
        input: responseInputItems,
        reasoning: {
            summary: input.runtimeOptions.reasoning.summary,
            ...(effort ? { effort } : {}),
        },
    };

    if (input.tools && input.tools.length > 0) {
        body['tools'] = input.tools.map((tool) => ({
            type: 'function',
            name: tool.id,
            description: tool.description,
            parameters: tool.inputSchema,
        }));
        body['tool_choice'] = input.toolChoice ?? 'auto';
    }

    if (include.length > 0) {
        body['include'] = include;
    }

    return body;
}
