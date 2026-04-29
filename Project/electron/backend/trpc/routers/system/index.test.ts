import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
    openExternal: vi.fn(),
}));

vi.mock('electron', () => ({
    app: {},
    BrowserWindow: vi.fn(),
    Menu: {},
    dialog: {},
    ipcMain: {},
    session: {},
    shell: {
        openExternal: mocks.openExternal,
        openPath: vi.fn(),
    },
    WebContentsView: vi.fn(),
}));

import { systemRouter } from '@/app/backend/trpc/routers/system';

describe('systemRouter.openExternalUrl', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mocks.openExternal.mockResolvedValue(undefined);
    });

    it('returns a blocked result for unsafe urls', async () => {
        const caller = systemRouter.createCaller({
            senderId: 1,
            win: null,
            requestId: 'req_1',
            correlationId: 'corr_1',
        });

        await expect(caller.openExternalUrl({ url: 'javascript:alert(1)' })).resolves.toEqual({
            opened: false,
            reason: 'unsafe_url',
        });
        expect(mocks.openExternal).not.toHaveBeenCalled();
    });

    it('opens safe urls without throwing', async () => {
        const caller = systemRouter.createCaller({
            senderId: 1,
            win: null,
            requestId: 'req_1',
            correlationId: 'corr_1',
        });

        await expect(caller.openExternalUrl({ url: 'https://example.com' })).resolves.toEqual({
            opened: true,
        });
        expect(mocks.openExternal).toHaveBeenCalledWith('https://example.com');
    });
});
