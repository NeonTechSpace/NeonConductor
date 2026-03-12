import { ChevronDown, Copy, GitBranch, PencilLine } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import {
    getImagePreviewStatusLabel,
    getRemoteImagePreviewState,
} from '@/web/components/conversation/messages/imagePreviewState';
import type {
    MessageFlowBodyEntry,
    MessageFlowMessage,
    MessageFlowTurn,
} from '@/web/components/conversation/messages/messageFlowModel';
import { useMessageMediaUrl } from '@/web/components/conversation/messages/useMessageMediaUrl';
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';
import { copyText } from '@/web/lib/copy';

import type { RunRecord } from '@/app/backend/persistence/types';
import type { FocusEvent, MouseEvent, ReactNode } from 'react';

interface MessageFlowTurnViewProps {
    profileId: string;
    turn: MessageFlowTurn;
    run: RunRecord | undefined;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
}

function describeAssistantPlaceholder(input: {
    runStatus: RunRecord['status'] | undefined;
    runErrorMessage: string | undefined;
}): string {
    if (input.runStatus === 'error') {
        return input.runErrorMessage?.trim().length
            ? `Run failed before any assistant output was recorded. ${input.runErrorMessage}`
            : 'Run failed before any assistant output was recorded.';
    }

    if (input.runStatus === 'aborted') {
        return 'Run was aborted before any assistant output was recorded.';
    }

    if (input.runStatus === 'completed') {
        return 'Run completed without any renderable assistant output.';
    }

    return 'Assistant is responding...';
}

function MessageActionButton({
    label,
    ariaLabel,
    icon,
    tabIndex,
    title,
    onClick,
}: {
    label: string;
    ariaLabel: string;
    icon: ReactNode;
    tabIndex?: number;
    title?: string;
    onClick: (event: MouseEvent<HTMLButtonElement>) => void;
}) {
    return (
        <button
            type='button'
            aria-label={ariaLabel}
            tabIndex={tabIndex}
            title={title}
            className='border-border bg-background/80 text-foreground hover:bg-accent inline-flex min-h-10 items-center gap-2 rounded-full border px-3 text-xs font-medium transition-colors'
            onClick={onClick}>
            {icon}
            <span>{label}</span>
        </button>
    );
}

