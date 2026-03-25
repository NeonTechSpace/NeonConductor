import { describe, expect, it, vi } from 'vitest';

import { applyNeonObservabilitySubscriptionPayload } from '@/web/lib/observability/subscription';

describe('applyNeonObservabilitySubscriptionPayload', () => {
    it('pushes valid observability events into the store handler', () => {
        const pushEvent = vi.fn();
        const setLive = vi.fn();
        const setError = vi.fn();

        applyNeonObservabilitySubscriptionPayload({
            payload: {
                sequence: 1,
                at: '2026-03-25T16:00:00.000Z',
                kind: 'run_started',
                profileId: 'profile_default',
                sessionId: 'sess_alpha',
                runId: 'run_alpha',
                providerId: 'openai',
                modelId: 'gpt-test',
                source: 'runtime.run_execution',
                topLevelTab: 'agent',
                modeKey: 'code',
            },
            pushEvent,
            setLive,
            setError,
        });

        expect(pushEvent).toHaveBeenCalledOnce();
        expect(setError).not.toHaveBeenCalled();
    });

    it('fails closed on invalid payloads', () => {
        const pushEvent = vi.fn();
        const setLive = vi.fn();
        const setError = vi.fn();

        applyNeonObservabilitySubscriptionPayload({
            payload: {
                nope: true,
            },
            pushEvent,
            setLive,
            setError,
        });

        expect(pushEvent).not.toHaveBeenCalled();
        expect(setError).toHaveBeenCalledWith('Received invalid Neon observability payload.');
    });
});
