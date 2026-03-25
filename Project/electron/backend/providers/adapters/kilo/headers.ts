import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    DEFAULT_CLIENT_VERSION,
    DEFAULT_EDITOR_NAME,
    HEADER_EDITOR_NAME,
    HEADER_MODE,
    HEADER_ORGANIZATION_ID,
    HEADER_TASK_ID,
} from '@/app/backend/providers/kiloGatewayClient/constants';
import type { ProviderRuntimeInput, ProviderRoutedApiFamily } from '@/app/backend/providers/types';

export function resolveKiloRuntimeAuthToken(input: ProviderRuntimeInput): ProviderAdapterResult<string> {
    const token = input.accessToken ?? input.apiKey;
    if (!token) {
        return errProviderAdapter('auth_missing', 'Kilo runtime execution requires access token or API key.');
    }

    return okProviderAdapter(token);
}

export function mapReasoningEffort(
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

export function buildKiloRuntimeHeaders(input: {
    token: string;
    organizationId?: string;
    modelId: string;
    cacheKey?: string;
    routedApiFamily?: ProviderRoutedApiFamily;
}): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${input.token}`,
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
        'User-Agent': 'neonconductor-gateway-client',
        [HEADER_EDITOR_NAME]: DEFAULT_EDITOR_NAME,
        'X-NeonConductor-Client-Version': DEFAULT_CLIENT_VERSION,
    };

    if (input.organizationId) {
        headers[HEADER_ORGANIZATION_ID] = input.organizationId;
    }

    if (input.modelId === 'kilo/auto') {
        headers[HEADER_MODE] = 'code';
    }

    if (input.cacheKey) {
        headers[HEADER_TASK_ID] = input.cacheKey;
    }

    if (input.routedApiFamily === 'anthropic_messages') {
        headers['x-anthropic-beta'] = 'fine-grained-tool-streaming-2025-05-14';
    }

    return headers;
}

export function buildKiloProviderPreferences(input: ProviderRuntimeInput): Record<string, unknown> | undefined {
    let providerPreferences: Record<string, unknown> | undefined;

    if (input.kiloRouting) {
        if (input.kiloRouting.mode === 'dynamic') {
            if (input.kiloRouting.sort !== 'default') {
                providerPreferences = {
                    sort: input.kiloRouting.sort,
                };
            }
        } else {
            providerPreferences = {
                order: [input.kiloRouting.providerId],
                only: [input.kiloRouting.providerId],
                allow_fallbacks: false,
            };
        }
    }

    if (
        input.tools &&
        input.tools.length > 0 &&
        input.runtime.toolProtocol === 'kilo_gateway' &&
        (input.runtime.routedApiFamily === 'anthropic_messages' ||
            input.runtime.routedApiFamily === 'google_generativeai')
    ) {
        providerPreferences = {
            ...(providerPreferences ?? {}),
            require_parameters: true,
        };
    }

    return providerPreferences;
}

export function buildKiloRuntimeBody(input: ProviderRuntimeInput): Record<string, unknown> {
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

    const effort = mapReasoningEffort(input.runtimeOptions.reasoning.effort);
    const contextMessages =
        input.contextMessages && input.contextMessages.length > 0
            ? input.contextMessages
            : [
                  {
                      role: 'user' as const,
                      parts: [
                          {
                              type: 'text' as const,
                              text: input.promptText,
                          },
                      ],
                  },
              ];
    const messages: ChatCompletionRequestMessage[] = [];
    for (const message of contextMessages) {
        if (message.role === 'tool') {
            const toolMessages = message.parts
                .filter(
                    (
                        part
                    ): part is Extract<(typeof message.parts)[number], { type: 'tool_result' }> =>
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
            (
                part
            ): part is Extract<(typeof message.parts)[number], { type: 'text' | 'image' }> =>
                part.type === 'text' || part.type === 'image'
        );
        const toolCallParts = message.parts.filter(
            (
                part
            ): part is Extract<(typeof message.parts)[number], { type: 'tool_call' }> => part.type === 'tool_call'
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
        model: input.modelId,
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

    if (effort || input.runtimeOptions.reasoning.summary !== 'none') {
        body['reasoning'] = {
            summary: input.runtimeOptions.reasoning.summary,
            ...(effort ? { effort } : {}),
        };
    }

    const providerPreferences = buildKiloProviderPreferences(input);
    if (providerPreferences) {
        body['provider'] = providerPreferences;
    }

    return body;
}
