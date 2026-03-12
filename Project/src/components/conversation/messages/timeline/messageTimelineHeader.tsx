import { Copy } from 'lucide-react';

import { Button } from '@/web/components/ui/button';
import { copyText } from '@/web/lib/copy';

import type { MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';

interface MessageTimelineHeaderProps {
    entry: MessageTimelineEntry;
    canBranch: boolean;
    copyFeedback: string | undefined;
    onCopyFeedbackChange: (value: string | undefined) => void;
    onEditMessage?: (entry: MessageTimelineEntry) => void;
    onBranchFromMessage?: (entry: MessageTimelineEntry) => void;
}

export async function copyTimelineMessage(
    entry: MessageTimelineEntry,
    sourceMode: 'plain' | 'raw',
    onCopyFeedbackChange: (value: string | undefined) => void
) {
    const payload = sourceMode === 'raw' ? entry.rawCopyText : entry.plainCopyText;
    if (!payload) {
        return;
    }

    const copied = await copyText(payload);
    onCopyFeedbackChange(copied ? (sourceMode === 'raw' ? 'Source copied' : 'Copied') : 'Copy failed');
    window.setTimeout(() => {
        onCopyFeedbackChange(undefined);
    }, 1400);
}

export function MessageTimelineHeader({
    entry,
    canBranch,
    copyFeedback,
    onCopyFeedbackChange,
    onEditMessage,
    onBranchFromMessage,
}: MessageTimelineHeaderProps) {
    const canEdit = entry.role === 'user' && typeof entry.editableText === 'string' && entry.editableText.length > 0;
    const canCopy = typeof entry.plainCopyText === 'string' && entry.plainCopyText.length > 0;

    return (
        <header className='mb-2 flex items-center justify-between gap-2'>
            <div className='flex items-center gap-2'>
                <span className='bg-secondary text-secondary-foreground rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide uppercase'>
                    {entry.role}
                </span>
                <span className='text-muted-foreground text-xs'>{new Date(entry.createdAt).toLocaleTimeString()}</span>
            </div>
            <div className='flex items-center gap-1'>
                {copyFeedback ? <span className='text-muted-foreground px-1 text-[11px]'>{copyFeedback}</span> : null}
                {canCopy ? (
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        className='h-7 px-2 text-[11px]'
                        title='Copy rendered text. Shift-click to copy source markdown.'
                        aria-label='Copy message'
                        onClick={(event) => {
                            void copyTimelineMessage(entry, event.shiftKey ? 'raw' : 'plain', onCopyFeedbackChange);
                        }}>
                        <Copy className='h-3.5 w-3.5' />
                        Copy
                    </Button>
                ) : null}
                {canEdit ? (
                    <div className='flex items-center gap-1'>
                        <button
                            type='button'
                            className='border-border bg-background hover:bg-accent rounded border px-2 py-0.5 text-[11px]'
                            onClick={() => {
                                onEditMessage?.(entry);
                            }}>
                            Edit
                        </button>
                        {canBranch ? (
                            <button
                                type='button'
                                className='border-border bg-background hover:bg-accent rounded border px-2 py-0.5 text-[11px]'
                                onClick={() => {
                                    onBranchFromMessage?.(entry);
                                }}>
                                Branch
                            </button>
                        ) : null}
                    </div>
                ) : null}
            </div>
        </header>
    );
}
