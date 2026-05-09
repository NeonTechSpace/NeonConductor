import { Check, Star } from 'lucide-react';

import type { ModelGroupViewModel, ModelOptionViewModel } from '@/web/components/modelSelection/modelPicker.types';
import { cn } from '@/web/lib/utils';

import type { ReactNode } from 'react';

interface ModelPickerOptionListProps {
    groups: ModelGroupViewModel[];
    optionIdPrefix?: string;
    onSelectOption?: (option: ModelOptionViewModel['option']) => void;
    onSelectModel: (modelId: string) => void;
    onToggleFavorite?: (option: ModelOptionViewModel['option'], favorite: boolean) => void;
}

function getOptionToneClassName(option: ModelOptionViewModel['option']): string {
    if (option.compatibilityState === 'incompatible') {
        return 'border-destructive/30 bg-destructive/5 hover:bg-destructive/10';
    }

    if (option.compatibilityState === 'warning') {
        return 'border-border bg-amber-500/5 hover:bg-amber-500/10';
    }

    return 'hover:bg-accent border-transparent bg-transparent';
}

function renderOptionBadge(text: string, key: string): ReactNode {
    return (
        <span key={key} className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
            {text}
        </span>
    );
}

export function ModelPickerOptionList(props: ModelPickerOptionListProps) {
    return (
        <div className='space-y-1'>
            {props.groups.map((group, groupIndex) => (
                <div key={group.key} role='group' aria-label={group.label} className='mb-2 last:mb-0'>
                    <div className='text-muted-foreground px-2 py-1 text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        {group.label}
                    </div>
                    <div className='space-y-1'>
                        {group.options.map((option, optionIndex) => (
                            <div
                                key={option.option.id}
                                id={
                                    props.optionIdPrefix
                                        ? `${props.optionIdPrefix}-${String(groupIndex)}-${String(optionIndex)}`
                                        : undefined
                                }
                                role='option'
                                tabIndex={0}
                                aria-selected={option.selected}
                                className={cn(
                                    'focus-visible:ring-ring w-full cursor-pointer rounded-xl border px-3 py-3 text-left transition focus-visible:ring-2 focus-visible:outline-none',
                                    option.selected
                                        ? 'border-primary bg-primary/10 shadow-sm'
                                        : getOptionToneClassName(option.option)
                                )}
                                onClick={() => {
                                    props.onSelectOption?.(option.option);
                                    props.onSelectModel(option.option.id);
                                }}
                                onKeyDown={(event) => {
                                    if (event.key !== 'Enter' && event.key !== ' ') {
                                        return;
                                    }
                                    event.preventDefault();
                                    props.onSelectOption?.(option.option);
                                    props.onSelectModel(option.option.id);
                                }}>
                                <div className='flex items-start justify-between gap-3'>
                                    <div className='min-w-0'>
                                        <div className='flex min-w-0 flex-wrap items-center gap-2'>
                                            <p className='min-w-0 truncate text-sm font-medium'>{option.displayText}</p>
                                            {option.providerInstanceBadge ? (
                                                <span className='border-border bg-background rounded-full border px-2 py-0.5 text-[11px]'>
                                                    {option.providerInstanceBadge}
                                                </span>
                                            ) : null}
                                        </div>
                                        <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                            {option.description}
                                        </p>
                                        {option.option.compatibilityReason &&
                                        option.option.compatibilityScope !== 'provider' ? (
                                            <p
                                                className={cn(
                                                    'mt-1 text-xs leading-5',
                                                    option.option.compatibilityState === 'incompatible'
                                                        ? 'text-destructive'
                                                        : option.option.compatibilityState === 'warning'
                                                          ? 'text-amber-700 dark:text-amber-300'
                                                          : 'text-muted-foreground'
                                                )}>
                                                {option.option.compatibilityReason}
                                            </p>
                                        ) : null}
                                        {option.availabilityLabel &&
                                        option.option.compatibilityScope === 'provider' ? (
                                            <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                                {option.availabilityLabel}
                                            </p>
                                        ) : null}
                                    </div>
                                    <div className='flex shrink-0 items-center gap-1'>
                                        {props.onToggleFavorite ? (
                                            <button
                                                type='button'
                                                aria-label={
                                                    option.isFavorite
                                                        ? `Remove ${option.displayText} from favorite models`
                                                        : `Add ${option.displayText} to favorite models`
                                                }
                                                className={cn(
                                                    'focus-visible:ring-ring rounded-md p-1 focus-visible:ring-2 focus-visible:outline-none',
                                                    option.isFavorite
                                                        ? 'text-amber-500'
                                                        : 'text-muted-foreground hover:text-foreground'
                                                )}
                                                onClick={(event) => {
                                                    event.stopPropagation();
                                                    props.onToggleFavorite?.(option.option, !option.isFavorite);
                                                }}
                                                onKeyDown={(event) => {
                                                    event.stopPropagation();
                                                }}>
                                                <Star
                                                    className={cn('h-4 w-4', option.isFavorite ? 'fill-current' : '')}
                                                />
                                            </button>
                                        ) : null}
                                        {option.selected ? (
                                            <Check className='text-primary mt-0.5 h-4 w-4 shrink-0' />
                                        ) : null}
                                    </div>
                                </div>
                                {option.sourceProviderBadge ||
                                option.roleDefaultBadges.length > 0 ||
                                option.capabilityBadges.length > 0 ||
                                option.metricBadges.length > 0 ? (
                                    <div className='mt-2 flex flex-wrap gap-2'>
                                        {option.sourceProviderBadge
                                            ? renderOptionBadge(
                                                  option.sourceProviderBadge,
                                                  `${option.option.id}:source`
                                              )
                                            : null}
                                        {option.capabilityBadges.map((badge) =>
                                            renderOptionBadge(badge, `${option.option.id}:capability:${badge}`)
                                        )}
                                        {option.roleDefaultBadges.map((badge) =>
                                            renderOptionBadge(badge, `${option.option.id}:role:${badge}`)
                                        )}
                                        {option.metricBadges.map((badge) =>
                                            renderOptionBadge(badge, `${option.option.id}:metric:${badge}`)
                                        )}
                                    </div>
                                ) : null}
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
