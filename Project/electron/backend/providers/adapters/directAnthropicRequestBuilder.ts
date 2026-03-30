import type { DirectFamilyRuntimeConfig } from '@/app/backend/providers/adapters/directFamily/types';
import { errProviderAdapter, okProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

const ANTHROPIC_API_VERSION = '2023-06-01';
const ANTHROPIC_TOOL_STREAMING_BETA = 'fine-grained-tool-streaming-2025-05-14';
const ANTHROPIC_THINKING_BETA = 'interleaved-thinking-2025-05-14';
const DEFAULT_ANTHROPIC_MAX_TOKENS = 8_192;

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function toUpstreamModelId(modelId: string, modelPrefix: string): string {
    return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}

export function isAnthropicCompatibleBaseUrl(baseUrl: string | null): boolean {
    if (!baseUrl) {
        return false;
    }

    try {
        const url = new URL(baseUrl);
        return url.hostname.toLowerCase().includes('anthropic');
    } catch {
        return false;
    }
}

export function supportsDirectAnthropicRuntimeContext(input: {
    providerId: ProviderRuntimeInput['providerId'];
    resolvedBaseUrl: string | null;
}): boolean {
    return input.providerId !== 'kilo' && isAnthropicCompatibleBaseUrl(input.resolvedBaseUrl);
}

function resolveAnthropicMessagesUrl(baseUrl: string): string {
    const normalized = normalizeBaseUrl(baseUrl);
    if (normalized.endsWith('/v1/messages') || normalized.endsWith('/messages')) {
        return normalized;
    }
    if (normalized.endsWith('/v1')) {
        return `${normalized}/messages`;
    }
    return `${normalized}/v1/messages`;
}

function mapReasoningBudget(effort: ProviderRuntimeInput['runtimeOptions']['reasoning']['effort']): number | undefined {
    switch (effort) {
        case 'minimal':
            return 1_024;
        case 'low':
            return 2_048;
        case 'medium':
            return 4_096;
        case 'high':
            return 8_192;
        case 'xhigh':
            return 16_384;
        default:
            return undefined;
    }
}

function extractBase64Data(dataUrl: string): string | null {
    const match = /^data:([^;]+);base64,(.+)$/u.exec(dataUrl);
    return match?.[2] ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function buildAnthropicSystemPrompt(input: NonNullable<ProviderRuntimeInput['contextMessages']>): string | undefined {
    const chunks = input.flatMap((message) =>
        message.role !== 'system' ? [] : message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
    );
    const content = chunks.join('\n\n').trim();
    return content.length > 0 ? content : undefined;
}

function toAnthropicReasoningBlock(
    part: Extract<
        NonNullable<ProviderRuntimeInput['contextMessages']>[number]['parts'][number],
        { type: 'reasoning' | 'reasoning_encrypted' }
    >
): Record<string, unknown> | null {
    if (part.type === 'reasoning') {
        if (!part.detailSignature) {
            return null;
        }

        return {
            type: 'thinking',
            thinking: part.text,
            signature: part.detailSignature,
        };
    }

    return {
        type: 'redacted_thinking',
        data: part.opaque,
    };
}

function buildAnthropicMessageContent(
    message: NonNullable<ProviderRuntimeInput['contextMessages']>[number]
): Array<Record<string, unknown>> {
    const contentBlocks: Array<Record<string, unknown>> = [];

    for (const part of message.parts) {
        if (part.type === 'text') {
            contentBlocks.push({
                type: 'text',
                text: part.text,
            });
            continue;
        }

        if (part.type === 'image') {
            const base64Data = extractBase64Data(part.dataUrl);
            if (!base64Data) {
                continue;
            }

            contentBlocks.push({
                type: 'image',
                source: {
                    type: 'base64',
                    media_type: part.mimeType,
                    data: base64Data,
                },
            });
            continue;
        }

        if (part.type === 'tool_call') {
            let parsedInput: unknown;
            try {
                parsedInput = JSON.parse(part.argumentsText);
            } catch {
                continue;
            }
            if (!isRecord(parsedInput)) {
                continue;
            }

            contentBlocks.push({
                type: 'tool_use',
                id: part.callId,
                name: part.toolName,
                input: parsedInput,
            });
            continue;
        }

        if (part.type === 'tool_result') {
            contentBlocks.push({
                type: 'tool_result',
                tool_use_id: part.callId,
                is_error: part.isError,
                content: [
                    {
                        type: 'text',
                        text: part.outputText,
                    },
                ],
            });
            continue;
        }

        if (part.type === 'reasoning' || part.type === 'reasoning_encrypted') {
            const reasoningBlock = toAnthropicReasoningBlock(part);
            if (reasoningBlock) {
                contentBlocks.push(reasoningBlock);
            }
        }
    }

    return contentBlocks;
}

function buildAnthropicMessages(input: ProviderRuntimeInput): Array<{
    role: 'user' | 'assistant';
    content: string | Array<Record<string, unknown>>;
}> {
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

    const messages: Array<{ role: 'user' | 'assistant'; content: string | Array<Record<string, unknown>> }> = [];
    for (const message of contextMessages) {
        if (message.role === 'system') {
            continue;
        }

        const content = buildAnthropicMessageContent(message);
        if (content.length === 0) {
            continue;
        }

        messages.push({
            role: message.role === 'assistant' ? 'assistant' : 'user',
            content:
                content.length === 1 && content[0]?.['type'] === 'text' && typeof content[0]['text'] === 'string'
                    ? (content[0]['text'] as string)
                    : content,
        });
    }

    return messages;
}

export function buildDirectAnthropicBody(input: ProviderRuntimeInput, modelPrefix: string): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        max_tokens: DEFAULT_ANTHROPIC_MAX_TOKENS,
        stream: true,
        messages: buildAnthropicMessages(input),
    };

    const system = input.contextMessages ? buildAnthropicSystemPrompt(input.contextMessages) : undefined;
    if (system) {
        body['system'] = system;
    }

    if (input.tools && input.tools.length > 0) {
        body['tools'] = input.tools.map((tool) => ({
            name: tool.id,
            description: tool.description,
            input_schema: tool.inputSchema,
        }));
        body['tool_choice'] = {
            type: input.toolChoice ?? 'auto',
        };
    }

    const thinkingBudget = mapReasoningBudget(input.runtimeOptions.reasoning.effort);
    if (thinkingBudget !== undefined) {
        body['thinking'] = {
            type: 'enabled',
            budget_tokens: thinkingBudget,
        };
    }

    return body;
}

