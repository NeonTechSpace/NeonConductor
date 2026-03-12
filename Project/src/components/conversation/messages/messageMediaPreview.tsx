import { useEffect, useRef, useState } from 'react';

import { getImagePreviewStatusLabel, getRemoteImagePreviewState } from '@/web/components/conversation/messages/imagePreviewState';
import { useMessageMediaUrl } from '@/web/components/conversation/messages/useMessageMediaUrl';
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';

import type { EntityId } from '@/shared/contracts';

interface MessageMediaPreviewProps {
    profileId: string;
    item: {
        mediaId: EntityId<'media'>;
        width: number;
        height: number;
        mimeType: string;
    };
}

export function MessageMediaPreview({ profileId, item }: MessageMediaPreviewProps) {
    const [isLightboxOpen, setIsLightboxOpen] = useState(false);
    const imageButtonRef = useRef<HTMLButtonElement | null>(null);
    const [isNearViewport, setIsNearViewport] = useState(false);

    useEffect(() => {
        if (isNearViewport) {
            return;
        }

        const element = imageButtonRef.current;
        if (!element || typeof IntersectionObserver === 'undefined') {
            setIsNearViewport(true);
            return;
        }

        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) {
                    setIsNearViewport(true);
                    observer.disconnect();
                }
            },
            { rootMargin: '220px 0px' }
        );

        observer.observe(element);
        return () => {
            observer.disconnect();
        };
    }, [isNearViewport]);

    const { objectUrl: imageUrl, mediaQuery } = useMessageMediaUrl({
        profileId,
        mediaId: item.mediaId,
        enabled: isNearViewport || isLightboxOpen,
    });
    const detail = `${String(item.width)} x ${String(item.height)}`;
    const previewState = getRemoteImagePreviewState({
        enabled: isNearViewport || isLightboxOpen,
        hasObjectUrl: Boolean(imageUrl),
        isLoading: mediaQuery.isLoading,
        found: mediaQuery.data?.found,
        hasError: mediaQuery.isError,
    });

    return (
        <>
            <button
                ref={imageButtonRef}
                type='button'
                aria-label='Open chat image preview'
                className='border-border bg-background/75 focus-visible:ring-ring focus-visible:ring-offset-background block overflow-hidden rounded-[1.25rem] border text-left transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2'
                onClick={() => {
                    setIsLightboxOpen(true);
                }}>
                {previewState === 'ready' && imageUrl ? (
                    <img
                        src={imageUrl}
                        alt='Attached chat image'
                        width={item.width}
                        height={item.height}
                        loading='lazy'
                        decoding='async'
                        className='max-h-[24rem] w-full object-cover'
                        style={{ aspectRatio: `${String(item.width)} / ${String(item.height)}` }}
                    />
                ) : (
                    <div
                        className='bg-muted text-muted-foreground flex w-full items-center justify-center text-sm'
                        style={{ aspectRatio: `${String(item.width)} / ${String(item.height)}` }}>
                        {previewState === 'failed'
                            ? 'Image unavailable'
                            : previewState === 'ready'
                              ? 'Preview ready'
                              : previewState === 'idle'
                                ? 'Preview on demand'
                                : 'Loading image...'}
                    </div>
                )}
                <div className='flex items-center justify-between gap-2 px-3 py-2 text-[11px]'>
                    <span className='text-muted-foreground'>{detail}</span>
                    <span className='text-muted-foreground'>
                        {item.mimeType.replace('image/', '').toUpperCase()} · {getImagePreviewStatusLabel(previewState)}
                    </span>
                </div>
            </button>
            <ImageLightboxModal
                open={isLightboxOpen}
                title='Chat image'
                detail={detail}
                previewState={previewState}
                {...(imageUrl ? { imageUrl } : {})}
                {...(mediaQuery.error?.message ? { errorMessage: mediaQuery.error.message } : {})}
                onClose={() => {
                    setIsLightboxOpen(false);
                }}
            />
        </>
    );
}
