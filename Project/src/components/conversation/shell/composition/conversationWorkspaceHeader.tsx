interface ConversationWorkspaceHeaderProps {
    threadTitle?: string;
    streamState: string;
    streamErrorMessage?: string | null;
    lastSequence: number;
    tabSwitchNotice?: string;
}

export function ConversationWorkspaceHeader({
    threadTitle,
    streamState,
    streamErrorMessage,
    lastSequence,
    tabSwitchNotice,
}: ConversationWorkspaceHeaderProps) {
    return (
        <header className='border-border flex items-center justify-between border-b px-4 py-3'>
            <div className='min-w-0'>
                <p className='truncate text-sm font-semibold'>{threadTitle ?? 'No Thread Selected'}</p>
                <p
                    className={`text-xs ${streamState === 'error' ? 'text-amber-300' : 'text-muted-foreground'}`}
                    title={streamErrorMessage ?? undefined}>
                    {streamState === 'error'
                        ? `Live updates degraded · retrying · Events: ${String(lastSequence)}`
                        : `Live updates: ${streamState} · Events: ${String(lastSequence)}`}
                </p>
                {tabSwitchNotice ? <p className='text-primary text-xs'>{tabSwitchNotice}</p> : null}
            </div>
        </header>
    );
}
