import { Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { getImagePreviewStatusLabel, getRemoteImagePreviewState } from '@/web/components/conversation/messages/imagePreviewState';
import type { MessageTimelineBodyEntry, MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import { useMessageMediaUrl } from '@/web/components/conversation/messages/useMessageMediaUrl';
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';
import { Button } from '@/web/components/ui/button';
import { copyText } from '@/web/lib/copy';

interface MessageTimelineItemProps {
    profileId: string;
    entry: MessageTimelineEntry;
    canBranch: boolean;
    onEditMessage?: (entry: MessageTimelineEntry) => void;
    onBranchFromMessage?: (entry: MessageTimelineEntry) => void;
}

function TimelineImagePart({
    profileId,
    item,
}: {
    profileId: string;
    item: Extract<MessageTimelineBodyEntry, { mediaId: string }>;
}) {
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
    const detail = `${String(item.width)} × ${String(item.height)}`;
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
                className='border-border bg-background/75 focus-visible:ring-ring focus-visible:ring-offset-background block overflow-hidden rounded-2xl border text-left transition hover:shadow-md focus-visible:ring-2 focus-visible:ring-offset-2'
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
                                : 'Loading image…'}
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

export function MessageTimelineEmptyState() {
    return (
        <div className='flex h-full min-h-[16rem] items-center justify-center'>
            <div className='text-muted-foreground border-border bg-card/60 max-w-xl rounded-2xl border px-6 py-8 text-center text-sm'>
                No messages yet for this session. Start a run to populate the timeline.
            </div>
        </div>
    );
}

export function MessageTimelineItem({
    profileId,
    entry,
    canBranch,
    onEditMessage,
    onBranchFromMessage,
}: MessageTimelineItemProps) {
    const canEdit = entry.role === 'user' && typeof entry.editableText === 'string' && entry.editableText.length > 0;
    const canCopy = typeof entry.plainCopyText === 'string' && entry.plainCopyText.length > 0;
    const [copyFeedback, setCopyFeedback] = useState<string | undefined>(undefined);

    async function handleCopy(sourceMode: 'plain' | 'raw') {
        const payload = sourceMode === 'raw' ? entry.rawCopyText : entry.plainCopyText;
        if (!payload) {
            return;
        }

        const copied = await copyText(payload);
        setCopyFeedback(copied ? (sourceMode === 'raw' ? 'Source copied' : 'Copied') : 'Copy failed');
        window.setTimeout(() => {
            setCopyFeedback(undefined);
        }, 1400);
    }

    return (
        <article className='border-border bg-card rounded-xl border p-4 shadow-sm'>
            <header className='mb-2 flex items-center justify-between gap-2'>
                <div className='flex items-center gap-2'>
                    <span className='bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase'>
                        {entry.role}
                    </span>
                    <span className='text-muted-foreground text-xs'>
                        {new Date(entry.createdAt).toLocaleTimeString()}
                    </span>
                </div>
                <div className='flex items-center gap-1'>
                    {copyFeedback ? <span className='text-muted-foreground px-1 text-[11px]'>{copyFeedback}</span> : null}
                    {canCopy ? (
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            className='h-7 px-2 text-[11px]'
                            title='Copy rendered text. Shift-click to copy source markdown.'
                            aria-label='Copy message'
                            onClick={(event) => {
                                void handleCopy(event.shiftKey ? 'raw' : 'plain');
                            }}>
                            <Copy className='h-3.5 w-3.5' />
                            Copy
                        </Button>
                    ) : null}
                    {canEdit ? (
                        <div className='flex items-center gap-1'>
                            <button
                                type='button'
                                className='border-border bg-background hover:bg-accent rounded border px-2 py-0.5 text-[11px]'
                                onClick={() => {
                                    onEditMessage?.(entry);
                                }}>
                                Edit
                            </button>
                            {canBranch ? (
                                <button
                                    type='button'
                                    className='border-border bg-background hover:bg-accent rounded border px-2 py-0.5 text-[11px]'
                                    onClick={() => {
                                        onBranchFromMessage?.(entry);
                                    }}>
                                    Branch
                                </button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </header>
            <div className='space-y-3'>
                {entry.body.length > 0 ? (
                    entry.body.map((item) => (
                        <div key={item.id} className='space-y-2'>
                            {'text' in item ? (
                                <>
                                    {item.type === 'assistant_reasoning' ? (
                                        <div className='text-primary inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide uppercase'>
                                            Reasoning
                                            {item.providerLimitedReasoning ? (
                                                <span className='text-muted-foreground text-[10px] tracking-normal lowercase'>
                                                    provider-limited
                                                </span>
                                            ) : null}
                                        </div>
                                    ) : null}
                                    <MarkdownContent markdown={item.text} />
                                </>
                            ) : (
                                <TimelineImagePart profileId={profileId} item={item} />
                            )}
                        </div>
                    ))
                ) : (
                    <p className='text-muted-foreground'>No renderable message payload.</p>
                )}
            </div>
        </article>
    );
}
