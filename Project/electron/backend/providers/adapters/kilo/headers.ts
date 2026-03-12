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
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

export function resolveKiloRuntimeAuthToken(input: ProviderRuntimeInput): ProviderAdapterResult<string> {
    const token = input.accessToken ?? input.apiKey;
    if (!token) {
        return errProviderAdapter('auth_missing', 'Kilo runtime execution requires access token or API key.');
    }

    return okProviderAdapter(token);
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

export function buildKiloRuntimeHeaders(input: {
    token: string;
    organizationId?: string;
    modelId: string;
    cacheKey?: string;
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

    return headers;
}

export function buildKiloRuntimeBody(input: ProviderRuntimeInput): Record<string, unknown> {
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
    const body: Record<string, unknown> = {
        model: input.modelId,
        messages: contextMessages.map((message) => ({
            role: message.role,
            content:
                message.parts.length === 1 && message.parts[0]?.type === 'text'
                    ? message.parts[0].text
                    : message.parts.map((part) =>
                          part.type === 'text'
                              ? {
                                    type: 'text',
                                    text: part.text,
                                }
                              : {
                                    type: 'image_url',
                                    image_url: {
                                        url: part.dataUrl,
                                    },
                                }
                      ),
        })),
        stream: true,
        stream_options: {
            include_usage: true,
        },
    };

    if (effort || input.runtimeOptions.reasoning.summary !== 'none') {
        body['reasoning'] = {
            summary: input.runtimeOptions.reasoning.summary,
            ...(effort ? { effort } : {}),
        };
    }

    if (input.kiloRouting) {
        if (input.kiloRouting.mode === 'dynamic') {
            if (input.kiloRouting.sort !== 'default') {
                body['provider'] = {
                    sort: input.kiloRouting.sort,
                };
            }
        } else {
            body['provider'] = {
                order: [input.kiloRouting.providerId],
                only: [input.kiloRouting.providerId],
                allow_fallbacks: false,
            };
        }
    }

    return body;
}
