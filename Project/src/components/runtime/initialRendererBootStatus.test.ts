import { beforeEach, describe, expect, it, vi } from 'vitest';

const reportBootStatusMutationSpy = vi.fn(() => Promise.resolve({ accepted: true }));

vi.mock('@/web/lib/trpcClient', () => ({
    trpcClient: {
        system: {
            reportBootStatus: {
                mutate: reportBootStatusMutationSpy,
            },
        },
    },
}));

describe('initialRendererBootStatus', () => {
    beforeEach(async () => {
        vi.clearAllMocks();
        const { resetInitialRendererBootStatusForTests } =
            await import('@/web/components/runtime/initialRendererBootStatus');
        resetInitialRendererBootStatusForTests();
    });

    it('sends the initial renderer boot report only once while it is in flight', async () => {
        let resolveReport: ((value: { accepted: boolean }) => void) | undefined;
        reportBootStatusMutationSpy.mockImplementationOnce(
            () =>
                new Promise<{ accepted: boolean }>((resolve) => {
                    resolveReport = resolve;
                })
        );

        const { ensureInitialRendererBootStatusReport, getInitialRendererBootStatusSnapshot } =
            await import('@/web/components/runtime/initialRendererBootStatus');

        const firstReportPromise = ensureInitialRendererBootStatusReport();
        const secondReportPromise = ensureInitialRendererBootStatusReport();

        expect(reportBootStatusMutationSpy).toHaveBeenCalledTimes(1);
        expect(getInitialRendererBootStatusSnapshot()).toEqual({
            reportState: 'pending',
        });

        resolveReport?.({ accepted: true });
        await Promise.all([firstReportPromise, secondReportPromise]);

        expect(getInitialRendererBootStatusSnapshot()).toEqual({
            reportState: 'sent',
        });
    });

    it('records a failed snapshot and retries when the initial report is rejected', async () => {
        reportBootStatusMutationSpy.mockResolvedValueOnce({
            accepted: false,
        });

        const { ensureInitialRendererBootStatusReport, getInitialRendererBootStatusSnapshot } =
            await import('@/web/components/runtime/initialRendererBootStatus');

        await expect(ensureInitialRendererBootStatusReport()).resolves.toBeUndefined();
        expect(getInitialRendererBootStatusSnapshot()).toEqual({
            reportState: 'failed',
            reportErrorMessage: 'Initial renderer boot report was not accepted.',
        });

        reportBootStatusMutationSpy.mockResolvedValueOnce({
            accepted: true,
        });
        await expect(ensureInitialRendererBootStatusReport()).resolves.toBeUndefined();

        expect(reportBootStatusMutationSpy).toHaveBeenCalledTimes(2);
        expect(getInitialRendererBootStatusSnapshot()).toEqual({
            reportState: 'sent',
        });
    });
});
