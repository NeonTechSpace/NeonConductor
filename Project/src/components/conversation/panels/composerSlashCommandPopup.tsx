import type {
    ComposerSlashPopupState,
    ComposerSlashResultItem,
} from '@/web/components/conversation/panels/composerSlashCommands';

function ScopeBadge({ scope }: { scope: ComposerSlashResultItem['scope'] }) {
    const label = scope === 'workspace' ? 'Workspace' : scope === 'global' ? 'Global' : 'Session';
    return (
        <span className='bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase'>
            {label}
        </span>
    );
}

function PresetBadge({ presetKey }: { presetKey?: ComposerSlashResultItem['presetKey'] }) {
    return (
        <span className='bg-background text-muted-foreground rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase'>
            {presetKey ?? 'shared'}
        </span>
    );
}

export function ComposerSlashCommandPopup(props: { state: ComposerSlashPopupState }) {
    if (props.state.kind === 'hidden') {
        return null;
    }

    const popupState = props.state;

    return (
        <div className='border-border bg-background/95 absolute inset-x-4 bottom-[calc(100%+0.75rem)] z-20 rounded-2xl border shadow-xl backdrop-blur'>
            <div className='border-border border-b px-4 py-3'>
                <p className='text-[11px] font-semibold tracking-[0.14em] uppercase'>
                    {popupState.kind === 'commands'
                        ? 'Slash Commands'
                        : popupState.commandId === 'skills'
                          ? 'Skill Selection'
                          : 'Manual Rule Selection'}
                </p>
            </div>
            <div className='max-h-80 overflow-y-auto px-2 py-2'>
                {popupState.kind === 'commands' ? (
                    popupState.items.length > 0 ? (
                        popupState.items.map((item, index) => (
                            <div
                                key={item.id}
                                className={`rounded-xl px-3 py-3 ${
                                    index === popupState.highlightIndex ? 'bg-accent' : ''
                                } ${item.available ? '' : 'opacity-60'}`}>
                                <div className='flex items-center justify-between gap-3'>
                                    <p className='text-sm font-medium'>{item.label}</p>
                                    {item.available ? (
                                        <span className='text-primary text-[11px] font-medium'>Available</span>
                                    ) : (
                                        <span className='text-muted-foreground text-[11px]'>Unavailable</span>
                                    )}
                                </div>
                                <p className='text-muted-foreground mt-1 text-xs'>{item.description}</p>
                                {item.unavailableReason ? (
                                    <p className='text-muted-foreground mt-1 text-[11px]'>{item.unavailableReason}</p>
                                ) : null}
                            </div>
                        ))
                    ) : (
                        <p className='text-muted-foreground px-3 py-3 text-sm'>{popupState.emptyMessage}</p>
                    )
                ) : popupState.items.length > 0 ? (
                    popupState.items.map((item, index) => (
                        <div
                            key={item.key}
                            className={`rounded-xl px-3 py-3 ${
                                index === popupState.highlightIndex ? 'bg-accent' : ''
                            }`}>
                            <div className='flex flex-wrap items-center gap-2'>
                                <p className='text-sm font-medium'>{item.label}</p>
                                <ScopeBadge scope={item.scope} />
                                <PresetBadge presetKey={item.presetKey} />
                                {item.attached ? (
                                    <span className='text-primary border-primary/25 rounded-full border px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase'>
                                        Attached
                                    </span>
                                ) : null}
                            </div>
                            {item.description ? (
                                <p className='text-muted-foreground mt-1 text-xs'>{item.description}</p>
                            ) : null}
                        </div>
                    ))
                ) : (
                    <p className='text-muted-foreground px-3 py-3 text-sm'>{popupState.emptyMessage}</p>
                )}
            </div>
            {popupState.kind === 'results' && popupState.warningMessage ? (
                <div className='border-border border-t bg-amber-500/10 px-4 py-3 text-xs'>
                    {popupState.warningMessage}
                </div>
            ) : null}
        </div>
    );
}
