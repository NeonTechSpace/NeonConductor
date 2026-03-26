import { beforeAll, describe, expect, it, vi } from 'vitest';

let handleCompressionRequest: typeof import('./composerImageCompression.worker').handleCompressionRequest;

beforeAll(async () => {
    vi.stubGlobal('self', {
        postMessage: vi.fn(),
    });
    vi.stubGlobal(
        'createImageBitmap',
        vi.fn(() =>
            Promise.resolve({
                width: 4,
                height: 4,
                close: vi.fn(),
            })
        )
    );
    vi.stubGlobal(
        'OffscreenCanvas',
        class FakeOffscreenCanvas {
            constructor(
                public width: number,
                public height: number
            ) {}

            getContext() {
                return {
                    drawImage: vi.fn(),
                    getImageData: () => {
                        throw new Error('boom');
                    },
                };
            }
        }
    );

    ({ handleCompressionRequest } = await import('./composerImageCompression.worker'));
});

describe('handleCompressionRequest', () => {
    it('posts an error message when compression throws unexpectedly', async () => {
        const postMessage = vi.fn();
        const invalidFile = {
            name: 'invalid.png',
            type: 'image/png',
        } as File;

        await handleCompressionRequest({
            requestId: 'req_1',
            clientId: 'client_1',
            file: invalidFile,
            postMessage,
        });

        expect(postMessage).toHaveBeenCalledWith({
            requestId: 'req_1',
            status: 'error',
            message: 'boom',
        });
    });
});
