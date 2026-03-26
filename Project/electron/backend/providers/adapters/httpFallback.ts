import { err, ok, type Result } from 'neverthrow';

import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterErrorCode,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { isEventStreamResponse } from '@/app/backend/providers/adapters/streaming';

export interface HttpRuntimeRequest {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
}

export type HttpFallbackFailureStage = 'request' | 'request_fallback' | 'stream_parse' | 'payload_parse';

export interface HttpFallbackFailure {
    stage: HttpFallbackFailureStage;
    code: ProviderAdapterErrorCode;
    message: string;
}

export type HttpFallbackResult = Result<void, HttpFallbackFailure>;

export interface ExecuteHttpFallbackInput {
    signal: AbortSignal;
    streamRequest: HttpRuntimeRequest;
    fallbackRequest?: HttpRuntimeRequest;
    consumeStreamResponse: (response: Response) => Promise<ProviderAdapterResult<void>>;
    emitPayload: (payload: unknown) => Promise<ProviderAdapterResult<void>>;
    formatHttpFailure: (input: { response: Response; stage: 'request' | 'request_fallback' }) => string;
}

function shouldRetryWithoutStreaming(status: number): boolean {
    return status === 400 || status === 404 || status === 405 || status === 415 || status === 422;
}

async function executeJsonRequest(input: {
    request: HttpRuntimeRequest;
    signal: AbortSignal;
}): Promise<ProviderAdapterResult<Response>> {
    try {
        const response = await fetch(input.request.url, {
            method: 'POST',
            headers: input.request.headers,
            body: JSON.stringify(input.request.body),
            signal: input.signal,
        });

        return okProviderAdapter(response);
    } catch (error) {
        return errProviderAdapter(
            'provider_request_unavailable',
            error instanceof Error ? error.message : 'Provider runtime request failed before receiving a response.'
        );
    }
}

async function readJsonPayload(response: Response): Promise<unknown> {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

export async function executeHttpFallback(input: ExecuteHttpFallbackInput): Promise<HttpFallbackResult> {
    const streamResponse = await executeJsonRequest({
        request: input.streamRequest,
        signal: input.signal,
    });
    if (streamResponse.isErr()) {
        return err({
            stage: 'request',
            code: streamResponse.error.code,
            message: streamResponse.error.message,
        });
    }

    let response = streamResponse.value;
    if (!response.ok) {
        if (!shouldRetryWithoutStreaming(response.status) || !input.fallbackRequest) {
            return err({
                stage: 'request',
                code: 'provider_request_failed',
                message: input.formatHttpFailure({
                    response,
                    stage: 'request',
                }),
            });
        }

        const fallbackResponse = await executeJsonRequest({
            request: input.fallbackRequest,
            signal: input.signal,
        });
        if (fallbackResponse.isErr()) {
            return err({
                stage: 'request_fallback',
                code: fallbackResponse.error.code,
                message: fallbackResponse.error.message,
            });
        }

        response = fallbackResponse.value;
        if (!response.ok) {
            return err({
                stage: 'request_fallback',
                code: 'provider_request_failed',
                message: input.formatHttpFailure({
                    response,
                    stage: 'request_fallback',
                }),
            });
        }
    }

    if (isEventStreamResponse(response)) {
        const streamed = await input.consumeStreamResponse(response);
        if (streamed.isErr()) {
            return err({
                stage: 'stream_parse',
                code: streamed.error.code,
                message: streamed.error.message,
            });
        }

        return ok(undefined);
    }

    const payload = await readJsonPayload(response);
    const emitted = await input.emitPayload(payload);
    if (emitted.isErr()) {
        return err({
            stage: 'payload_parse',
            code: emitted.error.code,
            message: emitted.error.message,
        });
    }

    return ok(undefined);
}
