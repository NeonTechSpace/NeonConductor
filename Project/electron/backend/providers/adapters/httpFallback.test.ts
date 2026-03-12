import { describe, expect, it, vi } from 'vitest';

import { errProviderAdapter, okProviderAdapter } from '@/app/backend/providers/adapters/errors';
import { executeHttpFallback } from '@/app/backend/providers/adapters/httpFallback';

describe('executeHttpFallback', () => {
    it('retries with the fallback request only on supported non-stream statuses', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response('{}', {
                    status: 400,
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            )
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ ok: true }), {
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            );
        vi.stubGlobal('fetch', fetchMock);

        const consumeStreamResponse = vi.fn();
        const emitPayload = vi.fn().mockResolvedValue(okProviderAdapter(undefined));

        const result = await executeHttpFallback({
            signal: new AbortController().signal,
            streamRequest: {
                url: 'https://example.test/stream',
                headers: { Authorization: 'Bearer token' },
                body: { stream: true },
            },
            fallbackRequest: {
                url: 'https://example.test/stream',
                headers: { Authorization: 'Bearer token' },
                body: { stream: false },
            },
            consumeStreamResponse,
            emitPayload,
            formatHttpFailure: ({ response }) => `failed: ${String(response.status)}`,
        });

        expect(result.isOk()).toBe(true);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(consumeStreamResponse).not.toHaveBeenCalled();
        expect(emitPayload).toHaveBeenCalledTimes(1);
        expect(fetchMock.mock.calls[1]?.[1]).toMatchObject({
            body: JSON.stringify({ stream: false }),
        });
    });

    it('fails closed without retry when no fallback request is available', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('{}', {
                    status: 400,
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            )
        );

        const result = await executeHttpFallback({
            signal: new AbortController().signal,
            streamRequest: {
                url: 'https://example.test/stream',
                headers: {},
                body: { stream: true },
            },
            consumeStreamResponse: vi.fn(),
            emitPayload: vi.fn().mockResolvedValue(okProviderAdapter(undefined)),
            formatHttpFailure: ({ response }) => `failed: ${String(response.status)}`,
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected request without fallback to fail closed.');
        }
        expect(result.error.stage).toBe('request');
        expect(result.error.code).toBe('provider_request_failed');
        expect(result.error.message).toBe('failed: 400');
    });

    it('returns payload-parse failures without invoking the stream consumer', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('{}', {
                    status: 200,
                    headers: {
                        'content-type': 'application/json',
                    },
                })
            )
        );

        const consumeStreamResponse = vi.fn();
        const emitPayload = vi.fn().mockResolvedValue(errProviderAdapter('invalid_payload', 'bad payload'));

        const result = await executeHttpFallback({
            signal: new AbortController().signal,
            streamRequest: {
                url: 'https://example.test/stream',
                headers: {},
                body: { stream: true },
            },
            consumeStreamResponse,
            emitPayload,
            formatHttpFailure: ({ response }) => `failed: ${String(response.status)}`,
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected payload parse failure.');
        }
        expect(result.error.stage).toBe('payload_parse');
        expect(result.error.code).toBe('invalid_payload');
        expect(consumeStreamResponse).not.toHaveBeenCalled();
        expect(emitPayload).toHaveBeenCalledTimes(1);
    });

    it('routes event-stream responses only through the stream consumer', async () => {
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue(
                new Response('data: [DONE]\n\n', {
                    status: 200,
                    headers: {
                        'content-type': 'text/event-stream',
                    },
                })
            )
        );

        const consumeStreamResponse = vi.fn().mockResolvedValue(okProviderAdapter(undefined));
        const emitPayload = vi.fn();

        const result = await executeHttpFallback({
            signal: new AbortController().signal,
            streamRequest: {
                url: 'https://example.test/stream',
                headers: {},
                body: { stream: true },
            },
            consumeStreamResponse,
            emitPayload,
            formatHttpFailure: ({ response }) => `failed: ${String(response.status)}`,
        });

        expect(result.isOk()).toBe(true);
        expect(consumeStreamResponse).toHaveBeenCalledTimes(1);
        expect(emitPayload).not.toHaveBeenCalled();
    });
});
