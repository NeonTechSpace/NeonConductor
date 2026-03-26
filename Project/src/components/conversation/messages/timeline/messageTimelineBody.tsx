import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { MessageMediaPreview } from '@/web/components/conversation/messages/messageMediaPreview';
import { describeAssistantPlaceholder } from '@/web/components/conversation/messages/messagePlaceholderState';
import type {
    MessageTimelineBodyEntry,
    MessageTimelineEntry,
} from '@/web/components/conversation/messages/messageTimelineModel';

import type { RunRecord } from '@/app/backend/persistence/types';

interface MessageTimelineBodyProps {
    profileId: string;
    entry: MessageTimelineEntry;
    runStatus: RunRecord['status'] | undefined;
    runErrorMessage: string | undefined;
}

export function MessageTimelineBody({ profileId, entry, runStatus, runErrorMessage }: MessageTimelineBodyProps) {
    if (entry.body.length === 0 && entry.role === 'assistant') {
        return (
            <p className='text-muted-foreground text-sm'>
                {describeAssistantPlaceholder({ runStatus, runErrorMessage })}
            </p>
        );
    }

    if (entry.body.length === 0) {
        return entry.deliveryState === 'sending' ? (
            <MessageDeliveryRow label='Sending...' />
        ) : (
            <p className='text-muted-foreground'>No renderable message payload.</p>
        );
    }

    return (
        <>
            {entry.body.map((item) => (
                <div key={item.id} className='space-y-2'>
                    {'label' in item ? (
                        <AssistantStatusRow item={item} />
                    ) : 'text' in item ? (
                        <TimelineMessageTextBlock item={item} />
                    ) : (
                        <MessageMediaPreview profileId={profileId} item={item} />
                    )}
                </div>
            ))}
            {entry.deliveryState === 'sending' ? <MessageDeliveryRow label='Sending...' /> : null}
        </>
    );
}

function TimelineMessageTextBlock({ item }: { item: Extract<MessageTimelineBodyEntry, { text: string }> }) {
    return (
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
            ) : item.displayLabel ? (
                <div className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    {item.displayLabel}
                </div>
            ) : null}
            <MarkdownContent markdown={item.text} />
        </>
    );
}

function AssistantStatusRow({ item }: { item: Extract<MessageTimelineBodyEntry, { type: 'assistant_status' }> }) {
    const className =
        item.code === 'failed_before_output'
            ? 'border-destructive/30 bg-destructive/5 text-destructive'
            : 'border-border/70 bg-background/60 text-muted-foreground';

    return (
        <div
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium ${className}`}>
            <span
                className={`h-1.5 w-1.5 rounded-full ${item.code === 'failed_before_output' ? 'bg-current' : 'animate-pulse bg-current'}`}
            />
            <span>{item.label}</span>
        </div>
    );
}

function MessageDeliveryRow({ label }: { label: string }) {
    return <p className='text-muted-foreground text-xs font-medium'>{label}</p>;
}
