import { X } from 'lucide-react';
import { useEffect, useId, useRef } from 'react';

import type { ImagePreviewState } from '@/web/components/conversation/messages/imagePreviewState';
import { Button } from '@/web/components/ui/button';

interface ImageLightboxModalProps {
    open: boolean;
    imageUrl?: string;
    title?: string;
    detail?: string;
    previewState: ImagePreviewState;
    errorMessage?: string;
    onClose: () => void;
}

export function ImageLightboxModal({
    open,
    imageUrl,
    title,
    detail,
    previewState,
    errorMessage,
    onClose,
}: ImageLightboxModalProps) {
    const dialogTitleId = useId();
    const dialogDetailId = useId();
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);
    const restoreFocusElementRef = useRef<HTMLElement | null>(null);

    useEffect(() => {
        if (!open) {
            return;
        }

        restoreFocusElementRef.current =
            document.activeElement instanceof HTMLElement ? document.activeElement : null;

        const previousOverflow = document.body.style.overflow;
        const previousOverscrollBehavior = document.body.style.overscrollBehavior;
        document.body.style.overflow = 'hidden';
        document.body.style.overscrollBehavior = 'contain';

        function handleKeyDown(event: KeyboardEvent) {
            if (event.key === 'Escape') {
                onClose();
            }
        }

        window.addEventListener('keydown', handleKeyDown);
        closeButtonRef.current?.focus();
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = previousOverflow;
            document.body.style.overscrollBehavior = previousOverscrollBehavior;
            restoreFocusElementRef.current?.focus();
            restoreFocusElementRef.current = null;
        };
    }, [onClose, open]);

    if (!open) {
        return null;
    }

    return (
        <div className='fixed inset-0 z-50 flex items-center justify-center overscroll-contain px-4 py-6'>
            <button
                type='button'
                aria-label='Close image preview'
                className='fixed inset-0 bg-black/78 backdrop-blur-md'
                onClick={onClose}
            />
            <div
                role='dialog'
                aria-modal='true'
                aria-labelledby={dialogTitleId}
                aria-describedby={detail ? dialogDetailId : undefined}
                className='border-border bg-card relative z-10 flex max-h-full w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border shadow-2xl'>
                <div className='border-border flex items-start justify-between gap-3 border-b px-4 py-3'>
                    <div className='min-w-0'>
                        <p id={dialogTitleId} className='truncate text-sm font-semibold'>
                            {title ?? 'Image preview'}
                        </p>
                        {detail ? (
                            <p id={dialogDetailId} className='text-muted-foreground truncate text-xs'>
                                {detail}
                            </p>
                        ) : null}
                    </div>
                    <Button
                        ref={closeButtonRef}
                        type='button'
                        size='sm'
                        variant='outline'
                        className='shrink-0'
                        onClick={onClose}>
                        <X className='h-4 w-4' />
                        Close
                    </Button>
                </div>
                <div className='bg-background/70 flex min-h-0 flex-1 items-center justify-center overflow-auto p-4 sm:p-6'>
                    {previewState === 'ready' && imageUrl ? (
                        <img
                            src={imageUrl}
                            alt={title ?? 'Expanded chat image'}
                            decoding='async'
                            className='max-h-[calc(100vh-12rem)] max-w-full rounded-2xl object-contain shadow-[0_24px_80px_rgba(0,0,0,0.35)]'
                        />
                    ) : previewState === 'loading' || previewState === 'idle' ? (
                        <div className='text-muted-foreground flex min-h-[18rem] w-full max-w-3xl items-center justify-center rounded-2xl border border-dashed text-sm'>
                            {previewState === 'idle' ? 'Preparing preview…' : 'Loading image…'}
                        </div>
                    ) : (
                        <div className='flex min-h-[18rem] w-full max-w-3xl items-center justify-center rounded-2xl border border-dashed border-destructive/25 bg-destructive/5 px-4 text-center text-sm text-destructive'>
                            {errorMessage ?? 'Image preview is unavailable.'}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