function buildAnthropicBetaHeader(input: ProviderRuntimeInput): string | undefined {
    const betas: string[] = [];
    if (input.tools && input.tools.length > 0) {
        betas.push(ANTHROPIC_TOOL_STREAMING_BETA);
    }
    if (mapReasoningBudget(input.runtimeOptions.reasoning.effort) !== undefined) {
        betas.push(ANTHROPIC_THINKING_BETA);
    }

    return betas.length > 0 ? betas.join(',') : undefined;
}

export function validateDirectAnthropicAuth(input: {
    runtimeInput: ProviderRuntimeInput;
    config: DirectFamilyRuntimeConfig;
}): ProviderAdapterResult<void> {
    if (!input.runtimeInput.apiKey) {
        return errProviderAdapter('auth_missing', `${input.config.label} Anthropic runtime requires an API key.`);
    }

    return okProviderAdapter(undefined);
}

export function buildDirectAnthropicRequest(input: {
    runtimeInput: ProviderRuntimeInput;
    config: DirectFamilyRuntimeConfig;
    resolvedBaseUrl: string;
    stream: boolean;
}): {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
} {
    const apiKey = input.runtimeInput.apiKey;
    if (!apiKey) {
        throw new Error('Anthropic direct runtime requires an API key.');
    }
    const headers: Record<string, string> = {
        'x-api-key': apiKey,
        'anthropic-version': ANTHROPIC_API_VERSION,
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
    };
    const betaHeader = buildAnthropicBetaHeader(input.runtimeInput);
    if (betaHeader) {
        headers['x-anthropic-beta'] = betaHeader;
    }

    return {
        url: resolveAnthropicMessagesUrl(input.resolvedBaseUrl),
        headers,
        body: {
            ...buildDirectAnthropicBody(input.runtimeInput, input.config.modelPrefix),
            stream: input.stream,
        },
    };
}
