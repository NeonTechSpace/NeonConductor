import { beforeEach, describe, expect, it } from 'vitest';

import {
    publishProviderPartObservabilityEvent,
    publishUsageObservabilityEvent,
} from '@/app/backend/runtime/services/observability/publishers';
import { neonObservabilityService } from '@/app/backend/runtime/services/observability/service';

const baseContext = {
    profileId: 'profile_default',
    sessionId: 'sess_alpha' as const,
    runId: 'run_alpha' as const,
    providerId: 'openai' as const,
    modelId: 'gpt-test',
};

describe('observability publishers', () => {
    beforeEach(() => {
        neonObservabilityService.resetForTests();
    });

    it('normalizes provider text and reasoning parts into stream chunks', () => {
        publishProviderPartObservabilityEvent({
            ...baseContext,
            part: {
                partType: 'text',
                payload: {
                    text: 'Hello',
                },
            },
        });
        publishProviderPartObservabilityEvent({
            ...baseContext,
            part: {
                partType: 'reasoning_summary',
                payload: {
                    text: 'Condensed reasoning',
                },
            },
        });

        const events = neonObservabilityService.list({}, 10);
        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            kind: 'stream_chunk',
            chunk: {
                kind: 'text_delta',
                text: 'Hello',
            },
        });
        expect(events[1]).toMatchObject({
            kind: 'stream_chunk',
            chunk: {
                kind: 'reasoning_delta',
                text: 'Condensed reasoning',
                summary: true,
            },
        });
    });

    it('emits usage updates as both usage event family and usage chunk', () => {
        publishUsageObservabilityEvent({
            ...baseContext,
            usage: {
                inputTokens: 12,
                outputTokens: 20,
                totalTokens: 32,
            },
        });

        const events = neonObservabilityService.list({}, 10);
        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            kind: 'usage_updated',
            usage: {
                totalTokens: 32,
            },
        });
        expect(events[1]).toMatchObject({
            kind: 'stream_chunk',
            chunk: {
                kind: 'usage',
                totalTokens: 32,
            },
        });
    });
});
