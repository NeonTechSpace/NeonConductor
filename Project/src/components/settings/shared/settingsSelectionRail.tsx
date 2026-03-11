import { cn } from '@/web/lib/utils';

interface SettingsSelectionRailItem {
    id: string;
    title: string;
    subtitle?: string;
    meta?: string;
    disabled?: boolean;
}

interface SettingsSelectionRailProps {
    title: string;
    ariaLabel: string;
    items: SettingsSelectionRailItem[];
    selectedId?: string;
    emptyMessage?: string;
    onSelect: (itemId: string) => void;
    onItemIntent?: (itemId: string) => void;
}

export function SettingsSelectionRail({
    title,
    ariaLabel,
    items,
    selectedId,
    emptyMessage = 'Nothing to configure yet.',
    onSelect,
    onItemIntent,
}: SettingsSelectionRailProps) {
    return (
        <aside className='border-border bg-background/50 h-full min-h-0 min-w-0 overflow-y-auto border-r p-3'>
            <p className='text-muted-foreground mb-2 text-xs font-semibold tracking-[0.16em] uppercase'>{title}</p>
            <div aria-label={ariaLabel} className='space-y-2'>
                {items.length === 0 ? (
                    <p className='text-muted-foreground rounded-2xl border border-dashed px-3 py-4 text-sm'>
                        {emptyMessage}
                    </p>
                ) : (
                    items.map((item) => {
                        const selected = item.id === selectedId;

                        return (
                            <button
                                key={item.id}
                                type='button'
                                disabled={item.disabled}
                                className={cn(
                                    'border-border bg-card hover:bg-accent focus-visible:ring-ring w-full rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:ring-2',
                                    selected && 'border-primary bg-primary/10 shadow-sm',
                                    item.disabled && 'cursor-not-allowed opacity-60'
                                )}
                                onClick={() => {
                                    onSelect(item.id);
                                }}
                                onMouseEnter={() => {
                                    onItemIntent?.(item.id);
                                }}
                                onFocus={() => {
                                    onItemIntent?.(item.id);
                                }}>
                                <div className='flex items-start justify-between gap-2'>
                                    <p className='min-w-0 truncate text-sm font-medium'>{item.title}</p>
                                    {item.meta ? (
                                        <span className='text-primary shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase'>
                                            {item.meta}
                                        </span>
                                    ) : null}
                                </div>
                                {item.subtitle ? (
                                    <p className='text-muted-foreground mt-1 break-words text-[11px]'>{item.subtitle}</p>
                                ) : null}
                            </button>
                        );
                    })
                )}
            </div>
        </aside>
    );
}
