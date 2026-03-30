import { errProviderAdapter, okProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import { normalizeGeminiUsageMetadata, parseGeminiDirectPart } from '@/app/backend/providers/adapters/geminiFamilyCore';
import { isRecord, readOptionalString } from '@/app/backend/providers/adapters/geminiShared';
import { type RuntimeParsedCompletion, type RuntimeParsedPart } from '@/app/backend/providers/adapters/runtimePayload';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import {
    consumeStrictServerSentEvents,
    type StrictServerSentEventFrame,
} from '@/app/backend/providers/adapters/strictServerSentEvents';
import type {
    ProviderRuntimeHandlers,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';

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
        ...(Object.keys(parsed.value.usage).length > 0 ? { usage: parsed.value.usage } : {}),
    });
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
