import { beforeEach, describe, expect, it, vi } from 'vitest';

const signalReadyMutationSpy = vi.fn(() => Promise.resolve());

vi.mock('@/web/lib/trpcClient', () => ({
    trpcClient: {
        system: {
            signalReady: {
                mutate: signalReadyMutationSpy,
            },
        },
    },
}));

describe('rendererReadySignal', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const { resetRendererReadySignalForTests } = await import('@/web/components/runtime/rendererReadySignal');
        resetRendererReadySignalForTests();
    });

    it('sends the ready signal only once when called repeatedly', async () => {
        const { ensureRendererReadySignal } = await import('@/web/components/runtime/rendererReadySignal');

        await ensureRendererReadySignal();
        await ensureRendererReadySignal();

        expect(signalReadyMutationSpy).toHaveBeenCalledTimes(1);
    });

    it('shares one in-flight ready signal and publishes the sent snapshot once it resolves', async () => {
        let resolveSignal: (() => void) | undefined;
        signalReadyMutationSpy.mockImplementationOnce(
            () =>
                new Promise<void>((resolve) => {
                    resolveSignal = resolve;
                })
        );

        const { ensureRendererReadySignal, getRendererReadySignalSnapshot } =
            await import('@/web/components/runtime/rendererReadySignal');

        const firstSignalPromise = ensureRendererReadySignal();
        const secondSignalPromise = ensureRendererReadySignal();

        expect(signalReadyMutationSpy).toHaveBeenCalledTimes(1);
        expect(getRendererReadySignalSnapshot().readySignalState).toBe('pending');

        resolveSignal?.();
        await Promise.all([firstSignalPromise, secondSignalPromise]);

        expect(getRendererReadySignalSnapshot()).toEqual({
            readySignalState: 'sent',
        });
    });

    it('records a failed snapshot without rejecting when the ready signal fails', async () => {
        const expectedError = new Error('boot failed');
        signalReadyMutationSpy.mockRejectedValueOnce(expectedError);
        const { ensureRendererReadySignal, getRendererReadySignalSnapshot } =
            await import('@/web/components/runtime/rendererReadySignal');

        await expect(ensureRendererReadySignal()).resolves.toBeUndefined();
        expect(signalReadyMutationSpy).toHaveBeenCalledTimes(1);
        expect(getRendererReadySignalSnapshot()).toEqual({
            readySignalState: 'failed',
            readySignalErrorMessage: 'boot failed',
        });

        signalReadyMutationSpy.mockResolvedValueOnce(undefined);
        await ensureRendererReadySignal();
        expect(signalReadyMutationSpy).toHaveBeenCalledTimes(2);
    });
});
