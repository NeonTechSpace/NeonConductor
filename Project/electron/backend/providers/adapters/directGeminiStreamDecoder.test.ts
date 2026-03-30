import { describe, expect, it } from 'vitest';

import {
    consumeDirectGeminiStreamResponse,
    parseDirectGeminiPayload,
} from '@/app/backend/providers/adapters/directGeminiStreamDecoder';

describe('directGeminiStreamDecoder', () => {
    it('parses Gemini payloads into normalized runtime parts', () => {
        const result = parseDirectGeminiPayload({
            payload: {
                candidates: [
                    {
                        content: {
                            parts: [
                                {
                                    text: 'Plan',
                                    thought: true,
                                },
                                {
                                    text: 'Done',
                                },
                            ],
                        },
                    },
                ],
            },
            includeEncrypted: false,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.parts.map((part) => part.partType)).toEqual(['reasoning_summary', 'text']);
    });

    it('fails closed on malformed stream payloads', async () => {
        const response = new Response('data: {"candidates":[{"content":{"parts":[{"functionCall":{"args":{}}}]}}]}\n\n', {
            headers: {
                'content-type': 'text/event-stream',
            },
        });

        const result = await consumeDirectGeminiStreamResponse({
            response,
            handlers: {
                onPart: () => undefined,
            },
            startedAt: Date.now(),
            includeEncrypted: true,
        });

        expect(result.isErr()).toBe(true);
    });
});
