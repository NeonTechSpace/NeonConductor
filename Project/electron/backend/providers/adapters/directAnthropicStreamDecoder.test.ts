import { describe, expect, it } from 'vitest';

import {
    consumeDirectAnthropicStreamResponse,
    parseDirectAnthropicPayload,
} from '@/app/backend/providers/adapters/directAnthropicStreamDecoder';

describe('directAnthropicStreamDecoder', () => {
    it('parses Anthropic payloads into normalized runtime parts', () => {
        const result = parseDirectAnthropicPayload({
            payload: {
                content: [
                    {
                        type: 'thinking',
                        thinking: 'Plan',
                        signature: 'sig_123',
                    },
                    {
                        type: 'text',
                        text: 'Done',
                    },
                ],
            },
            includeEncrypted: true,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.parts.map((part) => part.partType)).toEqual(['reasoning', 'text']);
    });

    it('fails closed on malformed stream frames', async () => {
        const response = new Response('data: {"type":"content_block_stop","index":0}\n\n', {
            headers: {
                'content-type': 'text/event-stream',
            },
        });

        const result = await consumeDirectAnthropicStreamResponse({
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
