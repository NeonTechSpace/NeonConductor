import { err } from 'neverthrow';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    prepareComposerImageAttachment,
    releasePendingImageResources,
} from '@/web/components/conversation/hooks/composerImageAttachments';
import { compressComposerImageInWorker } from '@/web/components/conversation/hooks/composerImageCompressionClient';
import { composerImageCompressionError } from '@/web/components/conversation/hooks/composerImageCompressionErrors';

vi.mock('@/web/components/conversation/hooks/composerImageCompressionClient', () => ({
    compressComposerImageInWorker: vi.fn(),
}));

function WorkerStub(): void {}

class FakeOffscreenCanvasRenderingContext2D {
    drawImage(): void {}

    getImageData() {
        return {
            data: Uint8ClampedArray.from([0, 0, 0, 255]),
        };
    }
}

class FakeOffscreenCanvas {
    readonly width: number;
    readonly height: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
    }

    getContext(): FakeOffscreenCanvasRenderingContext2D {
        return new FakeOffscreenCanvasRenderingContext2D();
    }

    convertToBlob(): Promise<Blob> {
        return Promise.resolve(new Blob(['jpeg'], { type: 'image/jpeg' }));
    }
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('prepareComposerImageAttachment', () => {
    it('returns a typed invalid_file_type error for non-image files', async () => {
        vi.stubGlobal('Worker', undefined);

        const result = await prepareComposerImageAttachment(
            new File(['text'], 'note.txt', { type: 'text/plain' }),
            'client-invalid'
        );

        expect(result.isErr()).toBe(true);
        expect(result._unsafeUnwrapErr()).toEqual(
            composerImageCompressionError('invalid_file_type', '"note.txt" is not an image file.')
        );
    });

    it('falls back to main-thread compression when the worker is unavailable', async () => {
        vi.stubGlobal('Worker', WorkerStub);
        vi.stubGlobal('OffscreenCanvas', FakeOffscreenCanvas);
        vi.stubGlobal(
            'createImageBitmap',
            vi.fn(() =>
                Promise.resolve({
                    width: 1,
                    height: 1,
                    close() {},
                })
            )
        );
        vi.mocked(compressComposerImageInWorker).mockImplementation(() =>
            Promise.resolve().then(() => err(composerImageCompressionError('worker_unavailable', 'worker unavailable')))
        );

        const result = await prepareComposerImageAttachment(
            new File(['image'], 'fallback.png', { type: 'image/png' }),
            'client-fallback'
        );

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error('Expected main-thread fallback to succeed.');
        }
        expect(result.value.attachment.clientId).toBe('client-fallback');
        expect(result.value.attachment.mimeType).toBe('image/jpeg');
        releasePendingImageResources({
            clientId: 'cleanup',
            fileName: 'cleanup.png',
            sourceFile: new File(['image'], 'cleanup.png', { type: 'image/png' }),
            previewUrl: result.value.previewUrl,
            status: 'ready',
            attachment: result.value.attachment,
            byteSize: result.value.byteSize,
        });
    });
});