function TimelineImagePart({
    profileId,
    item,
}: {
    profileId: string;
    item: Extract<MessageFlowBodyEntry, { mediaId: string }>;
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

function MessageBody({
    profileId,
    message,
    run,
}: {
    profileId: string;
    message: MessageFlowMessage;
    run: RunRecord | undefined;
}) {
    const reasoningEntries = message.body.filter(
        (item): item is { id: string; type: 'assistant_reasoning'; text: string; providerLimitedReasoning: boolean } =>
            'text' in item && item.type === 'assistant_reasoning'
    );
    const contentEntries = message.body.filter((item) => !('text' in item && item.type === 'assistant_reasoning'));

    if (contentEntries.length === 0 && reasoningEntries.length === 0 && message.role === 'assistant') {
        return (
            <p className='text-muted-foreground text-sm'>
                {describeAssistantPlaceholder({ runStatus: run?.status, runErrorMessage: run?.errorMessage })}
            </p>
        );
    }

    if (contentEntries.length === 0 && reasoningEntries.length === 0) {
        return <p className='text-muted-foreground text-sm'>No renderable message payload.</p>;
    }

    return (
        <div className='space-y-4'>
            {reasoningEntries.length > 0 ? (
                <details className='border-border/70 bg-background/55 rounded-[1.1rem] border'>
                    <summary className='flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold'>
                        <span className='inline-flex items-center gap-2'>
                            Reasoning
                            {reasoningEntries.some((entry) => entry.providerLimitedReasoning) ? (
                                <span className='text-muted-foreground text-[11px] font-medium'>provider-limited</span>
                            ) : null}
                        </span>
                        <ChevronDown className='text-muted-foreground h-4 w-4' />
                    </summary>
                    <div className='border-border/70 space-y-3 border-t px-4 py-4'>
                        {reasoningEntries.map((entry) => (
                            <MarkdownContent key={entry.id} markdown={entry.text} />
                        ))}
                    </div>
                </details>
            ) : null}
            {contentEntries.map((item) => (
                <div key={item.id} className='space-y-2'>
                    {'text' in item ? (
                        <>
                            {item.displayLabel ? (
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                    {item.displayLabel}
                                </p>
                            ) : null}
                            <MarkdownContent markdown={item.text} />
                        </>
                    ) : (
                        <TimelineImagePart profileId={profileId} item={item} />
                    )}
                </div>
            ))}
        </div>
    );
}

function MessageCopyFeedback({ feedback }: { feedback: string | undefined }) {
    if (!feedback) {
        return null;
    }

    return <span className='text-muted-foreground text-[11px]'>{feedback}</span>;
}

function FlowMessageView({
    profileId,
    message,
    run,
    onEditMessage,
    onBranchFromMessage,
}: {
    profileId: string;
    message: MessageFlowMessage;
    run: RunRecord | undefined;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
}) {
    const [copyFeedback, setCopyFeedback] = useState<string | undefined>(undefined);
    const [isPinnedVisible, setIsPinnedVisible] = useState(false);
    const canCopy = typeof message.plainCopyText === 'string' && message.plainCopyText.length > 0;
    const canEdit =
        message.role === 'user' && typeof message.editableText === 'string' && message.editableText.length > 0;
    const isUserMessage = message.role === 'user';
    const isAssistantMessage = message.role === 'assistant';
    const hasRenderableBody = message.body.length > 0;
    const canBranch = message.role === 'user' || (message.role === 'assistant' && hasRenderableBody);

    async function handleCopy(sourceMode: 'plain' | 'raw') {
        const payload = sourceMode === 'raw' ? message.rawCopyText : message.plainCopyText;
        if (!payload) {
            return;
        }

        const copied = await copyText(payload);
        setCopyFeedback(copied ? (sourceMode === 'raw' ? 'Source copied' : 'Copied') : 'Copy failed');
        window.setTimeout(() => {
            setCopyFeedback(undefined);
        }, 1400);
    }

    function handleUserMessageBlur(event: FocusEvent<HTMLElement>) {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) {
            return;
        }

        setIsPinnedVisible(false);
    }

    const userActionRailClassName = [
        'pointer-events-none absolute right-0 bottom-0 flex translate-y-1 items-center gap-2 opacity-0 transition duration-150',
        'group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100',
        'group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100',
        isPinnedVisible ? 'pointer-events-auto translate-y-0 opacity-100' : '',
    ].join(' ');

    if (isUserMessage) {
        return (
            <div className='flex justify-end'>
                <article
                    className='group focus-visible:ring-ring focus-visible:ring-offset-background relative max-w-[min(40rem,82%)] rounded-[1.6rem] focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none'
                    tabIndex={0}
                    onClick={() => {
                        setIsPinnedVisible(true);
                    }}
                    onFocus={() => {
                        setIsPinnedVisible(true);
                    }}
                    onBlur={handleUserMessageBlur}>
                    <div className='bg-card/85 border-border/70 rounded-[1.4rem] border px-4 py-3 shadow-[0_18px_48px_rgba(4,8,18,0.12)]'>
                        <MessageBody profileId={profileId} message={message} run={run} />
                    </div>
                    <div className='relative min-h-14 pt-3'>
                        <div className={userActionRailClassName}>
                            <MessageCopyFeedback feedback={copyFeedback} />
                            {canEdit ? (
                                <MessageActionButton
                                    label='Edit'
                                    ariaLabel='Edit message'
                                    icon={<PencilLine className='h-3.5 w-3.5' />}
                                    tabIndex={isPinnedVisible ? 0 : -1}
                                    onClick={() => {
                                        onEditMessage?.(message);
                                    }}
                                />
                            ) : null}
                            {canCopy ? (
                                <MessageActionButton
                                    label='Copy'
                                    ariaLabel='Copy message'
                                    icon={<Copy className='h-3.5 w-3.5' />}
                                    tabIndex={isPinnedVisible ? 0 : -1}
                                    title='Copy rendered text. Shift-click to copy source markdown.'
                                    onClick={(event) => {
                                        void handleCopy(event.shiftKey ? 'raw' : 'plain');
                                    }}
                                />
                            ) : null}
                            {canBranch && onBranchFromMessage ? (
                                <MessageActionButton
                                    label='Branch'
                                    ariaLabel='Branch from message'
                                    icon={<GitBranch className='h-3.5 w-3.5' />}
                                    tabIndex={isPinnedVisible ? 0 : -1}
                                    onClick={() => {
                                        onBranchFromMessage(message);
                                    }}
                                />
                            ) : null}
                        </div>
                    </div>
                </article>
            </div>
        );
    }

    return (
        <article className='space-y-4'>
            <div className='max-w-[min(52rem,100%)] space-y-4'>
                <MessageBody profileId={profileId} message={message} run={run} />
            </div>
            {isAssistantMessage ? (
                <div className='flex flex-wrap items-center gap-3'>
                    <MessageCopyFeedback feedback={copyFeedback} />
                    {canCopy ? (
                        <MessageActionButton
                            label='Copy'
                            ariaLabel='Copy message'
                            icon={<Copy className='h-3.5 w-3.5' />}
                            title='Copy rendered text. Shift-click to copy source markdown.'
                            onClick={(event) => {
                                void handleCopy(event.shiftKey ? 'raw' : 'plain');
                            }}
                        />
                    ) : null}
                    {canBranch && onBranchFromMessage ? (
                        <MessageActionButton
                            label='Branch'
                            ariaLabel='Branch from message'
                            icon={<GitBranch className='h-3.5 w-3.5' />}
                            onClick={() => {
                                onBranchFromMessage(message);
                            }}
                        />
                    ) : null}
                </div>
            ) : null}
        </article>
    );
}

export function MessageFlowEmptyState() {
    return (
        <div className='flex min-h-[16rem] items-center justify-center'>
            <div className='text-muted-foreground border-border bg-card/50 max-w-xl rounded-[1.6rem] border px-6 py-8 text-center text-sm'>
                No messages yet for this session. Start a run to populate the conversation.
            </div>
        </div>
    );
}

export function MessageFlowTurnView({
    profileId,
    turn,
    run,
    onEditMessage,
    onBranchFromMessage,
}: MessageFlowTurnViewProps) {
    return (
        <section className='space-y-6'>
            {turn.messages.map((message) => (
                <FlowMessageView
                    key={message.id}
                    profileId={profileId}
                    message={message}
                    run={run}
                    {...(onEditMessage ? { onEditMessage } : {})}
                    {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                />
            ))}
        </section>
    );
}
