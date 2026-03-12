import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    buildGeminiCompatibilityMessages,
    extractBase64Data,
    isRecord,
    readOptionalString,
    type GeminiCompatibilityMessage,
    type GeminiReasoningDetail,
} from '@/app/backend/providers/adapters/geminiShared';
import {
    normalizeGeminiUsageMetadata,
    parseGeminiDirectPart,
} from '@/app/backend/providers/adapters/geminiFamilyCore';
import {
    type RuntimeParsedCompletion,
    type RuntimeParsedPart,
} from '@/app/backend/providers/adapters/runtimePayload';
import { consumeStrictServerSentEvents, type StrictServerSentEventFrame } from '@/app/backend/providers/adapters/strictServerSentEvents';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import { streamDirectFamilyRuntimeWithHandler } from '@/app/backend/providers/adapters/directFamily/shell';
import type {
    DirectFamilyRuntimeConfig,
    DirectFamilyRuntimeHandler,
} from '@/app/backend/providers/adapters/directFamily/types';
import type {
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';

const DEFAULT_GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

interface DirectGeminiStreamState {
    emittedToolCallIds: Set<string>;
    nextSyntheticToolCallIndex: number;
    terminalFrameSeen: boolean;
}

interface DirectGeminiStreamEventResult {
    parts: RuntimeParsedPart[];
    usage?: ProviderRuntimeUsage;
    stop?: boolean;
}

function normalizeBaseUrl(baseUrl: string): string {
    return baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
}

function toUpstreamModelId(modelId: string, modelPrefix: string): string {
    return modelId.startsWith(modelPrefix) ? modelId.slice(modelPrefix.length) : modelId;
}

export function isGeminiCompatibleBaseUrl(baseUrl: string | null): boolean {
    if (!baseUrl) {
        return false;
    }

    try {
        const url = new URL(baseUrl);
        const hostname = url.hostname.toLowerCase();
        const pathname = url.pathname.toLowerCase();
        return (
            hostname.includes('generativelanguage.googleapis.com') ||
            pathname.includes('generativelanguage') ||
            (hostname.includes('googleapis') && pathname.includes('/v1'))
        );
    } catch {
        return false;
    }
}

export function supportsDirectGeminiRuntimeContext(input: {
    providerId: ProviderRuntimeInput['providerId'];
    resolvedBaseUrl: string | null;
}): boolean {
    return input.providerId !== 'kilo' && isGeminiCompatibleBaseUrl(input.resolvedBaseUrl);
}

function resolveGeminiRequestUrl(baseUrl: string, modelId: string, stream: boolean): string {
    const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
    const encodedModelId = encodeURIComponent(modelId);

    if (normalizedBaseUrl.includes(':generateContent') || normalizedBaseUrl.includes(':streamGenerateContent')) {
        const rewrittenBaseUrl = normalizedBaseUrl.replace(
            /:streamGenerateContent(?:\?alt=sse)?$|:generateContent$/u,
            stream ? ':streamGenerateContent' : ':generateContent'
        );
        return stream ? `${rewrittenBaseUrl}?alt=sse` : rewrittenBaseUrl;
    }

    const modelBaseUrl = normalizedBaseUrl.endsWith('/models')
        ? `${normalizedBaseUrl}/${encodedModelId}`
        : `${normalizedBaseUrl}/models/${encodedModelId}`;
    return stream ? `${modelBaseUrl}:streamGenerateContent?alt=sse` : `${modelBaseUrl}:generateContent`;
}

function mapReasoningBudget(effort: ProviderRuntimeInput['runtimeOptions']['reasoning']['effort']): number | undefined {
    switch (effort) {
        case 'minimal':
            return 1024;
        case 'low':
            return 2048;
        case 'medium':
            return 4096;
        case 'high':
            return 8192;
        case 'xhigh':
            return 16384;
        default:
            return undefined;
    }
}

function buildGeminiSystemInstruction(
    contextMessages: NonNullable<ProviderRuntimeInput['contextMessages']> | undefined
): Record<string, unknown> | undefined {
    if (!contextMessages) {
        return undefined;
    }

    const text = contextMessages
        .flatMap((message) =>
            message.role !== 'system'
                ? []
                : message.parts.flatMap((part) => (part.type === 'text' ? [part.text] : []))
        )
        .join('\n\n')
        .trim();

    return text.length > 0
        ? {
              parts: [{ text }],
          }
        : undefined;
}

function parseJsonValue(input: string): unknown {
    try {
        return JSON.parse(input);
    } catch {
        return {
            input: input,
        };
    }
}

function toGeminiFunctionResponse(outputText: string): Record<string, unknown> {
    const parsed = parseJsonValue(outputText);
    if (isRecord(parsed)) {
        return parsed;
    }

    return {
        output: parsed,
    };
}

function extractReasoningSignature(details: GeminiReasoningDetail[]): string | undefined {
    for (const detail of details) {
        if (typeof detail.data === 'string' && detail.data.length > 0) {
            return detail.data;
        }
        if (typeof detail.signature === 'string' && detail.signature.length > 0) {
            return detail.signature;
        }
    }

    return undefined;
}

function toGeminiThoughtParts(details: GeminiReasoningDetail[]): Array<Record<string, unknown>> {
    const parts: Array<Record<string, unknown>> = [];
    for (const detail of details) {
        const text = detail.summary ?? detail.text;
        if (!text) {
            continue;
        }

        parts.push({
            text,
            thought: true,
        });
    }

    return parts;
}

function toGeminiContentParts(
    content: Exclude<GeminiCompatibilityMessage, { role: 'tool' }>['content']
): Array<Record<string, unknown>> {
    if (typeof content === 'string') {
        return content.length > 0 ? [{ text: content }] : [];
    }

    if (!Array.isArray(content)) {
        return [];
    }

    const parts: Array<Record<string, unknown>> = [];
    for (const part of content) {
        if (part.type === 'text') {
            parts.push({ text: part.text });
            continue;
        }

        const base64Data = extractBase64Data(part.image_url.url);
        if (!base64Data) {
            continue;
        }

        const mimeMatch = /^data:([^;]+);base64,/u.exec(part.image_url.url);
        parts.push({
            inlineData: {
                mimeType: mimeMatch?.[1] ?? 'image/png',
                data: base64Data,
            },
        });
    }

    return parts;
}

function buildDirectGeminiAssistantParts(message: Exclude<GeminiCompatibilityMessage, { role: 'tool' | 'system' | 'user' }>): Array<Record<string, unknown>> {
    const parts = toGeminiContentParts(message.content);
    const reasoningDetails = message.reasoning_details ?? [];
    const unmatchedDetails = reasoningDetails.filter((detail) => !detail.id);
    parts.push(...toGeminiThoughtParts(unmatchedDetails));

    for (const toolCall of message.tool_calls ?? []) {
        const matchingDetails = reasoningDetails.filter((detail) => detail.id === toolCall.id);
        parts.push(...toGeminiThoughtParts(matchingDetails));
        parts.push({
            functionCall: {
                name: toolCall.function.name,
                args: parseJsonValue(toolCall.function.arguments),
            },
            ...(extractReasoningSignature(matchingDetails)
                ? { thoughtSignature: extractReasoningSignature(matchingDetails) }
                : {}),
        });
    }

    return parts;
}

function buildDirectGeminiContents(input: ProviderRuntimeInput): Array<Record<string, unknown>> {
    const messages = buildGeminiCompatibilityMessages(input);
    const toolNameByCallId = new Map<string, string>();
    for (const message of input.contextMessages ?? []) {
        for (const part of message.parts) {
            if (part.type === 'tool_result') {
                toolNameByCallId.set(part.callId, part.toolName);
            }
        }
    }
    const contents: Array<Record<string, unknown>> = [];

    for (const message of messages) {
        if (message.role === 'system') {
            continue;
        }

        if (message.role === 'tool') {
            contents.push({
                role: 'tool',
                parts: [
                    {
                        functionResponse: {
                            name: toolNameByCallId.get(message.tool_call_id) ?? 'tool',
                            response: toGeminiFunctionResponse(message.content),
                        },
                    },
                ],
            });
            continue;
        }

        if (message.role === 'assistant') {
            const parts = buildDirectGeminiAssistantParts(message);
            if (parts.length === 0) {
                continue;
            }

            contents.push({
                role: 'model',
                parts,
            });
            continue;
        }

        const parts = toGeminiContentParts(message.content);
        if (parts.length === 0) {
            continue;
        }

        contents.push({
            role: 'user',
            parts,
        });
    }

    return contents;
}

export function buildDirectGeminiBody(
    input: ProviderRuntimeInput,
    modelPrefix: string
): Record<string, unknown> {
    const body: Record<string, unknown> = {
        model: toUpstreamModelId(input.modelId, modelPrefix),
        contents: buildDirectGeminiContents(input),
    };

    const systemInstruction = buildGeminiSystemInstruction(input.contextMessages);
    if (systemInstruction) {
        body['systemInstruction'] = systemInstruction;
    }

    if (input.tools && input.tools.length > 0) {
        body['tools'] = [
            {
                functionDeclarations: input.tools.map((tool) => ({
                    name: tool.id,
                    description: tool.description,
                    parameters: tool.inputSchema,
                })),
            },
        ];
        body['toolConfig'] = {
            functionCallingConfig: {
                mode: 'AUTO',
            },
        };
    }

    const includeThoughts =
        input.runtimeOptions.reasoning.summary !== 'none' ||
        input.runtimeOptions.reasoning.includeEncrypted ||
        (input.tools?.length ?? 0) > 0;
    const thinkingBudget = mapReasoningBudget(input.runtimeOptions.reasoning.effort);
    if (includeThoughts || thinkingBudget !== undefined) {
        body['generationConfig'] = {
            thinkingConfig: {
                ...(includeThoughts ? { includeThoughts: true } : {}),
                ...(thinkingBudget !== undefined ? { thinkingBudget } : {}),
            },
        };
    }

    return body;
}

function parseDirectGeminiResponseObject(input: {
    payload: unknown;
    includeEncrypted: boolean;
    state: DirectGeminiStreamState;
}): ProviderAdapterResult<RuntimeParsedCompletion> {
    if (!isRecord(input.payload)) {
        return errProviderAdapter('invalid_payload', 'Invalid Direct Gemini payload.');
    }

    if (isRecord(input.payload['error'])) {
        const errorRecord = input.payload['error'];
        const message = readOptionalString(errorRecord['message']) ?? 'Gemini request failed.';
        return errProviderAdapter('provider_request_failed', message);
    }

    const parts: RuntimeParsedPart[] = [];
    const candidates = Array.isArray(input.payload['candidates']) ? input.payload['candidates'] : [];
    for (const candidate of candidates) {
        if (!isRecord(candidate)) {
            continue;
        }

        const content = isRecord(candidate['content']) ? candidate['content'] : undefined;
        const rawParts = Array.isArray(content?.['parts']) ? content['parts'] : [];
        for (const rawPart of rawParts) {
            if (!isRecord(rawPart)) {
                continue;
            }

            const parsedPart = parseGeminiDirectPart({
                part: rawPart,
                includeEncrypted: input.includeEncrypted,
                state: input.state,
                sourceLabel: 'Direct Gemini payload',
            });
            if (parsedPart.isErr()) {
                return errProviderAdapter(parsedPart.error.code, parsedPart.error.message);
            }

            parts.push(...parsedPart.value);
        }
    }

    return okProviderAdapter({
        parts,
        usage: normalizeGeminiUsageMetadata(input.payload['usageMetadata']) ?? {},
    });
}

export function parseDirectGeminiPayload(input: {
    payload: unknown;
    includeEncrypted: boolean;
}): ProviderAdapterResult<RuntimeParsedCompletion> {
    return parseDirectGeminiResponseObject({
        payload: input.payload,
        includeEncrypted: input.includeEncrypted,
        state: {
            emittedToolCallIds: new Set(),
            nextSyntheticToolCallIndex: 0,
            terminalFrameSeen: false,
        },
    });
}

export async function emitDirectGeminiPayload(input: {
    payload: unknown;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const parsed = parseDirectGeminiPayload({
        payload: input.payload,
        includeEncrypted: input.includeEncrypted,
    });
    if (parsed.isErr()) {
        return errProviderAdapter(parsed.error.code, parsed.error.message);
    }

    return emitParsedCompletion(parsed.value, input.handlers, input.startedAt);
}

function parseDirectGeminiStreamFrame(input: {
    frame: StrictServerSentEventFrame;
    state: DirectGeminiStreamState;
    includeEncrypted: boolean;
}): ProviderAdapterResult<DirectGeminiStreamEventResult> {
    if (input.frame.data === '[DONE]') {
        if (input.state.terminalFrameSeen) {
            return errProviderAdapter('invalid_payload', 'Direct Gemini stream received duplicate terminal frames.');
        }

        input.state.terminalFrameSeen = true;
        return okProviderAdapter({
            parts: [],
            stop: true,
        });
    }

    let payload: unknown;
    try {
        payload = JSON.parse(input.frame.data);
    } catch {
        return errProviderAdapter('invalid_payload', 'Direct Gemini stream frame contained invalid JSON payload.');
    }

    if (!isRecord(payload)) {
        return errProviderAdapter('invalid_payload', 'Direct Gemini stream frame payload must be an object.');
    }

    const parsed = parseDirectGeminiResponseObject({
        payload,
        includeEncrypted: input.includeEncrypted,
        state: input.state,
    });
    if (parsed.isErr()) {
        return errProviderAdapter(parsed.error.code, parsed.error.message);
    }

    return okProviderAdapter({
        parts: parsed.value.parts,
        ...(parsed.value.usage && Object.keys(parsed.value.usage).length > 0 ? { usage: parsed.value.usage } : {}),
    });
}

function validateDirectGeminiAuth(input: {
    runtimeInput: ProviderRuntimeInput;
    config: DirectFamilyRuntimeConfig;
}): ProviderAdapterResult<void> {
    if (!input.runtimeInput.apiKey) {
        return errProviderAdapter(
            'auth_missing',
            `${input.config.label} Gemini runtime requires an API key.`
        );
    }

    return okProviderAdapter(undefined);
}

function buildDirectGeminiRequest(input: {
    runtimeInput: ProviderRuntimeInput;
    config: DirectFamilyRuntimeConfig;
    resolvedBaseUrl: string;
    stream: boolean;
}): {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
} {
    const upstreamModelId = toUpstreamModelId(input.runtimeInput.modelId, input.config.modelPrefix);
    const requestBody = buildDirectGeminiBody(input.runtimeInput, input.config.modelPrefix);
    const resolvedBaseUrl = input.resolvedBaseUrl ?? DEFAULT_GEMINI_BASE_URL;

    return {
        url: resolveGeminiRequestUrl(resolvedBaseUrl, upstreamModelId, input.stream),
        headers: {
            'x-goog-api-key': input.runtimeInput.apiKey!,
            Accept: 'text/event-stream, application/json',
            'Content-Type': 'application/json',
        },
        body: requestBody,
    };
}

export async function consumeDirectGeminiStreamResponse(input: {
    response: Response;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
    includeEncrypted: boolean;
}): Promise<ProviderAdapterResult<void>> {
    const state: DirectGeminiStreamState = {
        emittedToolCallIds: new Set(),
        nextSyntheticToolCallIndex: 0,
        terminalFrameSeen: false,
    };

    const streamed = await consumeStrictServerSentEvents({
        response: input.response,
        sourceLabel: 'Direct Gemini stream',
        onFrame: async (frame) => {
            const parsed = parseDirectGeminiStreamFrame({
                frame,
                state,
                includeEncrypted: input.includeEncrypted,
            });
            if (parsed.isErr()) {
                return errProviderAdapter(parsed.error.code, parsed.error.message);
            }

            for (const part of parsed.value.parts) {
                await input.handlers.onPart(part);
            }

            if (parsed.value.usage && input.handlers.onUsage) {
                await input.handlers.onUsage({
                    ...parsed.value.usage,
                    latencyMs: Date.now() - input.startedAt,
                });
            }

            return okProviderAdapter(parsed.value.stop === true);
        },
    });
    if (streamed.isErr()) {
        return errProviderAdapter(streamed.error.code, streamed.error.message);
    }

    return okProviderAdapter(undefined);
}

export const directGeminiRuntimeHandler: DirectFamilyRuntimeHandler = {
    toolProtocol: 'google_generativeai',
    familyLabel: 'Gemini',
    supportsContext: supportsDirectGeminiRuntimeContext,
    incompatibleContextMessage: ({ runtimeInput, config }) =>
        `Model "${runtimeInput.modelId}" requires a Gemini-compatible base URL on provider "${config.providerId}".`,
    validateAuth: validateDirectGeminiAuth,
    buildRequest: buildDirectGeminiRequest,
    consumeStreamResponse: consumeDirectGeminiStreamResponse,
    emitPayload: emitDirectGeminiPayload,
};

export async function streamDirectGeminiRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: DirectFamilyRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    return streamDirectFamilyRuntimeWithHandler(input, handlers, config, directGeminiRuntimeHandler);
}
