import { FlowMessageView } from '@/web/components/conversation/messages/flow/flowMessageView';

import type { MessageFlowMessage, MessageFlowTurn } from '@/web/components/conversation/messages/messageFlowModel';
import type { RunRecord } from '@/app/backend/persistence/types';

interface MessageFlowTurnViewProps {
    profileId: string;
    turn: MessageFlowTurn;
    run: RunRecord | undefined;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
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
