import { LoaderCircle, RefreshCw, X } from 'lucide-react';

import {
    getImagePreviewStatusLabel,
    getPendingImagePreviewState,
} from '@/web/components/conversation/messages/imagePreviewState';
import { Button } from '@/web/components/ui/button';

export interface PendingImageCardView {
    clientId: string;
    fileName: string;
    previewUrl: string;
    status: 'queued' | 'compressing' | 'ready' | 'failed';
    errorMessage?: string;
    byteSize?: number;
    attachment?: {
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
        width: number;
        height: number;
    };
}

interface PendingImagesGridProps {
    pendingImages: PendingImageCardView[];
    onPreviewImage: (input: { imageUrl: string; title: string; detail?: string }) => void;
    onRetryPendingImage: (clientId: string) => void;
    onRemovePendingImage: (clientId: string) => void;
    formatImageBytes: (value?: number) => string | undefined;
}

export function PendingImagesGrid({
    pendingImages,
    onPreviewImage,
    onRetryPendingImage,
    onRemovePendingImage,
    formatImageBytes,
}: PendingImagesGridProps) {
    if (pendingImages.length === 0) {
        return null;
    }

    return (
        <div className='border-border grid gap-2 border-b px-4 py-4 sm:grid-cols-2 xl:grid-cols-4'>
            {pendingImages.map((image) => {
                const previewState = getPendingImagePreviewState(image.status);

                return (
                    <div key={image.clientId} className='border-border bg-background/80 rounded-2xl border p-2'>
                        <button
                            type='button'
                            className='group focus-visible:ring-ring focus-visible:ring-offset-background block w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-offset-2'
                            onClick={() => {
                                onPreviewImage({
                                    imageUrl: image.previewUrl,
                                    title: image.fileName,
                                    ...(image.attachment
                                        ? {
                                              detail: `${String(image.attachment.width)} × ${String(image.attachment.height)}`,
                                          }
                                        : {}),
                                });
                            }}>
                            <div className='bg-muted relative overflow-hidden rounded-xl'>
                                <img
                                    src={image.previewUrl}
                                    alt={image.fileName}
                                    width={image.attachment?.width ?? 512}
                                    height={image.attachment?.height ?? 512}
                                    loading='lazy'
                                    decoding='async'
                                    className='h-32 w-full object-cover transition duration-200 group-hover:scale-[1.02]'
                                />
                                <div className='absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-1 text-[11px] text-white'>
                                    <span className='truncate'>{getImagePreviewStatusLabel(previewState)}</span>
                                    <span>{formatImageBytes(image.byteSize) ?? ''}</span>
                                </div>
                            </div>
                        </button>
                        <div className='mt-2 space-y-1'>
                            <p className='truncate text-xs font-medium'>{image.fileName}</p>
                            {image.attachment ? (
                                <p className='text-muted-foreground text-[11px]'>
                                    {image.attachment.width} × {image.attachment.height} ·{' '}
                                    {image.attachment.mimeType.replace('image/', '').toUpperCase()}
                                </p>
                            ) : null}
                            {image.errorMessage ? (
                                <p aria-live='polite' className='text-destructive text-[11px]'>
                                    {image.errorMessage}
                                </p>
                            ) : (
                                <p aria-live='polite' className='text-muted-foreground text-[11px]'>
                                    {image.status === 'queued'
                                        ? 'Image is queued and will start processing soon.'
                                        : previewState === 'loading'
                                          ? 'Image is being compressed before it can be sent.'
                                          : previewState === 'ready'
                                            ? 'Image is ready to be sent with this message.'
                                            : 'Image preview is waiting for action.'}
                                </p>
                            )}
                        </div>
                        <div className='mt-2 flex items-center justify-end gap-1'>
                            {image.status === 'failed' ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    className='h-7 px-2 text-[11px]'
                                    onClick={() => {
                                        onRetryPendingImage(image.clientId);
                                    }}>
                                    <RefreshCw className='h-3.5 w-3.5' />
                                    Retry
                                </Button>
                            ) : null}
                            {image.status === 'compressing' ? (
                                <span className='text-muted-foreground inline-flex items-center gap-1 px-2 text-[11px]'>
                                    <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
                                    Preparing
                                </span>
                            ) : null}
                            {image.status === 'queued' ? (
                                <span className='text-muted-foreground inline-flex items-center gap-1 px-2 text-[11px]'>
                                    Queued
                                </span>
                            ) : null}
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                className='h-7 px-2 text-[11px]'
                                onClick={() => {
                                    onRemovePendingImage(image.clientId);
                                }}>
                                <X className='h-3.5 w-3.5' />
                                Remove
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
