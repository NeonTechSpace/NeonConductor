import { useEffect, useRef, useState } from 'react';

import { MessageFlowEmptyState, MessageFlowTurnView } from '@/web/components/conversation/messages/messageFlow';
import {
    buildMessageFlowTurns,
    isWithinBottomThreshold,
    type MessageFlowMessage,
} from '@/web/components/conversation/messages/messageFlowModel';
import type { OptimisticConversationUserMessage } from '@/web/components/conversation/messages/optimisticUserMessage';
import { useConversationTanstackMessages } from '@/web/components/conversation/messages/useConversationTanstackMessages';
import { Button } from '@/web/components/ui/button';

import type { MessagePartRecord, MessageRecord, RunRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/shared/contracts';

interface MessageFlowPanelProps {
    profileId: string;
    selectedSessionId?: string;
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    runs: RunRecord[];
    optimisticUserMessage?: OptimisticConversationUserMessage;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
    onOpenToolArtifact?: (messagePartId: EntityId<'part'>) => void;
    onPromoteMessage?: (messageId: EntityId<'msg'>) => void;
}

export function MessageFlowPanel({
    profileId,
    selectedSessionId,
    messages,
    partsByMessageId,
    runs,
    optimisticUserMessage,
    onEditMessage,
    onBranchFromMessage,
    onOpenToolArtifact,
    onPromoteMessage,
}: MessageFlowPanelProps) {
    const tanstackMessages = useConversationTanstackMessages({
        messages,
        partsByMessageId,
        ...(selectedSessionId ? { sessionId: selectedSessionId } : {}),
        ...(optimisticUserMessage ? { optimisticUserMessage } : {}),
    });
    const turns = buildMessageFlowTurns(tanstackMessages);
    const scrollContainerRef = useRef<HTMLDivElement>(null);
    const [isAutoStickEnabled, setIsAutoStickEnabled] = useState(true);
    const [isNearBottom, setIsNearBottom] = useState(true);
    const runsById = new Map<string, RunRecord>(runs.map((run) => [run.id, run]));

    useEffect(() => {
        if (turns.length === 0) {
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
    }, [turns]);

    useEffect(() => {
        if (!isAutoStickEnabled || turns.length === 0) {
            return;
        }

        const container = scrollContainerRef.current;
        if (!container) {
            return;
        }

        container.scrollTop = container.scrollHeight;
    }, [isAutoStickEnabled, turns]);

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

    function jumpToLatest() {
        const container = scrollContainerRef.current;
        if (!container) {
            return;
        }

        container.scrollTop = container.scrollHeight;
        setIsAutoStickEnabled(true);
        setIsNearBottom(true);
    }

    return (
        <div className='relative min-h-0 flex-1'>
            <div
                ref={scrollContainerRef}
                className='message-flow-scroll h-full min-h-0 overflow-y-auto px-1'
                onScroll={syncScrollState}>
                {turns.length === 0 ? (
                    <div className='flex h-full min-h-0'>
                        <MessageFlowEmptyState />
                    </div>
                ) : (
                    <div className='mx-auto flex w-full max-w-[60rem] flex-col gap-10 pb-8'>
                        {turns.map((turn) => (
                            <MessageFlowTurnView
                                key={turn.id}
                                profileId={profileId}
                                turn={turn}
                                run={runsById.get(turn.runId)}
                                {...(onEditMessage ? { onEditMessage } : {})}
                                {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                                {...(onOpenToolArtifact ? { onOpenToolArtifact } : {})}
                                {...(onPromoteMessage ? { onPromoteMessage } : {})}
                            />
                        ))}
                    </div>
                )}
            </div>
            {turns.length > 0 && !isNearBottom ? (
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
