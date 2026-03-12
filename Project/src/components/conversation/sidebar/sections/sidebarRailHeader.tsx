import type { TopLevelTab } from '@/shared/contracts';

import type { ReactNode } from 'react';

interface SidebarRailHeaderProps {
    topLevelTab: TopLevelTab;
    feedbackMessage?: string;
    statusMessage?: string;
    statusTone?: 'info' | 'error';
    onTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
    threadComposerAction: ReactNode;
}

const TAB_OPTIONS: Array<{ id: TopLevelTab; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'agent', label: 'Agent' },
    { id: 'orchestrator', label: 'Orchestrator' },
];

export function SidebarRailHeader({
    topLevelTab,
    feedbackMessage,
    statusMessage,
    statusTone = 'info',
    onTopLevelTabChange,
    threadComposerAction,
}: SidebarRailHeaderProps) {
    return (
        <div className='border-border/70 space-y-4 border-b p-4'>
            <div className='flex flex-wrap gap-2'>
                {TAB_OPTIONS.map((tab) => (
                    <button
                        key={tab.id}
                        type='button'
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                            tab.id === topLevelTab
                                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                : 'border-border bg-card/80 hover:bg-accent'
                        }`}
                        onClick={() => {
                            onTopLevelTabChange(tab.id);
                        }}>
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className='flex items-start justify-between gap-3'>
                <div className='min-w-0'>
                    <p className='text-sm font-semibold'>Threads</p>
                    <p className='text-muted-foreground text-xs'>
                        Search first, then branch only when the workspace actually needs it.
                    </p>
                </div>
                {threadComposerAction}
            </div>

            {feedbackMessage ? (
                <div
                    aria-live='polite'
                    className='rounded-2xl border border-destructive/20 bg-destructive/10 px-3 py-2 text-xs text-destructive'>
                    {feedbackMessage}
                </div>
            ) : null}
            {statusMessage ? (
                <div
                    aria-live='polite'
                    className={`rounded-2xl px-3 py-2 text-xs ${
                        statusTone === 'error'
                            ? 'border border-destructive/20 bg-destructive/10 text-destructive'
                            : 'border border-border/70 bg-background/80 text-muted-foreground'
                    }`}>
                    {statusMessage}
                </div>
            ) : null}
        </div>
    );
}
