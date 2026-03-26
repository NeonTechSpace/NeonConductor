import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

import type { TopLevelTab } from '@/shared/contracts';

interface ConversationWorkspaceHeaderProps {
    threadTitle?: string;
    streamState: string;
    streamErrorMessage?: string | null;
    lastSequence: number;
    tabSwitchNotice?: string;
    topLevelTab: TopLevelTab;
    isSidebarCollapsed: boolean;
    onToggleSidebar: () => void;
    onTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
}

const SESSION_MODE_OPTIONS: Array<{ id: TopLevelTab; label: string }> = [
    { id: 'chat', label: 'Chat' },
    { id: 'agent', label: 'Agent' },
    { id: 'orchestrator', label: 'Orchestrator' },
];

function buildLiveUpdateStatus(input: {
    streamState: string;
    lastSequence: number;
    streamErrorMessage: string | null | undefined;
}): { message: string; title?: string } {
    if (input.streamState === 'error') {
        const titleParts = [
            input.streamErrorMessage?.trim(),
            input.lastSequence > 0 ? `Last synced event: ${String(input.lastSequence)}` : undefined,
        ].filter((value): value is string => Boolean(value));

        return {
            message: 'Live updates paused. Reconnecting…',
            ...(titleParts.length > 0 ? { title: titleParts.join(' • ') } : {}),
        };
    }

    if (input.streamState === 'connecting') {
        return { message: 'Connecting live updates…' };
    }

    if (input.streamState === 'live') {
        return { message: 'Live updates connected.' };
    }

    return { message: 'Live updates starting…' };
}

export function ConversationWorkspaceHeader({
    threadTitle,
    streamState,
    streamErrorMessage,
    lastSequence,
    tabSwitchNotice,
    topLevelTab,
    isSidebarCollapsed,
    onToggleSidebar,
    onTopLevelTabChange,
}: ConversationWorkspaceHeaderProps) {
    const liveUpdateStatus = buildLiveUpdateStatus({
        streamState,
        streamErrorMessage,
        lastSequence,
    });

    return (
        <header className='border-border flex items-center justify-between gap-4 border-b px-4 py-3'>
            <div className='flex min-w-0 items-start gap-3'>
                <button
                    type='button'
                    className='border-border bg-card hover:bg-accent inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors'
                    aria-label={isSidebarCollapsed ? 'Expand threads sidebar' : 'Collapse threads sidebar'}
                    title={isSidebarCollapsed ? 'Expand threads sidebar' : 'Collapse threads sidebar'}
                    onClick={onToggleSidebar}>
                    {isSidebarCollapsed ? (
                        <PanelLeftOpen className='h-4 w-4' />
                    ) : (
                        <PanelLeftClose className='h-4 w-4' />
                    )}
                </button>

                <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold'>{threadTitle ?? 'No conversation selected'}</p>
                    <p
                        className={`text-xs ${streamState === 'error' ? 'text-amber-300' : 'text-muted-foreground'}`}
                        title={liveUpdateStatus.title}>
                        {liveUpdateStatus.message}
                    </p>
                    {tabSwitchNotice ? <p className='text-primary text-xs'>{tabSwitchNotice}</p> : null}
                </div>
            </div>

            <div className='flex flex-wrap gap-2'>
                {SESSION_MODE_OPTIONS.map((mode) => (
                    <button
                        key={mode.id}
                        type='button'
                        className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                            mode.id === topLevelTab
                                ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                : 'border-border bg-card hover:bg-accent'
                        }`}
                        onClick={() => {
                            onTopLevelTabChange(mode.id);
                        }}>
                        {mode.label}
                    </button>
                ))}
            </div>
        </header>
    );
}
