import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/web/components/ui/button';
import { cn } from '@/web/lib/utils';

import type { RuntimeProviderId } from '@/shared/contracts';

export interface ModelPickerOption {
    id: string;
    label: string;
    providerId?: RuntimeProviderId | string;
    providerLabel?: string;
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
    onSelectOption?: (option: ModelPickerOption) => void;
}

interface ModelGroup {
    key: string;
    label: string;
    options: ModelPickerOption[];
}

function formatMetric(value: number | undefined): string | undefined {
    if (value === undefined || !Number.isFinite(value)) {
        return undefined;
    }

    return String(value);
}

function stripSubProviderPrefix(label: string): string {
    const colonIndex = label.indexOf(': ');
    if (colonIndex < 0) {
        return label;
    }

    const prefix = label.slice(0, colonIndex).trim().toLowerCase();
    if (prefix === 'kilo') {
        return label;
    }

    return label.slice(colonIndex + 2);
}

function getDisplayLabel(option: ModelPickerOption): string {
    if (option.providerId === 'kilo') {
        return stripSubProviderPrefix(option.label);
    }

    return option.label;
}

function getGroupKey(option: ModelPickerOption): string {
    return option.providerId === 'kilo' ? 'kilo' : option.providerId ?? 'other';
}

function getGroupLabel(option: ModelPickerOption): string {
    return option.providerId === 'kilo' ? 'Kilo' : option.providerLabel ?? option.providerId ?? 'Other';
}

function getGroupOrder(key: string): number {
    return key === 'kilo' ? 0 : 1;
}

function sortGroupedOptions(options: ModelPickerOption[]): ModelGroup[] {
    const groups = new Map<string, ModelGroup>();
    for (const option of options) {
        const groupKey = getGroupKey(option);
        const existingGroup = groups.get(groupKey);
        if (existingGroup) {
            existingGroup.options.push(option);
            continue;
        }

        groups.set(groupKey, {
            key: groupKey,
            label: getGroupLabel(option),
            options: [option],
        });
    }

    return [...groups.values()]
        .sort((left, right) => {
            const orderDifference = getGroupOrder(left.key) - getGroupOrder(right.key);
            if (orderDifference !== 0) {
                return orderDifference;
            }

            return left.label.localeCompare(right.label);
        })
        .map((group) => ({
            ...group,
            options: [...group.options].sort((left, right) => {
                const preferredOrder = new Map<string, number>([
                    ['kilo/auto', 0],
                    ['kilo/code', 1],
                ]);
                const leftOrder = preferredOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
                const rightOrder = preferredOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
                if (leftOrder !== rightOrder) {
                    return leftOrder - rightOrder;
                }

                return getDisplayLabel(left).localeCompare(getDisplayLabel(right));
            }),
        }));
}

function getModelDescription(option: ModelPickerOption): string {
    if (option.id === 'kilo/auto') {
        return 'Recommended starting point with automatic Kilo routing.';
    }

    if (option.id === 'kilo/code') {
        return 'Coding-focused Kilo quick pick.';
    }

    if (option.providerId === 'kilo') {
        if (option.sourceProvider) {
            return `Kilo gateway model routed through ${option.sourceProvider}.`;
        }
        if (option.promptFamily) {
            return `${option.promptFamily} profile on the Kilo gateway.`;
        }

        return 'Kilo gateway model.';
    }

    return `${option.providerLabel ?? option.providerId ?? 'Custom'} provider model.`;
}

