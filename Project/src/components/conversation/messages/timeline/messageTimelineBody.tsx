import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import { MessageMediaPreview } from '@/web/components/conversation/messages/messageMediaPreview';
import { describeAssistantPlaceholder } from '@/web/components/conversation/messages/messagePlaceholderState';
import type {
    MessageTimelineBodyEntry,
    MessageTimelineEntry,
} from '@/web/components/conversation/messages/messageTimelineModel';
import { ToolArtifactPreviewCard } from '@/web/components/conversation/messages/toolArtifactPreviewCard';
import { WorkbenchStatusRow } from '@/web/components/conversation/messages/workbenchStatusRow';

import type { RunRecord } from '@/app/backend/persistence/types';

import type { EntityId } from '@/shared/contracts';

interface MessageTimelineBodyProps {
    profileId: string;
    entry: MessageTimelineEntry;
    runStatus: RunRecord['status'] | undefined;
    runErrorMessage: string | undefined;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
}

export function MessageTimelineBody({
    profileId,
    entry,
    runStatus,
    runErrorMessage,
    onOpenToolArtifact,
}: MessageTimelineBodyProps) {
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
                        <WorkbenchStatusRow item={item} />
                    ) : 'text' in item ? (
                        <TimelineMessageTextBlock item={item} {...(onOpenToolArtifact ? { onOpenToolArtifact } : {})} />
                    ) : (
                        <MessageMediaPreview profileId={profileId} item={item} />
                    )}
                </div>
            ))}
            {entry.deliveryState === 'sending' ? <MessageDeliveryRow label='Sending...' /> : null}
        </>
    );
}

function TimelineMessageTextBlock({
    item,
    onOpenToolArtifact,
}: {
    item: Extract<MessageTimelineBodyEntry, { text: string }>;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
}) {
    const toolResultItem = item.type === 'tool_result' ? item : undefined;

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
            {toolResultItem?.artifactAvailable && toolResultItem.artifactKind && onOpenToolArtifact ? (
                <ToolArtifactPreviewCard
                    artifactKind={toolResultItem.artifactKind}
                    {...(toolResultItem.totalBytes !== undefined ? { totalBytes: toolResultItem.totalBytes } : {})}
                    {...(toolResultItem.totalLines !== undefined ? { totalLines: toolResultItem.totalLines } : {})}
                    {...(toolResultItem.omittedBytes !== undefined
                        ? { omittedBytes: toolResultItem.omittedBytes }
                        : {})}
                    {...(toolResultItem.summaryMode ? { summaryMode: toolResultItem.summaryMode } : {})}
                    onOpen={() => {
                        onOpenToolArtifact(toolResultItem.messagePartId);
                    }}
                />
            ) : null}
        </>
    );
}

function MessageDeliveryRow({ label }: { label: string }) {
    return <p className='text-muted-foreground text-xs font-medium'>{label}</p>;
}
