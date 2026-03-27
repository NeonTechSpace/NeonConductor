import { describe, expect, it } from 'vitest';

import { buildPreparedContextDigest, buildPreparedContextMessages } from '@/app/backend/runtime/services/context/preparedContextMessageBuilder';

describe('preparedContextMessageBuilder', () => {
    it('keeps system messages ahead of replay, summary, and prompt content', () => {
        const messages = buildPreparedContextMessages({
            systemMessages: [
                {
                    role: 'system',
                    parts: [{ type: 'text', text: 'App instructions' }],
                },
            ],
            replayMessages: [
                {
                    messageId: 'msg_1',
                    role: 'assistant',
                    parts: [{ type: 'text', text: 'Replay summary' }],
                },
            ],
            prompt: 'Use the current context.',
            summaryMessage: {
                role: 'system',
                parts: [{ type: 'text', text: 'Compacted summary' }],
            },
        });

        expect(messages).toHaveLength(4);
        expect(messages[0]?.parts[0]).toMatchObject({ type: 'text', text: 'App instructions' });
        expect(messages[1]?.parts[0]).toMatchObject({ type: 'text', text: 'Compacted summary' });
        expect(messages[2]?.parts[0]).toMatchObject({ type: 'text', text: 'Replay summary' });
        expect(messages[3]?.role).toBe('user');
        expect(messages[3]?.parts[0]).toMatchObject({ type: 'text', text: 'Use the current context.' });
    });

    it('changes the digest when the assembled messages change', () => {
        const baseMessages = buildPreparedContextMessages({
            systemMessages: [{ role: 'system', parts: [{ type: 'text', text: 'One' }] }],
            replayMessages: [],
            prompt: 'Prompt',
        });
        const nextMessages = buildPreparedContextMessages({
            systemMessages: [{ role: 'system', parts: [{ type: 'text', text: 'Two' }] }],
            replayMessages: [],
            prompt: 'Prompt',
        });

        expect(buildPreparedContextDigest(baseMessages)).not.toBe(buildPreparedContextDigest(nextMessages));
    });
});
