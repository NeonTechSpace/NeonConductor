import { methodLabel } from '@/web/components/settings/providerSettings/helpers';
import type { ProviderListItem } from '@/web/components/settings/providerSettings/types';
import { cn } from '@/web/lib/utils';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderSidebarProps {
    providers: ProviderListItem[];
    selectedProviderId: RuntimeProviderId | undefined;
    onSelectProvider: (providerId: RuntimeProviderId) => void;
    onPreviewProvider?: (providerId: RuntimeProviderId) => void;
}

function renderProviderButton({
    provider,
    selectedProviderId,
    onSelectProvider,
    onPreviewProvider,
}: {
    provider: ProviderListItem;
    selectedProviderId: RuntimeProviderId | undefined;
    onSelectProvider: (providerId: RuntimeProviderId) => void;
    onPreviewProvider: ((providerId: RuntimeProviderId) => void) | undefined;
}) {
    const selected = provider.id === selectedProviderId;

    return (
        <button
            key={provider.id}
            type='button'
            className={cn(
                'border-border bg-card hover:bg-accent focus-visible:ring-ring w-full rounded-2xl border px-3 py-3 text-left transition-colors focus-visible:ring-2',
                selected && 'border-primary bg-primary/10 shadow-sm'
            )}
            onClick={() => {
                onSelectProvider(provider.id);
            }}
            onMouseEnter={() => {
                onPreviewProvider?.(provider.id);
            }}
            onFocus={() => {
                onPreviewProvider?.(provider.id);
            }}>
            <div className='flex items-start justify-between gap-2'>
                <p className='min-w-0 truncate text-sm font-medium'>{provider.label}</p>
                {provider.isDefault ? (
                    <span className='text-primary bg-primary/10 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-[0.12em] uppercase'>
                        Default
                    </span>
                ) : null}
            </div>
            <p className='text-muted-foreground mt-1 text-[11px] break-words'>
                {provider.authState.replace('_', ' ')} · {methodLabel(provider.authMethod)}
            </p>
        </button>
    );
}

export function ProviderSidebar({
    providers,
    selectedProviderId,
    onSelectProvider,
    onPreviewProvider,
}: ProviderSidebarProps) {
    return (
        <aside className='border-border bg-background/50 h-full min-h-0 min-w-0 overflow-y-auto border-r p-3'>
            <p className='text-muted-foreground mb-2 text-xs font-semibold tracking-[0.16em] uppercase'>
                Providers &amp; Models
            </p>

            <div aria-label='Provider list' className='space-y-2'>
                <div className='space-y-2'>
                    <p className='text-muted-foreground px-1 text-[11px] font-semibold tracking-[0.14em] uppercase'>
                        Direct Providers
                    </p>
                    <div className='mt-2 space-y-2'>
                        {providers.length > 0 ? (
                            providers.map((provider) =>
                                renderProviderButton({
                                    provider,
                                    selectedProviderId,
                                    onSelectProvider,
                                    onPreviewProvider,
                                })
                            )
                        ) : (
                            <p className='text-muted-foreground rounded-2xl border border-dashed px-3 py-4 text-sm'>
                                No direct providers discovered yet.
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </aside>
    );
}
