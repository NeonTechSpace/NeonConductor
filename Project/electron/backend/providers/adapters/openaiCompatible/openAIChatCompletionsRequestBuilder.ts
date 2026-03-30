import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

type ChatCompletionRequestMessage =
    | {
          role: 'tool';
          tool_call_id: string;
          content: string;
      }
    | {
          role: 'system' | 'user' | 'assistant';
          content:
              | string
              | Array<
                    | {
                          type: 'text';
                          text: string;
                      }
                    | {
                          type: 'image_url';
                          image_url: {
                              url: string;
                          };
                      }
                >
              | null;
          tool_calls?: Array<{
              id: string;
              type: 'function';
              function: {
                  name: string;
                  arguments: string;
              };
          }>;
      };

function toUpstreamModelId(modelId: string, modelPrefix: string): string {
    return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}

export function buildOpenAIChatCompletionsRequestBody(
    input: ProviderRuntimeInput,
    modelPrefix: string
): Record<string, unknown> {
    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [{ role: 'user' as const, parts: [{ type: 'text' as const, text: input.promptText }] }];

    const messages: ChatCompletionRequestMessage[] = [];
    for (const message of contextMessages) {
        if (message.role === 'tool') {
            const toolMessages = message.parts
                .filter(
                    (part): part is Extract<(typeof message.parts)[number], { type: 'tool_result' }> =>
                        part.type === 'tool_result'
                )
                .map((part) => ({
                    role: 'tool' as const,
                    tool_call_id: part.callId,
                    content: part.outputText,
                }));
            messages.push(...toolMessages);
            continue;
        }

        const contentParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'text' | 'image' }> =>
                part.type === 'text' || part.type === 'image'
        );
        const toolCallParts = message.parts.filter(
            (part): part is Extract<(typeof message.parts)[number], { type: 'tool_call' }> => part.type === 'tool_call'
        );
        const content =
            contentParts.length === 0
                ? null
                : contentParts.length === 1 && contentParts[0]?.type === 'text'
                  ? contentParts[0].text
                  : contentParts.map((part) =>
                        part.type === 'text'
                            ? {
                                  type: 'text' as const,
                                  text: part.text,
                              }
                            : {
                                  type: 'image_url' as const,
                                  image_url: {
                                      url: part.dataUrl,
                                  },
                              }
                    );

        messages.push({
            role: message.role,
            content,
            ...(toolCallParts.length > 0
                ? {
                      tool_calls: toolCallParts.map((part) => ({
                          id: part.callId,
                          type: 'function' as const,
                          function: {
                              name: part.toolName,
                              arguments: part.argumentsText,
                          },
                      })),
                  }
                : {}),
        });
    }

    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        messages,
        stream: true,
        stream_options: {
            include_usage: true,
        },
    };

    if (input.tools && input.tools.length > 0) {
        body['tools'] = input.tools.map((tool) => ({
            type: 'function',
            function: {
                name: tool.id,
                description: tool.description,
                parameters: tool.inputSchema,
            },
        }));
        body['tool_choice'] = input.toolChoice ?? 'auto';
    }

    return body;
}
