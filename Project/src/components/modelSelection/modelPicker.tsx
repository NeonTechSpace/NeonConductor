import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { cn } from '@/web/lib/utils';

import type { RuntimeProviderId } from '@/shared/contracts';

export interface ModelPickerOption {
    id: string;
    label: string;
    sourceProvider?: string;
    source?: string;
    promptFamily?: string;
    price?: number;
    latency?: number;
    tps?: number;
}

interface ModelPickerProps {
    providerId: RuntimeProviderId | string | undefined;
    selectedModelId: string;
    models: ModelPickerOption[];
    disabled?: boolean;
    id?: string;
    name?: string;
    ariaLabel: string;
    placeholder: string;
    onSelectModel: (modelId: string) => void;
}

function formatMetric(value: number | undefined): string | undefined {
    if (value === undefined || !Number.isFinite(value)) {
        return undefined;
    }

    return String(value);
}

function getKiloModelDescription(model: ModelPickerOption): string {
    if (model.id === 'kilo/auto') {
        return 'Automatic Kilo routing across the gateway model catalog.';
    }

    if (model.id === 'kilo/code') {
        return 'Coding-focused Kilo routing with provider controls below.';
    }

    if (model.sourceProvider) {
        return `Routes through ${model.sourceProvider}.`;
    }

    if (model.promptFamily) {
        return `${model.promptFamily} profile.`;
    }

    return 'Kilo gateway model.';
}

function sortKiloModels(models: ModelPickerOption[]): ModelPickerOption[] {
    const preferredOrder = new Map<string, number>([
        ['kilo/auto', 0],
        ['kilo/code', 1],
    ]);

    return [...models].sort((left, right) => {
        const leftOrder = preferredOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = preferredOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
            return leftOrder - rightOrder;
        }

        return left.label.localeCompare(right.label);
    });
}

function KiloModelPicker({
    selectedModelId,
    models,
    disabled = false,
    id,
    ariaLabel,
    placeholder,
    onSelectModel,
}: Omit<ModelPickerProps, 'providerId' | 'name'>) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const listboxId = useId();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);

    const sortedModels = sortKiloModels(models);
    const selectedModel = sortedModels.find((model) => model.id === selectedModelId);
    const filteredModels = sortedModels.filter((model) => {
        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery.length === 0) {
            return true;
        }

        return [model.label, model.id, model.sourceProvider, model.promptFamily]
            .filter((value): value is string => typeof value === 'string')
            .some((value) => value.toLowerCase().includes(normalizedQuery));
    });

    useEffect(() => {
        if (!open) {
            setQuery('');
            return;
        }

        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });

        const handlePointerDown = (event: MouseEvent) => {
            if (!containerRef.current?.contains(event.target as Node)) {
                setOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setOpen(false);
            }
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [open]);

    return (
        <div ref={containerRef} className='relative min-w-0'>
            <Button
                {...(id ? { id } : {})}
                type='button'
                variant='outline'
                className='h-10 w-full min-w-0 justify-between rounded-xl px-3 text-left'
                aria-label={ariaLabel}
                aria-haspopup='listbox'
                aria-expanded={open}
                aria-controls={listboxId}
                disabled={disabled || models.length === 0}
                onClick={() => {
                    setOpen((current) => !current);
                }}>
                <span className='min-w-0 truncate'>
                    {selectedModel?.label ?? (models.length === 0 ? 'No runnable models available' : placeholder)}
                </span>
                <ChevronDown className='h-4 w-4 shrink-0 opacity-70' />
            </Button>

            {open ? (
                <div className='border-border bg-popover text-popover-foreground absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border shadow-xl'>
                    <div className='border-border bg-background/90 border-b px-3 py-3'>
                        <label className='sr-only' htmlFor={`${listboxId}-search`}>
                            Search Kilo models
                        </label>
                        <div className='border-border bg-background flex items-center gap-2 rounded-xl border px-3'>
                            <Search className='text-muted-foreground h-4 w-4 shrink-0' />
                            <input
                                ref={searchInputRef}
                                id={`${listboxId}-search`}
                                type='text'
                                value={query}
                                onChange={(event) => {
                                    setQuery(event.target.value);
                                }}
                                className='h-10 w-full bg-transparent text-sm outline-none'
                                placeholder='Search Kilo models'
                            />
                        </div>
                    </div>

                    <div id={listboxId} role='listbox' className='max-h-80 overflow-y-auto p-2'>
                        {filteredModels.length === 0 ? (
                            <div className='text-muted-foreground px-3 py-6 text-sm'>No Kilo models matched that search.</div>
                        ) : (
                            filteredModels.map((model) => {
                                const metricBadges = [
                                    formatMetric(model.price) ? `Price ${formatMetric(model.price)}` : undefined,
                                    formatMetric(model.latency) ? `Latency ${formatMetric(model.latency)}` : undefined,
                                    formatMetric(model.tps) ? `TPS ${formatMetric(model.tps)}` : undefined,
                                ].filter((badge): badge is string => Boolean(badge));
                                const selected = model.id === selectedModelId;

                                return (
                                    <button
                                        key={model.id}
                                        type='button'
                                        role='option'
                                        aria-selected={selected}
                                        className={cn(
                                            'hover:bg-accent focus-visible:ring-ring w-full rounded-xl border px-3 py-3 text-left transition focus-visible:ring-2 focus-visible:outline-none',
                                            selected
                                                ? 'border-primary bg-primary/10 shadow-sm'
                                                : 'border-transparent bg-transparent'
                                        )}
                                        onClick={() => {
                                            onSelectModel(model.id);
                                            setOpen(false);
                                        }}>
                                        <div className='flex items-start justify-between gap-3'>
                                            <div className='min-w-0'>
                                                <p className='truncate text-sm font-medium'>{model.label}</p>
                                                <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                                    {getKiloModelDescription(model)}
                                                </p>
                                            </div>
                                            {selected ? <Check className='text-primary mt-0.5 h-4 w-4 shrink-0' /> : null}
                                        </div>
                                        {metricBadges.length > 0 || model.sourceProvider ? (
                                            <div className='mt-2 flex flex-wrap gap-2'>
                                                {model.sourceProvider ? (
                                                    <span className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                                                        {model.sourceProvider}
                                                    </span>
                                                ) : null}
                                                {metricBadges.map((badge) => (
                                                    <span
                                                        key={`${model.id}:${badge}`}
                                                        className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                                                        {badge}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}
                                    </button>
                                );
                            })
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function ModelPicker(props: ModelPickerProps) {
    if (props.providerId === 'kilo') {
        return <KiloModelPicker {...props} />;
    }

    return (
        <select
            {...(props.id ? { id: props.id } : {})}
            {...(props.name ? { name: props.name } : {})}
            aria-label={props.ariaLabel}
            value={props.selectedModelId}
            onChange={(event) => {
                props.onSelectModel(event.target.value);
            }}
            className='border-border bg-background h-10 min-w-0 rounded-xl border px-3 text-sm'
            disabled={props.disabled || props.models.length === 0}>
            {props.models.length === 0 ? (
                <option value=''>No runnable models available</option>
            ) : (
                <>
                    <option value='' disabled>
                        {props.placeholder}
                    </option>
                    {props.models.map((model) => (
                        <option key={model.id} value={model.id}>
                            {model.label}
                        </option>
                    ))}
                </>
            )}
        </select>
    );
}
