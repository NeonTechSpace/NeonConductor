import { ImagePlus } from 'lucide-react';

import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { Button } from '@/web/components/ui/button';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';

import { providerIds, type RuntimeProviderId, type RuntimeReasoningEffort } from '@/shared/contracts';

export function readRuntimeProviderId(value: string | undefined): RuntimeProviderId | undefined {
    return isOneOf(value, providerIds) ? value : undefined;
}

interface ComposerRunControlsBarProps {
    composerControlsDisabled: boolean;
    composerSubmitDisabled: boolean;
    isSubmitting: boolean;
    profiles: Array<{ id: string; name: string }> | undefined;
    selectedProfileId: string | undefined;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    shouldShowModePicker: boolean;
    activeModeKey: string;
    modes: ConversationModeOption[];
    selectedReasoningEffort: RuntimeReasoningEffort;
    availableReasoningEfforts: Array<{ value: RuntimeReasoningEffort; label: string }>;
    reasoningControlDisabled: boolean;
    canAttachImages: boolean;
    routingBadge: string | undefined;
    compactConnectionLabel: string | undefined;
    modelOptions: ModelPickerOption[];
    submitButtonLabel: string;
    onProfileChange: ((profileId: string) => void) | undefined;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onReasoningEffortChange: (effort: RuntimeReasoningEffort) => void;
    onModeChange: (modeKey: string) => void;
    onOpenFilePicker: () => void;
}

export function ComposerRunControlsBar({
    composerControlsDisabled,
    composerSubmitDisabled,
    isSubmitting,
    profiles,
    selectedProfileId,
    selectedProviderId,
    selectedModelId,
    shouldShowModePicker,
    activeModeKey,
    modes,
    selectedReasoningEffort,
    availableReasoningEfforts,
    reasoningControlDisabled,
    canAttachImages,
    routingBadge,
    compactConnectionLabel,
    modelOptions,
    submitButtonLabel,
    onProfileChange,
    onProviderChange,
    onModelChange,
    onReasoningEffortChange,
    onModeChange,
    onOpenFilePicker,
}: ComposerRunControlsBarProps) {
    return (
        <div className='border-border space-y-3 border-t px-4 py-3'>
            <div className='flex flex-wrap items-center gap-2'>
                <div className='min-w-[220px] flex-[1.35]'>
                    <ModelPicker
                        id='composer-model-select'
                        name='composerModel'
                        providerId={readRuntimeProviderId(selectedProviderId)}
                        selectedModelId={selectedModelId ?? ''}
                        models={modelOptions}
                        disabled={composerControlsDisabled || modelOptions.length === 0}
                        ariaLabel='Model'
                        placeholder='Select model'
                        onSelectOption={(option) => {
                            if (option.providerId && option.providerId !== selectedProviderId) {
                                onProviderChange(option.providerId);
                            }
                        }}
                        onSelectModel={onModelChange}
                    />
                </div>
                {profiles && profiles.length > 0 ? (
                    <label className='min-w-[150px] flex-1 sm:max-w-[220px]'>
                        <span className='sr-only'>Profile</span>
                        <select
                            aria-label='Profile'
                            value={selectedProfileId ?? ''}
                            className='border-border bg-background h-10 w-full rounded-full border px-3 text-sm'
                            disabled={composerControlsDisabled || !selectedProfileId || !onProfileChange}
                            onChange={(event) => {
                                onProfileChange?.(event.target.value);
                            }}>
                            {profiles.map((profile) => (
                                <option key={profile.id} value={profile.id}>
                                    {profile.name}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                {shouldShowModePicker ? (
                    <label className='min-w-[140px] flex-1 sm:max-w-[180px]'>
                        <span className='sr-only'>Mode</span>
                        <select
                            aria-label='Execution mode'
                            value={activeModeKey}
                            onChange={(event) => {
                                onModeChange(event.target.value);
                            }}
                            className='border-border bg-background h-10 w-full rounded-full border px-3 text-sm'
                            disabled={composerControlsDisabled || modes.length === 0}>
                            {modes.map((mode) => (
                                <option key={mode.id} value={mode.modeKey}>
                                    {mode.label}
                                </option>
                            ))}
                        </select>
                    </label>
                ) : null}
                <label className='min-w-[140px] flex-1 sm:max-w-[180px]'>
                    <span className='sr-only'>Reasoning</span>
                    <select
                        id='composer-reasoning-select'
                        aria-label='Reasoning effort'
                        value={selectedReasoningEffort}
                        onChange={(event) => {
                            const selectedEffort = availableReasoningEfforts.find((option) => option.value === event.target.value)
                                ?.value;
                            if (!selectedEffort) {
                                return;
                            }

                            onReasoningEffortChange(selectedEffort);
                        }}
                        className='border-border bg-background h-10 w-full rounded-full border px-3 text-sm'
                        disabled={reasoningControlDisabled}>
                        {availableReasoningEfforts.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </label>
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='rounded-full'
                    disabled={composerControlsDisabled || !canAttachImages}
                    onClick={onOpenFilePicker}>
                    <ImagePlus className='h-4 w-4' />
                    Attach
                </Button>
                <div className='ml-auto flex items-center gap-2'>
                    {compactConnectionLabel ? (
                        <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-[11px]'>
                            {compactConnectionLabel}
                        </span>
                    ) : null}
                    {routingBadge ? (
                        <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-[11px]'>
                            {routingBadge}
                        </span>
                    ) : null}
                    <Button
                        type='submit'
                        size='sm'
                        className='rounded-full'
                        disabled={composerSubmitDisabled || isSubmitting}>
                        {submitButtonLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
