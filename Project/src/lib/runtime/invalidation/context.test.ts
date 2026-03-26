import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRuntimeEventContext, hasSelectedWorkspaceImpact } from '@/web/lib/runtime/invalidation/context';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

function createEvent(input: Partial<RuntimeEventRecordV1>): RuntimeEventRecordV1 {
    return {
        sequence: 1,
        eventId: 'evt_test',
        entityType: 'runtime',
        domain: 'runtime',
        operation: 'status',
        entityId: 'runtime',
        eventType: 'test.event',
        payload: {},
        createdAt: new Date().toISOString(),
        ...input,
    };
}

function stubSelection(
    profileId: string,
    state: { selectedThreadId?: string; selectedSessionId?: string; selectedRunId?: string }
) {
    const storage = new Map<string, string>();
    storage.set(`neonconductor.conversation.ui.${profileId}`, JSON.stringify(state));
    vi.stubGlobal('window', {
        localStorage: {
            getItem: (key: string) => storage.get(key) ?? null,
            setItem: () => undefined,
            removeItem: () => undefined,
        },
    });
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('runtime invalidation context', () => {
    it('hydrates entity ids from payload and persisted selection state', () => {
        stubSelection('profile_default', {
            selectedThreadId: 'thr_1',
            selectedSessionId: 'sess_1',
            selectedRunId: 'run_1',
        });

        const context = getRuntimeEventContext(
            createEvent({
                entityType: 'messagePart',
                domain: 'messagePart',
                operation: 'append',
                entityId: 'part_1',
                payload: {
                    profileId: 'profile_default',
                    sessionId: 'sess_1',
                    runId: 'run_1',
                    modelId: 'openai/gpt-5',
                },
            })
        );

        expect(context.profileId).toBe('profile_default');
        expect(context.selection.selectedThreadId).toBe('thr_1');
        expect(context.sessionId).toBe('sess_1');
        expect(context.runId).toBe('run_1');
        expect(context.modelId).toBe('openai/gpt-5');
        expect(hasSelectedWorkspaceImpact(context)).toBe(true);
    });

    it('falls back to domain entity ids when payload ids are absent', () => {
        const context = getRuntimeEventContext(
            createEvent({
                entityType: 'provider',
                domain: 'provider',
                operation: 'status',
                entityId: 'openai',
                payload: {
                    profileId: 'profile_default',
                },
            })
        );

        expect(context.providerId).toBe('openai');
    });
});
