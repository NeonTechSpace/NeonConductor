import { useState } from 'react';

import type { MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import { MessageTimelineBody } from '@/web/components/conversation/messages/timeline/messageTimelineBody';
import { MessageTimelineHeader } from '@/web/components/conversation/messages/timeline/messageTimelineHeader';

import type { RunRecord } from '@/app/backend/persistence/types';

interface MessageTimelineItemProps {
    profileId: string;
    entry: MessageTimelineEntry;
    runStatus?: RunRecord['status'];
    runErrorMessage?: string;
    canBranch: boolean;
    onEditMessage?: (entry: MessageTimelineEntry) => void;
    onBranchFromMessage?: (entry: MessageTimelineEntry) => void;
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
    runStatus,
    runErrorMessage,
    canBranch,
    onEditMessage,
    onBranchFromMessage,
}: MessageTimelineItemProps) {
    const [copyFeedback, setCopyFeedback] = useState<string | undefined>(undefined);

    return (
        <article className='border-border bg-card rounded-xl border p-4 shadow-sm'>
            <MessageTimelineHeader
                entry={entry}
                canBranch={canBranch}
                copyFeedback={copyFeedback}
                onCopyFeedbackChange={setCopyFeedback}
                {...(onEditMessage ? { onEditMessage } : {})}
                {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
            />
            <div className='space-y-3'>
                <MessageTimelineBody
                    profileId={profileId}
                    entry={entry}
                    runStatus={runStatus}
                    runErrorMessage={runErrorMessage}
                />
            </div>
        </article>
    );
}
