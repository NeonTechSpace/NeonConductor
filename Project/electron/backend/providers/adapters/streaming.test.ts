import { describe, expect, it } from 'vitest';

import {
    parseChatCompletionsStreamChunk,
    parseResponsesStreamChunk,
} from '@/app/backend/providers/adapters/streaming';

describe('provider streaming parsers', () => {
    it('parses chat completion text deltas and usage', () => {
        const parsed = parseChatCompletionsStreamChunk({
            choices: [
                {
                    delta: {
                        content: 'Hello',
                    },
                },
            ],
            usage: {
                prompt_tokens: 12,
                completion_tokens: 4,
                total_tokens: 16,
            },
        });

        expect(parsed.parts).toEqual([
            {
                partType: 'text',
                payload: { text: 'Hello' },
            },
        ]);
        expect(parsed.usage).toMatchObject({
            inputTokens: 12,
            outputTokens: 4,
            totalTokens: 16,
        });
    });

    it('parses responses reasoning summary deltas', () => {
        const parsed = parseResponsesStreamChunk({
            eventName: 'response.reasoning_summary_text.delta',
            payload: {
                delta: 'Working through the steps',
            },
        });

        expect(parsed.parts).toEqual([
            {
                partType: 'reasoning_summary',
                payload: { text: 'Working through the steps' },
            },
        ]);
    });
});
