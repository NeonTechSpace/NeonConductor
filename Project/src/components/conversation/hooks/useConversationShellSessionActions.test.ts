import { describe, expect, it, vi } from 'vitest';

import { submitConversationSessionCreate } from '@/web/components/conversation/hooks/useConversationShellSessionActions';

describe('submitConversationSessionCreate', () => {
    it('reports missing-thread results through the existing error path', async () => {
        const onError = vi.fn();
        const onSelectSessionId = vi.fn();
        const onSelectRunId = vi.fn();
        const onClearError = vi.fn();
        const onSessionCreated = vi.fn();

        await submitConversationSessionCreate({
            profileId: 'profile_default',
            selectedThreadId: 'thr_123',
            createSession: () => Promise.resolve({ created: false as const, reason: 'missing_thread' }),
            onClearError,
            onError,
            onSelectSessionId,
            onSelectRunId,
            onSessionCreated,
        });

        expect(onError).toHaveBeenCalledWith('Selected thread no longer exists.');
        expect(onSelectSessionId).not.toHaveBeenCalled();
        expect(onSessionCreated).not.toHaveBeenCalled();
    });

    it('reports rejected create-session requests through the existing error path', async () => {
        const onError = vi.fn();

        await submitConversationSessionCreate({
            profileId: 'profile_default',
            selectedThreadId: 'thr_123',
            createSession: () => Promise.reject(new Error('Session service unavailable')),
            onClearError: vi.fn(),
            onError,
            onSelectSessionId: vi.fn(),
            onSelectRunId: vi.fn(),
            onSessionCreated: vi.fn(),
        });

        expect(onError).toHaveBeenCalledWith('Session service unavailable');
    });
});
