import { ChevronDown, Search } from 'lucide-react';
import { createPortal } from 'react-dom';

import type { ModelPickerProps } from '@/web/components/modelSelection/modelPicker.types';
import type { ModelOptionViewModel, ModelPickerReadModel } from '@/web/components/modelSelection/modelPicker.types';
import { ModelPickerOptionList } from '@/web/components/modelSelection/modelPickerOptionList';
import type { ModelPickerPopoverController } from '@/web/components/modelSelection/useModelPickerPopoverController';
import { Button } from '@/web/components/ui/button';

interface ModelPickerPopoverViewProps extends ModelPickerProps {
    controller: ModelPickerPopoverController;
    readModel: ModelPickerReadModel;
}

function matchesModelQuery(input: { query: string; option: ModelOptionViewModel }): boolean {
    const normalizedQuery = input.query.trim().toLowerCase();
    if (normalizedQuery.length === 0) {
        return true;
    }

    return [
        input.option.option.id,
        input.option.option.label,
        input.option.displayText,
        input.option.description,
        input.option.providerInstanceBadge,
        input.option.option.providerLabel,
        input.option.option.providerId,
        input.option.option.sourceProvider,
        input.option.option.promptFamily,
        input.option.option.compatibilityReason,
        ...input.option.option.capabilityBadges.map((badge) => badge.label),
        ...input.option.roleDefaultBadges,
        input.option.availabilityLabel,
    ]
        .filter((value): value is string => typeof value === 'string')
        .some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function ModelPickerPopoverView(props: ModelPickerPopoverViewProps) {
    const selectedOptionViewModel = props.readModel.options.find((option) => option.selected);
    const portalHost = typeof document === 'undefined' ? null : document.body;
    const filteredGroups = props.readModel.groups
        .map((group) => ({
            ...group,
            options: group.options.filter((optionViewModel) =>
                matchesModelQuery({
                    query: props.controller.query,
                    option: optionViewModel,
                })
            ),
        }))
        .filter((group) => group.options.length > 0);

    return (
        <div ref={props.controller.containerRef} className='relative min-w-0'>
            {props.name ? <input type='hidden' name={props.name} value={props.selectedModelId} /> : null}
            <Button
                {...(props.id ? { id: props.id } : {})}
                type='button'
                variant='outline'
                className='h-10 w-full min-w-0 justify-between rounded-xl px-3 text-left'
                aria-label={props.ariaLabel}
                aria-haspopup='listbox'
                aria-expanded={props.controller.isOpen}
                aria-controls={props.controller.listboxId}
                disabled={props.disabled || props.models.length === 0}
                onClick={props.controller.togglePopover}>
                <span className='min-w-0 truncate'>
                    {selectedOptionViewModel?.displayText
                        ? selectedOptionViewModel.displayText
                        : props.models.length === 0
                          ? 'No models available'
                          : props.placeholder}
                </span>
                <ChevronDown className='h-4 w-4 shrink-0 opacity-70' />
            </Button>
            {props.continuationLockMessage ? (
                <p className='text-muted-foreground mt-1 text-[11px] leading-5'>{props.continuationLockMessage}</p>
            ) : null}

            {props.controller.isOpen && props.controller.popoverLayout && portalHost
                ? createPortal(
                      <div
                          ref={props.controller.panelRef}
                          id={`${props.controller.listboxId}-popover`}
                          className='border-border bg-popover text-popover-foreground fixed z-[80] overflow-hidden rounded-2xl border shadow-xl'
                          style={{
                              top: `${String(props.controller.popoverLayout.top)}px`,
                              left: `${String(props.controller.popoverLayout.left)}px`,
                              width: `${String(props.controller.popoverLayout.width)}px`,
                          }}>
                          <div className='border-border bg-background/90 border-b px-3 py-3'>
                              <label className='sr-only' htmlFor={`${props.controller.listboxId}-search`}>
                                  Search models
                              </label>
                              <div className='border-border bg-background flex items-center gap-2 rounded-xl border px-3'>
                                  <Search className='text-muted-foreground h-4 w-4 shrink-0' />
                                  <input
                                      ref={props.controller.searchInputRef}
                                      id={`${props.controller.listboxId}-search`}
                                      type='text'
                                      aria-controls={props.controller.listboxId}
                                      value={props.controller.query}
                                      onChange={(event) => {
                                          props.controller.setQuery(event.target.value);
                                      }}
                                      className='h-10 w-full bg-transparent text-sm outline-none'
                                      placeholder='Search models'
                                  />
                              </div>
                          </div>

                          <div
                              id={props.controller.listboxId}
                              role='listbox'
                              aria-label={`${props.ariaLabel} options`}
                              className='overflow-y-auto p-2'
                              style={{ maxHeight: `${String(props.controller.popoverLayout.maxHeight)}px` }}>
                              {filteredGroups.length === 0 ? (
                                  <div className='text-muted-foreground px-3 py-6 text-sm'>
                                      No models matched that search.
                                  </div>
                              ) : (
                                  <ModelPickerOptionList
                                      {...(props.onSelectOption ? { onSelectOption: props.onSelectOption } : {})}
                                      {...(props.onToggleFavorite
                                          ? { onToggleFavorite: props.onToggleFavorite }
                                          : {})}
                                      groups={filteredGroups}
                                      optionIdPrefix={`${props.controller.listboxId}-option`}
                                      onSelectModel={(modelId) => {
                                          props.onSelectModel(modelId);
                                          props.controller.closePopover();
                                      }}
                                  />
                              )}
                          </div>
                      </div>,
                      portalHost
                  )
                : null}
        </div>
    );
}
