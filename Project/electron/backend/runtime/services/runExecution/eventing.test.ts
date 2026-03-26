import { beforeEach, describe, expect, it, vi } from 'vitest';

const { appendMock } = vi.hoisted(() => ({
    appendMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/runtimeEventLog', () => ({
    runtimeEventLogService: {
        append: appendMock,
    },
}));

import type { RunRecord } from '@/app/backend/persistence/types';
import {
    emitCacheResolutionEvent,
    emitTransportSelectionEvent,
} from '@/app/backend/runtime/services/runExecution/eventing';

function createRunRecord(): RunRecord {
    return {
        id: 'run_test',
        sessionId: 'sess_test',
        profileId: 'profile_test',
        prompt: 'Hello',
        status: 'running',
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        authMethod: 'api_key',
        cache: {
            strategy: 'auto',
            applied: false,
        },
        transport: {
            requestedFamily: 'auto',
            selected: 'openai_responses',
        },
        createdAt: '2026-03-13T00:00:00.000Z',
        updatedAt: '2026-03-13T00:00:00.000Z',
    };
}

describe('runExecution eventing', () => {
    beforeEach(() => {
        appendMock.mockReset();
    });

    it('emits cache resolution events with the persisted run snapshot', async () => {
        const run = createRunRecord();

        await emitCacheResolutionEvent({
            runId: run.id,
            profileId: run.profileId,
            sessionId: run.sessionId,
            cache: {
                strategy: 'auto',
                applied: false,
                reason: 'model_unsupported',
            },
            run,
        });

        expect(appendMock).toHaveBeenCalledTimes(1);
        expect(appendMock.mock.calls[0]?.[0].payload.run).toEqual(run);
    });

    it('emits transport selection events with the persisted run snapshot', async () => {
        const run = createRunRecord();

        await emitTransportSelectionEvent({
            runId: run.id,
            profileId: run.profileId,
            sessionId: run.sessionId,
            selection: {
                selected: 'openai_chat_completions',
                requested: 'auto',
                degraded: false,
            },
            run,
        });

        expect(appendMock).toHaveBeenCalledTimes(1);
        expect(appendMock.mock.calls[0]?.[0].payload.run).toEqual(run);
    });
});
