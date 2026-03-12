import type { KiloModelProviderOption, KiloRoutingDraft } from '@/web/components/settings/providerSettings/types';
import { Button } from '@/web/components/ui/button';

import type { KiloDynamicSort } from '@/shared/contracts';

interface KiloRoutingSectionProps {
    selectedModelId: string;
    draft: KiloRoutingDraft;
    providers: KiloModelProviderOption[];
    isLoadingPreference: boolean;
    isLoadingProviders: boolean;
    isSaving: boolean;
    onModeChange: (mode: 'dynamic' | 'pinned') => void;
    onSortChange: (sort: KiloDynamicSort) => void;
    onPinnedProviderChange: (providerId: string) => void;
}

const sortOptions: Array<{ value: KiloDynamicSort; label: string }> = [
    { value: 'default', label: 'Default' },
    { value: 'price', label: 'Lowest Price' },
    { value: 'throughput', label: 'Highest Throughput' },
    { value: 'latency', label: 'Lowest Latency' },
];

function isKiloDynamicSort(value: string): value is KiloDynamicSort {
    return sortOptions.some((option) => option.value === value);
}

function formatPrice(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return 'N/A';
    }

    if (Math.abs(value) >= 1) {
        return `$${value.toFixed(2)}`;
    }

    return `$${value.toFixed(6)}`;
}

function formatInteger(value: number | undefined): string {
    if (value === undefined || !Number.isFinite(value)) {
        return 'N/A';
    }

    return Math.round(value).toLocaleString();
}

export function KiloRoutingSection({
    selectedModelId,
    draft,
    providers,
    isLoadingPreference,
    isLoadingProviders,
    isSaving,
    onModeChange,
    onSortChange,
    onPinnedProviderChange,
}: KiloRoutingSectionProps) {
    const hasProviders = providers.length > 0;
    const canConfigureDynamicRouting = hasProviders && selectedModelId.trim().length > 0;

    return (
        <section className='space-y-4 rounded-[24px] border border-border/70 bg-card/40 p-4'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Kilo Routing</p>
                <p className='text-muted-foreground text-xs'>
                    Configure routing for <span className='font-mono'>{selectedModelId}</span>.
                </p>
            </div>

            <div className='flex items-center gap-2'>
                <Button
                    type='button'
                    size='sm'
                    variant={draft.routingMode === 'dynamic' ? 'default' : 'outline'}
                    disabled={isSaving || isLoadingPreference}
                    onClick={() => {
                        onModeChange('dynamic');
                    }}>
                    Dynamic
                </Button>
                <Button
                    type='button'
                    size='sm'
                    variant={draft.routingMode === 'pinned' ? 'default' : 'outline'}
                    disabled={isSaving || isLoadingPreference || !hasProviders}
                    onClick={() => {
                        onModeChange('pinned');
                    }}>
                    Pinned
                </Button>
            </div>

            <div className='grid gap-2 md:grid-cols-2'>
                <label className='space-y-1'>
                    <span className='text-muted-foreground text-xs'>Dynamic sort</span>
                    <select
                        value={draft.sort}
                        disabled={
                            isSaving ||
                            isLoadingPreference ||
                            draft.routingMode !== 'dynamic' ||
                            !canConfigureDynamicRouting
                        }
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            if (isKiloDynamicSort(nextValue)) {
                                onSortChange(nextValue);
                            }
                        }}
                        className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'>
                        {sortOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='space-y-1'>
                    <span className='text-muted-foreground text-xs'>Pinned provider</span>
                    <select
                        value={draft.pinnedProviderId ?? ''}
                        disabled={
                            isSaving || isLoadingPreference || isLoadingProviders || draft.routingMode !== 'pinned'
                        }
                        onChange={(event) => {
                            onPinnedProviderChange(event.target.value);
                        }}
                        className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'>
                        <option value=''>Select provider</option>
                        {providers.map((provider) => (
                            <option key={provider.providerId} value={provider.providerId}>
                                {provider.label}
                            </option>
                        ))}
                    </select>
                </label>
            </div>

            <div className='border-border overflow-x-auto rounded-xl border'>
                <table className='min-w-[42rem] w-full border-collapse text-xs'>
                    <thead className='bg-muted/40'>
                        <tr>
                            <th className='px-2 py-1.5 text-left font-medium'>Provider</th>
                            <th className='px-2 py-1.5 text-left font-medium'>Input</th>
                            <th className='px-2 py-1.5 text-left font-medium'>Output</th>
                            <th className='px-2 py-1.5 text-left font-medium'>Cache Read</th>
                            <th className='px-2 py-1.5 text-left font-medium'>Cache Write</th>
                            <th className='px-2 py-1.5 text-left font-medium'>Context / Max out</th>
                        </tr>
                    </thead>
                    <tbody>
                        {providers.map((provider) => (
                            <tr key={provider.providerId} className='border-border border-t'>
                                <td className='px-2 py-1.5'>{provider.label}</td>
                                <td className='px-2 py-1.5'>{formatPrice(provider.inputPrice)}</td>
                                <td className='px-2 py-1.5'>{formatPrice(provider.outputPrice)}</td>
                                <td className='px-2 py-1.5'>{formatPrice(provider.cacheReadPrice)}</td>
                                <td className='px-2 py-1.5'>{formatPrice(provider.cacheWritePrice)}</td>
                                <td className='px-2 py-1.5'>
                                    {formatInteger(provider.contextLength)} /{' '}
                                    {formatInteger(provider.maxCompletionTokens)}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {!isLoadingProviders && providers.length === 0 ? (
                    <p className='text-muted-foreground border-border border-t px-2 py-2 text-xs'>
                        No provider metadata available for this model yet.
                    </p>
                ) : null}
            </div>
        </section>
    );
}

