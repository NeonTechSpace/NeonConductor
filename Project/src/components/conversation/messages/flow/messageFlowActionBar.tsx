import { Copy, GitBranch, PencilLine, Sparkles } from 'lucide-react';

import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { copyText } from '@/web/lib/copy';

import type { EntityId } from '@/shared/contracts';

import type { MouseEvent, ReactNode } from 'react';

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

export function MessageCopyFeedback({ feedback }: { feedback: string | undefined }) {
    if (!feedback) {
        return null;
    }

    return <span className='text-muted-foreground text-[11px]'>{feedback}</span>;
}

interface FlowMessageActionBarProps {
    message: MessageFlowMessage;
    copyFeedback: string | undefined;
    onCopyFeedbackChange: (value: string | undefined) => void;
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
    onPromoteMessage?: (messageId: EntityId<'msg'>) => void;
    isPinnedVisible?: boolean;
}

export function getFlowMessageCapabilities(message: MessageFlowMessage) {
    const hasBranchableAssistantContent = message.body.some((item) => item.type !== 'assistant_status');

    return {
        canCopy: !message.isOptimistic && typeof message.plainCopyText === 'string' && message.plainCopyText.length > 0,
        canEdit:
            !message.isOptimistic &&
            message.role === 'user' &&
            typeof message.editableText === 'string' &&
            message.editableText.length > 0,
        canBranch:
            !message.isOptimistic &&
            (message.role === 'user' || (message.role === 'assistant' && hasBranchableAssistantContent)),
        canPromote:
            !message.isOptimistic &&
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.plainCopyText === 'string' &&
            message.plainCopyText.length > 0,
    };
}

export async function copyFlowMessage(
    message: MessageFlowMessage,
    sourceMode: 'plain' | 'raw',
    onCopyFeedbackChange: (value: string | undefined) => void
) {
    const payload = sourceMode === 'raw' ? message.rawCopyText : message.plainCopyText;
    if (!payload) {
        return;
    }

    const copied = await copyText(payload);
    onCopyFeedbackChange(copied ? (sourceMode === 'raw' ? 'Source copied' : 'Copied') : 'Copy failed');
    window.setTimeout(() => {
        onCopyFeedbackChange(undefined);
    }, 1400);
}

export function FlowUserMessageActionBar({
    message,
    copyFeedback,
    onCopyFeedbackChange,
    onEditMessage,
    onBranchFromMessage,
    onPromoteMessage,
    isPinnedVisible = false,
}: FlowMessageActionBarProps) {
    const capabilities = getFlowMessageCapabilities(message);

    return (
        <>
            <MessageCopyFeedback feedback={copyFeedback} />
            {capabilities.canEdit ? (
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
            {capabilities.canCopy ? (
                <MessageActionButton
                    label='Copy'
                    ariaLabel='Copy message'
                    icon={<Copy className='h-3.5 w-3.5' />}
                    tabIndex={isPinnedVisible ? 0 : -1}
                    title='Copy rendered text. Shift-click to copy source markdown.'
                    onClick={(event) => {
                        void copyFlowMessage(message, event.shiftKey ? 'raw' : 'plain', onCopyFeedbackChange);
                    }}
                />
            ) : null}
            {capabilities.canBranch && onBranchFromMessage ? (
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
            {capabilities.canPromote && onPromoteMessage ? (
                <MessageActionButton
                    label='Promote'
                    ariaLabel='Promote message'
                    icon={<Sparkles className='h-3.5 w-3.5' />}
                    tabIndex={isPinnedVisible ? 0 : -1}
                    onClick={() => {
                        if (isEntityId(message.id, 'msg')) {
                            onPromoteMessage(message.id);
                        }
                    }}
                />
            ) : null}
        </>
    );
}

export function FlowAssistantMessageActionBar({
    message,
    copyFeedback,
    onCopyFeedbackChange,
    onBranchFromMessage,
    onPromoteMessage,
}: FlowMessageActionBarProps) {
    const capabilities = getFlowMessageCapabilities(message);

    return (
        <div className='flex flex-wrap items-center gap-3'>
            <MessageCopyFeedback feedback={copyFeedback} />
            {capabilities.canCopy ? (
                <MessageActionButton
                    label='Copy'
                    ariaLabel='Copy message'
                    icon={<Copy className='h-3.5 w-3.5' />}
                    title='Copy rendered text. Shift-click to copy source markdown.'
                    onClick={(event) => {
                        void copyFlowMessage(message, event.shiftKey ? 'raw' : 'plain', onCopyFeedbackChange);
                    }}
                />
            ) : null}
            {capabilities.canBranch && onBranchFromMessage ? (
                <MessageActionButton
                    label='Branch'
                    ariaLabel='Branch from message'
                    icon={<GitBranch className='h-3.5 w-3.5' />}
                    onClick={() => {
                        onBranchFromMessage(message);
                    }}
                />
            ) : null}
            {capabilities.canPromote && onPromoteMessage ? (
                <MessageActionButton
                    label='Promote'
                    ariaLabel='Promote message'
                    icon={<Sparkles className='h-3.5 w-3.5' />}
                    onClick={() => {
                        if (isEntityId(message.id, 'msg')) {
                            onPromoteMessage(message.id);
                        }
                    }}
                />
            ) : null}
        </div>
    );
}
