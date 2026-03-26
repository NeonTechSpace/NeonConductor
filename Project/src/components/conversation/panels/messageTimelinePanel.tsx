import { useVirtualizer } from '@tanstack/react-virtual';
import { useEffect, useRef, useState } from 'react';

import { MessageTimelineEmptyState, MessageTimelineItem } from '@/web/components/conversation/messages/messageTimeline';
import {
    buildTimelineEntries,
    isWithinBottomThreshold,
} from '@/web/components/conversation/messages/messageTimelineModel';
import type { MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import { useConversationTanstackMessages } from '@/web/components/conversation/messages/useConversationTanstackMessages';
import { Button } from '@/web/components/ui/button';

import type { MessagePartRecord, MessageRecord, RunRecord } from '@/app/backend/persistence/types';

interface MessageTimelinePanelProps {
    profileId: string;
    selectedSessionId?: string;
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    run?: RunRecord;
    optimisticUserMessage?: OptimisticConversationUserMessage;
    onEditMessage?: (entry: MessageTimelineEntry) => void;
    onBranchFromMessage?: (entry: MessageTimelineEntry) => void;
}

export function MessageTimelinePanel({
    profileId,
    selectedSessionId,
    messages,
    partsByMessageId,
    run,
    optimisticUserMessage,
    onEditMessage,
    onBranchFromMessage,
}: MessageTimelinePanelProps) {
    const tanstackMessages = useConversationTanstackMessages({
        messages,
        partsByMessageId,
        ...(selectedSessionId ? { sessionId: selectedSessionId } : {}),
        ...(optimisticUserMessage ? { optimisticUserMessage } : {}),
    });
    const entries = buildTimelineEntries(tanstackMessages);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isAutoStickEnabled, setIsAutoStickEnabled] = useState(true);
    const [isNearBottom, setIsNearBottom] = useState(true);

    const virtualizer = useVirtualizer({
        count: entries.length,
        getScrollElement: () => scrollContainerRef.current,
        getItemKey: (index) => entries[index]?.id ?? String(index),
        estimateSize: () => 220,
        overscan: 8,
    });

    useEffect(() => {
        if (entries.length === 0) {
            setIsNearBottom(true);
            setIsAutoStickEnabled(true);
            return;
        }

        const container = scrollContainerRef.current;
        if (!container) {
            return;
        }

        const nearBottom = isWithinBottomThreshold({
            scrollHeight: container.scrollHeight,
            scrollTop: container.scrollTop,
            clientHeight: container.clientHeight,
        });
        setIsNearBottom(nearBottom);
        if (nearBottom) {
            setIsAutoStickEnabled(true);
        }
    }, [entries]);

    const latestEntryId = entries[entries.length - 1]?.id;

    useEffect(() => {
        if (!latestEntryId || !isAutoStickEnabled || entries.length === 0) {
            return;
        }

        virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
    }, [entries.length, isAutoStickEnabled, latestEntryId, virtualizer]);

    function syncScrollState() {
        const container = scrollContainerRef.current;
        if (!container) {
            return;
        }

        const nearBottom = isWithinBottomThreshold({
            scrollHeight: container.scrollHeight,
            scrollTop: container.scrollTop,
            clientHeight: container.clientHeight,
        });

        setIsNearBottom(nearBottom);
        setIsAutoStickEnabled(nearBottom);
    }

    const showJumpToLatest = entries.length > 0 && !isNearBottom;

    function jumpToLatest() {
        if (entries.length === 0) {
            return;
        }

        virtualizer.scrollToIndex(entries.length - 1, { align: 'end' });
        setIsAutoStickEnabled(true);
        setIsNearBottom(true);
    }

    return (
        <div className='relative min-h-0 flex-1'>
            <div ref={scrollContainerRef} className='h-full min-h-0 overflow-y-auto pr-1' onScroll={syncScrollState}>
                {entries.length === 0 ? (
                    <div className='flex h-full min-h-0'>
                        <MessageTimelineEmptyState />
                    </div>
                ) : (
                    <div className='relative w-full' style={{ height: `${String(virtualizer.getTotalSize())}px` }}>
                        {virtualizer.getVirtualItems().map((virtualRow) => {
                            const entry = entries[virtualRow.index];
                            if (!entry) {
                                return null;
                            }

                            return (
                                <div
                                    key={virtualRow.key}
                                    ref={virtualizer.measureElement}
                                    data-index={virtualRow.index}
                                    className='absolute top-0 left-0 w-full pb-3'
                                    style={{ transform: `translateY(${String(virtualRow.start)}px)` }}>
                                    <MessageTimelineItem
                                        profileId={profileId}
                                        entry={entry}
                                        {...(run ? { runStatus: run.status } : {})}
                                        {...(run?.errorMessage ? { runErrorMessage: run.errorMessage } : {})}
                                        canBranch={Boolean(onBranchFromMessage)}
                                        {...(onEditMessage ? { onEditMessage } : {})}
                                        {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                                    />
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
            {showJumpToLatest ? (
                <div className='pointer-events-none absolute right-4 bottom-4'>
                    <Button
                        type='button'
                        size='sm'
                        variant='secondary'
                        className='pointer-events-auto shadow-sm'
                        onClick={jumpToLatest}>
                        Jump to latest
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
