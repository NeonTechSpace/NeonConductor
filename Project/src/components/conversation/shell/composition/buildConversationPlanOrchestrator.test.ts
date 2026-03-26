import { describe, expect, it, vi } from 'vitest';

import { runConversationPlanMutation } from '@/web/components/conversation/shell/composition/buildConversationPlanOrchestrator';

describe('runConversationPlanMutation', () => {
    it('applies successful mutation results', async () => {
        const applyResult = vi.fn();
        const onError = vi.fn();

        await runConversationPlanMutation({
            mutation: {
                mutateAsync: () => Promise.resolve({ found: true as const }),
            },
            applyResult,
            onError,
            errorPrefix: 'Plan answer failed',
        });

        expect(applyResult).toHaveBeenCalledWith({ found: true });
        expect(onError).not.toHaveBeenCalled();
    });

    it('routes rejected mutation errors through the provided error handler', async () => {
        const applyResult = vi.fn();
        const onError = vi.fn();

        await runConversationPlanMutation({
            mutation: {
                mutateAsync: () => Promise.reject(new Error('network down')),
            },
            applyResult,
            onError,
            errorPrefix: 'Plan revision failed',
        });

        expect(applyResult).not.toHaveBeenCalled();
        expect(onError).toHaveBeenCalledWith('Plan revision failed: network down');
    });
});
