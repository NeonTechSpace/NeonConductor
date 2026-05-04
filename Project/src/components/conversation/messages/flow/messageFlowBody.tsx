import { ChevronDown } from 'lucide-react';

import { MarkdownContent } from '@/web/components/content/markdown/markdownContent';
import type { MessageFlowBodyEntry, MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import { MessageMediaPreview } from '@/web/components/conversation/messages/messageMediaPreview';
import { describeAssistantPlaceholder } from '@/web/components/conversation/messages/messagePlaceholderState';
import { WorkbenchStatusRow } from '@/web/components/conversation/messages/workbenchStatusRow';
import { WorkbenchToolCallRow, WorkbenchToolResultRow } from '@/web/components/conversation/messages/workbenchToolRows';

import type { RunRecord } from '@/app/backend/persistence/types';

import type { EntityId } from '@/shared/contracts';

interface MessageFlowBodyProps {
    profileId: string;
    message: MessageFlowMessage;
    run: RunRecord | undefined;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
}

export function MessageFlowBody({ profileId, message, run, onOpenToolArtifact }: MessageFlowBodyProps) {
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
        return message.deliveryState === 'sending' ? (
            <MessageDeliveryRow label='Sending...' />
        ) : (
            <p className='text-muted-foreground text-sm'>No renderable message payload.</p>
        );
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
                    {'label' in item ? (
                        <WorkbenchStatusRow item={item} />
                    ) : 'text' in item ? (
                        <FlowMessageTextBlock item={item} {...(onOpenToolArtifact ? { onOpenToolArtifact } : {})} />
                    ) : (
                        <MessageMediaPreview profileId={profileId} item={item} />
                    )}
                </div>
            ))}
            {message.deliveryState === 'sending' ? <MessageDeliveryRow label='Sending...' /> : null}
        </div>
    );
}

function FlowMessageTextBlock({
    item,
    onOpenToolArtifact,
}: {
    item: Extract<MessageFlowBodyEntry, { text: string }>;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
}) {
    if (item.type === 'assistant_tool_call') {
        return <WorkbenchToolCallRow item={item} />;
    }

    if (item.type === 'tool_result') {
        return <WorkbenchToolResultRow item={item} {...(onOpenToolArtifact ? { onOpenToolArtifact } : {})} />;
    }

    return (
        <>
            {item.displayLabel ? (
                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    {item.displayLabel}
                </p>
            ) : null}
            <MarkdownContent markdown={item.text} />
        </>
    );
}

function MessageDeliveryRow({ label }: { label: string }) {
    return <p className='text-muted-foreground text-xs font-medium'>{label}</p>;
}
