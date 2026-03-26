import { describe, expect, it, vi } from 'vitest';

import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';

describe('createFailClosedAsyncAction', () => {
    it('awaits the wrapped action', async () => {
        const action = vi.fn((value: string) => {
            expect(value).toBe('ok');
            return Promise.resolve();
        });
        const wrappedAction = createFailClosedAsyncAction(action);

        await expect(wrappedAction('ok')).resolves.toBeUndefined();
        expect(action).toHaveBeenCalledWith('ok');
    });

    it('swallows rejections and reports them through the optional error callback', async () => {
        const action = vi.fn(() => Promise.reject(new Error('boom')));
        const onError = vi.fn();
        const wrappedAction = createFailClosedAsyncAction(action, onError);

        await expect(wrappedAction()).resolves.toBeUndefined();
        expect(onError).toHaveBeenCalledTimes(1);
        expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    });
});
