import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { ipcMainOnSpy } = vi.hoisted(() => ({
    ipcMainOnSpy: vi.fn(),
}));

describe('electron-trpc-experimental async dispose patch', () => {
    beforeEach(() => {
        ipcMainOnSpy.mockClear();
        vi.resetModules();
    });

    it('keeps async resources with an existing Symbol.asyncDispose intact', async () => {
        const utilsPath = pathToFileURL(
            path.join(process.cwd(), 'node_modules', 'electron-trpc-experimental', 'src', 'main', 'utils.ts')
        );
        const { makeAsyncResource } = (await import(utilsPath.href)) as {
            makeAsyncResource: <T extends { [Symbol.asyncDispose]?: () => Promise<void>; label: string }>(
                thing: T,
                dispose: () => Promise<void>
            ) => T & AsyncDisposable;
        };

        const existingDispose = vi.fn(() => Promise.resolve(undefined));
        const resource = {
            label: 'pre-disposed-stream',
            [Symbol.asyncDispose]: existingDispose,
        };
        const fallbackDispose = vi.fn(() => Promise.resolve(undefined));

        const wrapped = makeAsyncResource(resource, fallbackDispose);

        expect(wrapped).toBe(resource);
        expect(wrapped.label).toBe('pre-disposed-stream');
        expect(fallbackDispose).not.toHaveBeenCalled();

        await wrapped[Symbol.asyncDispose]();

        expect(existingDispose).toHaveBeenCalledTimes(1);
    });
});
