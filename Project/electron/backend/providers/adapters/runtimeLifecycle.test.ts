import { describe, expect, it, vi } from 'vitest';

const { warnMock } = vi.hoisted(() => ({
    warnMock: vi.fn(),
}));

vi.mock('@/app/main/logging', () => ({
    appLog: {
        warn: warnMock,
    },
}));

import {
    emitRuntimeLifecycleSelection,
    failRuntimeAdapter,
    mapHttpFallbackFailureStage,
} from '@/app/backend/providers/adapters/runtimeLifecycle';

describe('runtimeLifecycle', () => {
    it('emits transport selection before cache resolution', async () => {
        const events: string[] = [];

        await emitRuntimeLifecycleSelection({
            handlers: {
                onPart: () => undefined,
                onTransportSelected: async () => {
                    events.push('transport');
                },
                onCacheResolved: async () => {
                    events.push('cache');
                },
            },
            transportSelection: {
                selected: 'openai_responses',
                requested: 'auto',
                degraded: false,
            },
            cacheResult: {
                strategy: 'auto',
                applied: false,
            },
        });

        expect(events).toEqual(['transport', 'cache']);
    });

    it('maps fallback-shell failure stages to one shared lifecycle vocabulary', () => {
        expect(mapHttpFallbackFailureStage('request')).toBe('request');
        expect(mapHttpFallbackFailureStage('request_fallback')).toBe('request fallback');
        expect(mapHttpFallbackFailureStage('stream_parse')).toBe('stream parse');
        expect(mapHttpFallbackFailureStage('payload_parse')).toBe('payload parse');
    });

    it('normalizes unknown adapter error codes to provider_request_failed', () => {
        const result = failRuntimeAdapter({
            input: {
                runId: 'run_test',
                profileId: 'profile_test',
                sessionId: 'session_test',
                modelId: 'model_test',
            },
            logTag: 'provider.test',
            runtimeLabel: 'Test runtime',
            context: 'request',
            code: 'weird_error',
            error: 'Unexpected failure',
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected normalized adapter failure.');
        }
        expect(result.error.code).toBe('provider_request_failed');
        expect(warnMock).toHaveBeenCalledTimes(1);
    });
});
