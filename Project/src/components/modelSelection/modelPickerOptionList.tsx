import { Check } from 'lucide-react';

import type { ModelGroupViewModel, ModelOptionViewModel } from '@/web/components/modelSelection/modelPicker.types';
import { cn } from '@/web/lib/utils';

import type { ReactNode } from 'react';

interface ModelPickerOptionListProps {
    groups: ModelGroupViewModel[];
    optionIdPrefix?: string;
    onSelectOption?: (option: ModelOptionViewModel['option']) => void;
    onSelectModel: (modelId: string) => void;
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
                            <button
                                key={option.option.id}
                                id={
                                    props.optionIdPrefix
                                        ? `${props.optionIdPrefix}-${String(groupIndex)}-${String(optionIndex)}`
                                        : undefined
                                }
                                type='button'
                                role='option'
                                aria-selected={option.selected}
                                className={cn(
                                    'focus-visible:ring-ring w-full rounded-xl border px-3 py-3 text-left transition focus-visible:ring-2 focus-visible:outline-none',
                                    option.selected
                                        ? 'border-primary bg-primary/10 shadow-sm'
                                        : getOptionToneClassName(option.option)
                                )}
                                onClick={() => {
                                    props.onSelectOption?.(option.option);
                                    props.onSelectModel(option.option.id);
                                }}>
                                <div className='flex items-start justify-between gap-3'>
                                    <div className='min-w-0'>
                                        <p className='truncate text-sm font-medium'>{option.displayText}</p>
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
                                    </div>
                                    {option.selected ? (
                                        <Check className='text-primary mt-0.5 h-4 w-4 shrink-0' />
                                    ) : null}
                                </div>
                                {option.sourceProviderBadge ||
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
                                        {option.metricBadges.map((badge) =>
                                            renderOptionBadge(badge, `${option.option.id}:metric:${badge}`)
                                        )}
                                    </div>
                                ) : null}
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </div>
    );
}
