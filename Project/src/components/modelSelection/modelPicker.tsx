import { Check, ChevronDown, Search } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ModelCapabilityBadge, ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { Button } from '@/web/components/ui/button';
import { cn } from '@/web/lib/utils';

import type { RuntimeProviderId } from '@/shared/contracts';
import { kiloBalancedModelId, kiloFreeModelId, kiloFrontierModelId, kiloSmallModelId } from '@/shared/kiloModels';


interface ModelPickerProps {
    providerId: RuntimeProviderId | undefined;
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

interface PopoverLayout {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

export type ModelLabelCollisionIndex = ReadonlyMap<string, number>;

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

function getCollisionKey(option: ModelPickerOption): string | null {
    if (option.providerId !== 'kilo') {
        return null;
    }

    return getDisplayLabel(option).toLowerCase();
}

export function getModelLabelCollisionIndex(options: ModelPickerOption[]): ModelLabelCollisionIndex {
    const collisionIndex = new Map<string, number>();

    for (const option of options) {
        const collisionKey = getCollisionKey(option);
        if (!collisionKey) {
            continue;
        }

        collisionIndex.set(collisionKey, (collisionIndex.get(collisionKey) ?? 0) + 1);
    }

    return collisionIndex;
}

function getModelDisambiguator(option: ModelPickerOption): string | undefined {
    return option.sourceProvider ?? option.promptFamily ?? option.id;
}

function hasLabelCollision(option: ModelPickerOption, collisionIndex: ModelLabelCollisionIndex): boolean {
    const collisionKey = getCollisionKey(option);
    if (!collisionKey) {
        return false;
    }

    return (collisionIndex.get(collisionKey) ?? 0) > 1;
}

export function getOptionDisplayText(
    option: ModelPickerOption,
    collisionIndex: ModelLabelCollisionIndex = new Map()
): string {
    const displayLabel = getDisplayLabel(option);
    if (!hasLabelCollision(option, collisionIndex)) {
        return displayLabel;
    }

    const disambiguator = getModelDisambiguator(option);
    return disambiguator ? `${displayLabel} · ${disambiguator}` : displayLabel;
}

function getGroupKey(option: ModelPickerOption): string {
    return option.providerId === 'kilo' ? 'kilo' : (option.providerId ?? 'other');
}

function getGroupLabel(option: ModelPickerOption): string {
    return option.providerId === 'kilo' ? 'Kilo' : (option.providerLabel ?? option.providerId ?? 'Other');
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
                    [kiloFrontierModelId, 0],
                    [kiloBalancedModelId, 1],
                    [kiloFreeModelId, 2],
                    [kiloSmallModelId, 3],
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
    if (option.id === kiloFrontierModelId) {
        return 'Automatic Kilo routing to the best model for the task.';
    }

    if (option.id === kiloBalancedModelId) {
        return 'Automatic Kilo routing tuned for lower-cost mixed routing.';
    }

    if (option.id === kiloFreeModelId) {
        return 'Automatic Kilo routing limited to the Kilo free tier.';
    }

    if (option.id === kiloSmallModelId) {
        return 'Automatic Kilo routing tuned for smaller background and utility work.';
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

function formatCapabilityBadge(badge: ModelCapabilityBadge): string {
    return badge.label;
}

function resolvePopoverLayout(triggerRect: DOMRect): PopoverLayout {
    const viewportPadding = 16;
    const minimumWidth = Math.min(420, window.innerWidth - viewportPadding * 2);
    const availableWidth = window.innerWidth - viewportPadding * 2;
    const width = Math.min(Math.max(triggerRect.width, minimumWidth), availableWidth);
    const maxLeft = window.innerWidth - viewportPadding - width;
    const left = Math.max(viewportPadding, Math.min(triggerRect.left, maxLeft));
    const availableBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
    const availableAbove = triggerRect.top - viewportPadding;
    const shouldOpenAbove = availableBelow < 280 && availableAbove > availableBelow;
    const maxHeight = Math.max(220, Math.min(420, shouldOpenAbove ? availableAbove - 12 : availableBelow - 12));
    const top = shouldOpenAbove
        ? Math.max(viewportPadding, triggerRect.top - maxHeight - 8)
        : Math.min(triggerRect.bottom + 8, window.innerHeight - viewportPadding - maxHeight);

    return {
        top,
        left,
        width,
        maxHeight,
    };
}

function PopoverModelPicker(props: ModelPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const containerRef = useRef<HTMLDivElement | null>(null);
    const panelRef = useRef<HTMLDivElement | null>(null);
    const searchInputRef = useRef<HTMLInputElement | null>(null);
    const listboxId = useId();
    const [popoverLayout, setPopoverLayout] = useState<PopoverLayout | null>(null);

    const selectedOption = props.models.find((option) => option.id === props.selectedModelId);
    const labelCollisionIndex = getModelLabelCollisionIndex(props.models);
    const normalizedQuery = query.trim().toLowerCase();
    const filteredOptions =
        normalizedQuery.length === 0
            ? props.models
            : props.models.filter((option) =>
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
    const groups = sortGroupedOptions(filteredOptions);

    useEffect(() => {
        if (!open) {
            setQuery('');
            setPopoverLayout(null);
            return;
        }

        const updateLayout = () => {
            const triggerElement = containerRef.current;
            if (!triggerElement) {
                return;
            }

            setPopoverLayout(resolvePopoverLayout(triggerElement.getBoundingClientRect()));
        };

        updateLayout();
        requestAnimationFrame(() => {
            searchInputRef.current?.focus();
        });

        const handlePointerDown = (event: MouseEvent) => {
            const targetNode = event.target;
            if (!(targetNode instanceof Node)) {
                return;
            }
            if (!containerRef.current?.contains(targetNode) && !panelRef.current?.contains(targetNode)) {
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
        window.addEventListener('resize', updateLayout);
        window.addEventListener('scroll', updateLayout, true);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('resize', updateLayout);
            window.removeEventListener('scroll', updateLayout, true);
        };
    }, [open]);

    return (
        <div ref={containerRef} className='relative min-w-0'>
            {props.name ? <input type='hidden' name={props.name} value={props.selectedModelId} /> : null}
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
                        ? getOptionDisplayText(selectedOption, labelCollisionIndex)
                        : props.models.length === 0
                          ? 'No models available'
                          : props.placeholder}
                </span>
                <ChevronDown className='h-4 w-4 shrink-0 opacity-70' />
            </Button>

            {open && popoverLayout && typeof document !== 'undefined'
                ? createPortal(
                      <div
                          ref={panelRef}
                          className='border-border bg-popover text-popover-foreground fixed z-[80] overflow-hidden rounded-2xl border shadow-xl'
                           style={{
                               top: `${String(popoverLayout.top)}px`,
                               left: `${String(popoverLayout.left)}px`,
                               width: `${String(popoverLayout.width)}px`,
                           }}>
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

                          <div
                              id={listboxId}
                              role='listbox'
                              className='overflow-y-auto p-2'
                              style={{ maxHeight: `${String(popoverLayout.maxHeight)}px` }}>
                              {groups.length === 0 ? (
                                  <div className='text-muted-foreground px-3 py-6 text-sm'>
                                      No models matched that search.
                                  </div>
                              ) : (
                                  groups.map((group) => (
                                      <div key={group.key} className='mb-2 last:mb-0'>
                                          <div className='text-muted-foreground px-2 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                              {group.label}
                                          </div>
                                          <div className='space-y-1'>
                                              {group.options.map((option) => {
                                                   const priceMetric = formatMetric(option.price);
                                                   const latencyMetric = formatMetric(option.latency);
                                                   const throughputMetric = formatMetric(option.tps);
                                                   const metricBadges = [
                                                       priceMetric ? `Price ${priceMetric}` : undefined,
                                                       latencyMetric ? `Latency ${latencyMetric}` : undefined,
                                                       throughputMetric ? `TPS ${throughputMetric}` : undefined,
                                                   ].filter((badge): badge is string => Boolean(badge));
                                                  const selected = option.id === props.selectedModelId;

                                                  return (
                                                      <button
                                                          key={`${option.providerId ?? 'unknown'}:${option.id}`}
                                                          type='button'
                                                          role='option'
                                                          aria-selected={selected}
                                                          className={cn(
                                                              'focus-visible:ring-ring w-full rounded-xl border px-3 py-3 text-left transition focus-visible:ring-2 focus-visible:outline-none',
                                                              selected
                                                                  ? 'border-primary bg-primary/10 shadow-sm'
                                                                  : option.compatibilityState === 'incompatible'
                                                                    ? 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10'
                                                                    : option.compatibilityState === 'warning'
                                                                      ? 'border-border bg-amber-500/5 hover:bg-amber-500/10'
                                                                      : 'hover:bg-accent border-transparent bg-transparent'
                                                          )}
                                                          onClick={() => {
                                                              props.onSelectOption?.(option);
                                                              props.onSelectModel(option.id);
                                                              setOpen(false);
                                                          }}>
                                                          <div className='flex items-start justify-between gap-3'>
                                                              <div className='min-w-0'>
                                                                  <p className='truncate text-sm font-medium'>
                                                                      {getOptionDisplayText(
                                                                          option,
                                                                          labelCollisionIndex
                                                                      )}
                                                                  </p>
                                                                  <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                                                      {getModelDescription(option)}
                                                                  </p>
                                                                  {option.compatibilityReason &&
                                                                  option.compatibilityScope !== 'provider' ? (
                                                                      <p
                                                                          className={cn(
                                                                              'mt-1 text-xs leading-5',
                                                                              option.compatibilityState ===
                                                                                  'incompatible'
                                                                                  ? 'text-destructive'
                                                                                  : option.compatibilityState ===
                                                                                      'warning'
                                                                                    ? 'text-amber-700 dark:text-amber-300'
                                                                                    : 'text-muted-foreground'
                                                                          )}>
                                                                          {option.compatibilityReason}
                                                                      </p>
                                                                  ) : null}
                                                              </div>
                                                              {selected ? (
                                                                  <Check className='text-primary mt-0.5 h-4 w-4 shrink-0' />
                                                              ) : null}
                                                          </div>
                                                          {metricBadges.length > 0 ||
                                                          option.sourceProvider ||
                                                          option.capabilityBadges.length > 0 ? (
                                                              <div className='mt-2 flex flex-wrap gap-2'>
                                                                  {option.sourceProvider ? (
                                                                      <span className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                                                                          {option.sourceProvider}
                                                                      </span>
                                                                  ) : null}
                                                                  {option.capabilityBadges.map((badge) => (
                                                                      <span
                                                                          key={`${option.id}:${badge.key}`}
                                                                          className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                                                                          {formatCapabilityBadge(badge)}
                                                                      </span>
                                                                  ))}
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
                      </div>,
                      document.body
                  )
                : null}
        </div>
    );
}

function shouldUsePopoverPicker(props: ModelPickerProps): boolean {
    if (
        props.models.some((option) => option.capabilityBadges.length > 0 || option.compatibilityState !== 'compatible')
    ) {
        return true;
    }

    if (props.providerId === 'kilo') {
        return true;
    }

    const providerIds = new Set(
        props.models
            .map((option) => option.providerId)
            .filter(
                (providerId): providerId is NonNullable<ModelPickerOption['providerId']> => typeof providerId === 'string'
            )
    );
    return providerIds.size > 1;
}

export function ModelPicker(props: ModelPickerProps) {
    if (shouldUsePopoverPicker(props)) {
        return <PopoverModelPicker {...props} />;
    }

    const labelCollisionIndex = getModelLabelCollisionIndex(props.models);

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
                <option value=''>No models available</option>
            ) : (
                <>
                    <option value='' disabled>
                        {props.placeholder}
                    </option>
                    {props.models.map((model) => (
                        <option key={`${model.providerId ?? 'single'}:${model.id}`} value={model.id}>
                            {getOptionDisplayText(model, labelCollisionIndex)}
                        </option>
                    ))}
                </>
            )}
        </select>
    );
}
