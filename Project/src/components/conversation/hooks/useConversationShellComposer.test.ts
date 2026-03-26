import { err, ok } from 'neverthrow';
import { describe, expect, it, vi } from 'vitest';

import { composerImageCompressionError } from '@/web/components/conversation/hooks/composerImageCompressionErrors';
import { preparePendingComposerImage } from '@/web/components/conversation/hooks/useConversationShellComposer';

describe('preparePendingComposerImage', () => {
    it('marks the image failed and progresses the queue when preparation throws', async () => {
        const onPreparedImage = vi.fn();
        const onFailedImage = vi.fn();
        const onAttachmentError = vi.fn();
        const onQueueProgressed = vi.fn();

        await preparePendingComposerImage({
            clientId: 'client_1',
            sourceFile: new File(['image'], 'broken.png', { type: 'image/png' }),
            prepareImageAttachment: vi.fn(() => Promise.reject(new Error('Worker crashed.'))),
            onPreparedImage,
            onFailedImage,
            onAttachmentError,
            onQueueProgressed,
        });

        expect(onPreparedImage).not.toHaveBeenCalled();
        expect(onFailedImage).toHaveBeenCalledWith('client_1', 'Worker crashed.');
        expect(onAttachmentError).toHaveBeenCalledWith('Worker crashed.');
        expect(onQueueProgressed).toHaveBeenCalledOnce();
    });

    it('keeps the success path intact and still progresses the queue', async () => {
        const prepared = {
            attachment: {
                clientId: 'client_1',
                mimeType: 'image/png' as const,
                bytesBase64: 'aGVsbG8=',
                width: 1,
                height: 1,
                sha256: 'abc',
            },
            byteSize: 5,
            previewUrl: 'blob:preview',
        };
        const onPreparedImage = vi.fn();
        const onFailedImage = vi.fn();
        const onAttachmentError = vi.fn();
        const onQueueProgressed = vi.fn();

        await preparePendingComposerImage({
            clientId: 'client_1',
            sourceFile: new File(['image'], 'ok.png', { type: 'image/png' }),
            prepareImageAttachment: vi.fn(() => Promise.resolve(ok(prepared))),
            onPreparedImage,
            onFailedImage,
            onAttachmentError,
            onQueueProgressed,
        });

        expect(onPreparedImage).toHaveBeenCalledWith('client_1', prepared);
        expect(onFailedImage).not.toHaveBeenCalled();
        expect(onAttachmentError).not.toHaveBeenCalled();
        expect(onQueueProgressed).toHaveBeenCalledOnce();
    });

    it('converts typed compression failures into failed pending images', async () => {
        const onPreparedImage = vi.fn();
        const onFailedImage = vi.fn();
        const onAttachmentError = vi.fn();
        const onQueueProgressed = vi.fn();

        await preparePendingComposerImage({
            clientId: 'client_1',
            sourceFile: new File(['image'], 'too-large.png', { type: 'image/png' }),
            prepareImageAttachment: vi.fn(() =>
                Promise.resolve(err(composerImageCompressionError('size_limit_exceeded', 'Image is too large.')))
            ),
            onPreparedImage,
            onFailedImage,
            onAttachmentError,
            onQueueProgressed,
        });

        expect(onPreparedImage).not.toHaveBeenCalled();
        expect(onFailedImage).toHaveBeenCalledWith('client_1', 'Image is too large.');
        expect(onAttachmentError).toHaveBeenCalledWith('Image is too large.');
        expect(onQueueProgressed).toHaveBeenCalledOnce();
    });
});