function PopoverModelPicker(props: ModelPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const listboxId = useId();

    const selectedOption = props.models.find((option) => option.id === props.selectedModelId);
    const filteredOptions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery.length === 0) {
            return props.models;
        }

        return props.models.filter((option) =>
            [
                option.id,
                option.label,
                option.providerLabel,
                option.providerId,
                option.sourceProvider,
                option.promptFamily,
            ]
                .filter((value): value is string => typeof value === 'string')
                .some((value) => value.toLowerCase().includes(normalizedQuery))
        );
    }, [props.models, query]);
    const groups = useMemo(() => sortGroupedOptions(filteredOptions), [filteredOptions]);

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
                {...(props.id ? { id: props.id } : {})}
                type='button'
                variant='outline'
                className='h-10 w-full min-w-0 justify-between rounded-xl px-3 text-left'
                aria-label={props.ariaLabel}
                aria-haspopup='listbox'
                aria-expanded={open}
                aria-controls={listboxId}
                disabled={props.disabled || props.models.length === 0}
                onClick={() => {
                    setOpen((current) => !current);
                }}>
                <span className='min-w-0 truncate'>
                    {selectedOption?.label
                        ? getDisplayLabel(selectedOption)
                        : props.models.length === 0
                          ? 'No runnable models available'
                          : props.placeholder}
                </span>
                <ChevronDown className='h-4 w-4 shrink-0 opacity-70' />
            </Button>

            {open ? (
                <div className='border-border bg-popover text-popover-foreground absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-2xl border shadow-xl'>
                    <div className='border-border bg-background/90 border-b px-3 py-3'>
                        <label className='sr-only' htmlFor={`${listboxId}-search`}>
                            Search models
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
                                placeholder='Search models'
                            />
                        </div>
                    </div>

                    <div id={listboxId} role='listbox' className='max-h-96 overflow-y-auto p-2'>
                        {groups.length === 0 ? (
                            <div className='text-muted-foreground px-3 py-6 text-sm'>No models matched that search.</div>
                        ) : (
                            groups.map((group) => (
                                <div key={group.key} className='mb-2 last:mb-0'>
                                    <div className='text-muted-foreground px-2 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                        {group.label}
                                    </div>
                                    <div className='space-y-1'>
                                        {group.options.map((option) => {
                                            const metricBadges = [
                                                formatMetric(option.price) ? `Price ${formatMetric(option.price)}` : undefined,
                                                formatMetric(option.latency)
                                                    ? `Latency ${formatMetric(option.latency)}`
                                                    : undefined,
                                                formatMetric(option.tps) ? `TPS ${formatMetric(option.tps)}` : undefined,
                                            ].filter((badge): badge is string => Boolean(badge));
                                            const selected = option.id === props.selectedModelId;

                                            return (
                                                <button
                                                    key={`${option.providerId ?? 'unknown'}:${option.id}`}
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
                                                        props.onSelectOption?.(option);
                                                        props.onSelectModel(option.id);
                                                        setOpen(false);
                                                    }}>
                                                    <div className='flex items-start justify-between gap-3'>
                                                        <div className='min-w-0'>
                                                            <p className='truncate text-sm font-medium'>
                                                                {getDisplayLabel(option)}
                                                            </p>
                                                            <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                                                {getModelDescription(option)}
                                                            </p>
                                                        </div>
                                                        {selected ? (
                                                            <Check className='text-primary mt-0.5 h-4 w-4 shrink-0' />
                                                        ) : null}
                                                    </div>
                                                    {metricBadges.length > 0 || option.sourceProvider ? (
                                                        <div className='mt-2 flex flex-wrap gap-2'>
                                                            {option.sourceProvider ? (
                                                                <span className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                                                                    {option.sourceProvider}
                                                                </span>
                                                            ) : null}
                                                            {metricBadges.map((badge) => (
                                                                <span
                                                                    key={`${option.id}:${badge}`}
                                                                    className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                                                                    {badge}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    ) : null}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

function shouldUsePopoverPicker(props: ModelPickerProps): boolean {
    if (props.providerId === 'kilo') {
        return true;
    }

    const providerIds = new Set(
        props.models
            .map((option) => option.providerId)
            .filter((providerId): providerId is string => typeof providerId === 'string')
    );
    return providerIds.size > 1;
}

export function ModelPicker(props: ModelPickerProps) {
    if (shouldUsePopoverPicker(props)) {
        return <PopoverModelPicker {...props} />;
    }

    return (
        <select
            {...(props.id ? { id: props.id } : {})}
            {...(props.name ? { name: props.name } : {})}
            aria-label={props.ariaLabel}
            value={props.selectedModelId}
            onChange={(event) => {
                const selectedOption = props.models.find((option) => option.id === event.target.value);
                if (selectedOption) {
                    props.onSelectOption?.(selectedOption);
                }
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
                        <option key={`${model.providerId ?? 'single'}:${model.id}`} value={model.id}>
                            {getDisplayLabel(model)}
                        </option>
                    ))}
                </>
            )}
        </select>
    );
}
