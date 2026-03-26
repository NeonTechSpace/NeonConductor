import { useState } from 'react';

import {
    FlowAssistantMessageActionBar,
    FlowUserMessageActionBar,
} from '@/web/components/conversation/messages/flow/messageFlowActionBar';
import { MessageFlowBody } from '@/web/components/conversation/messages/flow/messageFlowBody';
import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import { readRelatedTargetNode } from '@/web/lib/dom/readRelatedTargetNode';

import type { RunRecord } from '@/app/backend/persistence/types';

import type { FocusEvent } from 'react';


interface FlowMessageViewProps {
    profileId: string;
    message: MessageFlowMessage;
    run: RunRecord | undefined;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
}

export function FlowMessageView({ profileId, message, run, onEditMessage, onBranchFromMessage }: FlowMessageViewProps) {
    const [copyFeedback, setCopyFeedback] = useState<string | undefined>(undefined);
    const [isPinnedVisible, setIsPinnedVisible] = useState(false);
    const isUserMessage = message.role === 'user';
    const isAssistantMessage = message.role === 'assistant';

    function handleUserMessageBlur(event: FocusEvent<HTMLElement>) {
        if (event.currentTarget.contains(readRelatedTargetNode(event.relatedTarget))) {
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
                        <MessageFlowBody profileId={profileId} message={message} run={run} />
                    </div>
                    <div className='relative min-h-14 pt-3'>
                        <div className={userActionRailClassName}>
                            <FlowUserMessageActionBar
                                message={message}
                                copyFeedback={copyFeedback}
                                onCopyFeedbackChange={setCopyFeedback}
                                isPinnedVisible={isPinnedVisible}
                                {...(onEditMessage ? { onEditMessage } : {})}
                                {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                            />
                        </div>
                    </div>
                </article>
            </div>
        );
    }

    return (
        <article className='space-y-4'>
            <div className='max-w-[min(52rem,100%)] space-y-4'>
                <MessageFlowBody profileId={profileId} message={message} run={run} />
            </div>
            {isAssistantMessage ? (
                <FlowAssistantMessageActionBar
                    message={message}
                    copyFeedback={copyFeedback}
                    onCopyFeedbackChange={setCopyFeedback}
                    {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                />
            ) : null}
        </article>
    );
}
