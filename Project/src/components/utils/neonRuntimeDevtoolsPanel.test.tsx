import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    NeonRuntimeDevtoolsPanel,
    filterNeonObservabilityEvents,
} from '@/web/components/utils/neonRuntimeDevtoolsPanel';

const { mockObservabilityStreamState } = vi.hoisted(() => ({
    mockObservabilityStreamState: {
        connectionState: 'idle',
        lastSequence: 0,
        lastError: null,
        events: [] as unknown[],
    },
}));

vi.mock('@/web/lib/observability/eventStream', () => ({
    useNeonObservabilityStreamStore: (selector: (state: typeof mockObservabilityStreamState) => unknown) =>
        selector(mockObservabilityStreamState),
}));

describe('NeonRuntimeDevtoolsPanel', () => {
    beforeEach(() => {
        Object.assign(mockObservabilityStreamState, {
            connectionState: 'idle',
            lastSequence: 0,
            lastError: null,
            events: [],
        });
    });

    it('renders stream status and buffered event summaries', () => {
        Object.assign(mockObservabilityStreamState, {
            connectionState: 'live',
            lastSequence: 3,
            lastError: null,
            events: [
                {
                    sequence: 3,
                    at: '2026-03-25T16:00:00.000Z',
                    kind: 'stream_chunk',
                    profileId: 'profile_default',
                    sessionId: 'sess_alpha',
                    runId: 'run_alpha',
                    providerId: 'openai',
                    modelId: 'gpt-test',
                    source: 'provider.stream',
                    chunk: {
                        kind: 'text_delta',
                        text: 'hello',
                    },
                },
            ],
        });

        const html = renderToStaticMarkup(<NeonRuntimeDevtoolsPanel />);

        expect(html).toContain('live');
        expect(html).toContain('stream.text_delta');
        expect(html).toContain('profile_default');
    });

    it('filters events by profile, session, and run substrings', () => {
        const filtered = filterNeonObservabilityEvents(
            [
                {
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
                {
                    sequence: 2,
                    at: '2026-03-25T16:01:00.000Z',
                    kind: 'run_completed',
                    profileId: 'profile_other',
                    sessionId: 'sess_beta',
                    runId: 'run_beta',
                    providerId: 'openai',
                    modelId: 'gpt-test',
                    source: 'runtime.run_execution',
                },
            ],
            {
                profileId: 'default',
                sessionId: 'alpha',
                runId: 'alpha',
            }
        );

        expect(filtered).toHaveLength(1);
        expect(filtered[0]?.runId).toBe('run_alpha');
    });
});
