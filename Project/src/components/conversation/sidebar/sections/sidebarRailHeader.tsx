import { PanelLeftClose } from 'lucide-react';

import type { ReactNode } from 'react';

interface SidebarRailHeaderProps {
    compact?: boolean;
    feedbackMessage?: string;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    primaryAction: ReactNode;
    onToggleCollapsed: () => void;
}

export function SidebarRailHeader({
    compact = false,
    feedbackMessage,
    statusMessage,
    statusTone = 'info',
    primaryAction,
    onToggleCollapsed,
}: SidebarRailHeaderProps) {
    if (compact) {
        return (
            <div className='border-border/70 flex items-center justify-center border-b px-3 py-3'>{primaryAction}</div>
        );
    }

    return (
        <div className='border-border/70 space-y-3 border-b p-4'>
            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0 space-y-1'>
                    <p className='text-sm font-semibold'>Sessions</p>
                    <p className='text-muted-foreground text-xs leading-5'>Workspace tree.</p>
                </div>
                <button
                    type='button'
                    className='border-border bg-card hover:bg-accent inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors'
                    aria-label='Collapse threads sidebar'
                    title='Collapse threads sidebar'
                    onClick={onToggleCollapsed}>
                    <PanelLeftClose className='h-4 w-4' />
                </button>
            </div>

            <div>{primaryAction}</div>

            {feedbackMessage ? (
                <div
                    aria-live='polite'
                    className='border-destructive/20 bg-destructive/10 text-destructive rounded-2xl border px-3 py-2 text-xs'>
                    {feedbackMessage}
                </div>
            ) : null}
            {statusMessage ? (
                <div
                    aria-live='polite'
                    className={`rounded-2xl px-3 py-2 text-xs ${
                        statusTone === 'error'
                            ? 'border-destructive/20 bg-destructive/10 text-destructive border'
                            : 'border-border/70 bg-background/80 text-muted-foreground border'
                    }`}>
                    {statusMessage}
                </div>
            ) : null}
        </div>
    );
}
