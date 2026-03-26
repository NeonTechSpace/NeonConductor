import { describe, expect, it } from 'vitest';

import type {
    ComposerPendingImage,
    PreparedComposerImageAttachment,
} from '@/web/components/conversation/hooks/composerImageAttachments';
import {
    failComposerPendingImage,
    pumpComposerPendingImages,
    queueComposerPendingImageForRetry,
    resolvePreparedComposerPendingImage,
} from '@/web/components/conversation/hooks/conversationComposerPendingImageQueue';


function createPendingImage(input: {
    clientId: string;
    status: ComposerPendingImage['status'];
    previewUrl?: string;
    byteSize?: number;
}): ComposerPendingImage {
    return {
        clientId: input.clientId,
        fileName: `${input.clientId}.png`,
        sourceFile: new File(['image'], `${input.clientId}.png`, { type: 'image/png' }),
        previewUrl: input.previewUrl ?? `blob:${input.clientId}`,
        status: input.status,
        ...(input.byteSize !== undefined ? { byteSize: input.byteSize } : {}),
    };
}

function createPreparedAttachment(input: {
    clientId: string;
    byteSize: number;
    previewUrl?: string;
}): PreparedComposerImageAttachment {
    return {
        attachment: {
            clientId: input.clientId,
            mimeType: 'image/png',
            bytesBase64: 'abc123',
            width: 1,
            height: 1,
            sha256: `${input.clientId}_hash`,
        },
        byteSize: input.byteSize,
        previewUrl: input.previewUrl ?? `blob:${input.clientId}:ready`,
    };
}

describe('conversation composer pending image queue', () => {
    it('pumps queued images into compressing slots up to the concurrency limit', () => {
        const result = pumpComposerPendingImages(
            [
                createPendingImage({ clientId: 'queued_1', status: 'queued' }),
                createPendingImage({ clientId: 'queued_2', status: 'queued' }),
                createPendingImage({ clientId: 'active', status: 'compressing' }),
            ],
            2
        );

        expect(result.imagesToStart.map((image) => image.clientId)).toEqual(['queued_1']);
        expect(result.nextImages.find((image) => image.clientId === 'queued_1')?.status).toBe('compressing');
        expect(result.nextImages.find((image) => image.clientId === 'queued_2')?.status).toBe('queued');
    });

    it('marks retried images back to queued without touching others', () => {
        const nextImages = queueComposerPendingImageForRetry(
            [
                createPendingImage({ clientId: 'failed_1', status: 'failed' }),
                createPendingImage({ clientId: 'ready_1', status: 'ready' }),
            ],
            'failed_1'
        );

        expect(nextImages.find((image) => image.clientId === 'failed_1')?.status).toBe('queued');
        expect(nextImages.find((image) => image.clientId === 'ready_1')?.status).toBe('ready');
    });

    it('records failures on the targeted image only', () => {
        const nextImages = failComposerPendingImage(
            [
                createPendingImage({ clientId: 'queued_1', status: 'queued' }),
                createPendingImage({ clientId: 'queued_2', status: 'queued' }),
            ],
            'queued_2',
            'Compression failed'
        );

        expect(nextImages.find((image) => image.clientId === 'queued_1')?.status).toBe('queued');
        expect(nextImages.find((image) => image.clientId === 'queued_2')).toMatchObject({
            status: 'failed',
            errorMessage: 'Compression failed',
        });
    });

    it('resolves prepared images to ready state when the total byte limit is still valid', () => {
        const result = resolvePreparedComposerPendingImage(
            [
                createPendingImage({ clientId: 'ready_1', status: 'ready', byteSize: 1_000_000 }),
                createPendingImage({ clientId: 'compressing_1', status: 'compressing', previewUrl: 'blob:old' }),
            ],
            'compressing_1',
            createPreparedAttachment({
                clientId: 'compressing_1',
                byteSize: 1_200_000,
                previewUrl: 'blob:new',
            })
        );

        expect(result.errorMessage).toBeUndefined();
        expect(result.replacedImage?.previewUrl).toBe('blob:old');
        expect(result.nextImages.find((image) => image.clientId === 'compressing_1')).toMatchObject({
            status: 'ready',
            previewUrl: 'blob:new',
            byteSize: 1_200_000,
        });
    });

    it('fails the prepared image when it would exceed the total payload byte limit', () => {
        const result = resolvePreparedComposerPendingImage(
            [
                createPendingImage({ clientId: 'ready_1', status: 'ready', byteSize: 5_500_000 }),
                createPendingImage({ clientId: 'compressing_1', status: 'compressing' }),
            ],
            'compressing_1',
            createPreparedAttachment({
                clientId: 'compressing_1',
                byteSize: 800_000,
            })
        );

        expect(result.errorMessage).toBe('Attached images exceed the 6 MB total payload limit.');
        expect(result.nextImages.find((image) => image.clientId === 'compressing_1')).toMatchObject({
            status: 'failed',
            errorMessage: 'Attached images exceed the 6 MB total payload limit.',
        });
    });
});
