import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { MessageMediaPreview } from '@/web/components/conversation/messages/messageMediaPreview';
import { describeAssistantPlaceholder } from '@/web/components/conversation/messages/messagePlaceholderState';

import type { MessageTimelineBodyEntry, MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import type { RunRecord } from '@/app/backend/persistence/types';

interface MessageTimelineBodyProps {
    profileId: string;
    entry: MessageTimelineEntry;
    runStatus: RunRecord['status'] | undefined;
    runErrorMessage: string | undefined;
}

export function MessageTimelineBody({
    profileId,
    entry,
    runStatus,
    runErrorMessage,
}: MessageTimelineBodyProps) {
    if (entry.body.length === 0 && entry.role === 'assistant') {
        return (
            <p className='text-muted-foreground text-sm'>
                {describeAssistantPlaceholder({ runStatus, runErrorMessage })}
            </p>
        );
    }

    if (entry.body.length === 0) {
        return <p className='text-muted-foreground'>No renderable message payload.</p>;
    }

    return (
        <>
            {entry.body.map((item) => (
                <div key={item.id} className='space-y-2'>
                    {'text' in item ? (
                        <TimelineMessageTextBlock item={item} />
                    ) : (
                        <MessageMediaPreview profileId={profileId} item={item} />
                    )}
                </div>
            ))}
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
