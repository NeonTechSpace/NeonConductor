import { ImagePlus } from 'lucide-react';

import { readRuntimeProviderId } from '@/web/components/conversation/panels/composerActionPanel/composerProviderId';
import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { Button } from '@/web/components/ui/button';

import type { RuntimeReasoningEffort } from '@/shared/contracts';

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
    queueButtonLabel: string;
    onProfileChange: ((profileId: string) => void) | undefined;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onReasoningEffortChange: (effort: RuntimeReasoningEffort) => void;
    onModeChange: (modeKey: string) => void;
    onQueuePrompt?: () => void;
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
    queueButtonLabel,
    onProfileChange,
    onProviderChange,
    onModelChange,
    onReasoningEffortChange,
    onModeChange,
    onQueuePrompt,
    onOpenFilePicker,
}: ComposerRunControlsBarProps) {
    return (
        <div className='border-border/60 space-y-3 border-t px-4 pt-3 pb-4'>
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
                            className='min-h-10 rounded-full'
                            disabled={composerControlsDisabled || !canAttachImages}
                            onClick={onOpenFilePicker}>
                            <ImagePlus className='h-4 w-4' />
                            Attach
                        </Button>
                <div className='ml-auto'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        className='mr-2 min-h-10 rounded-full'
                        disabled={composerSubmitDisabled || isSubmitting || !onQueuePrompt}
                        onClick={() => {
                            onQueuePrompt?.();
                        }}>
                        {queueButtonLabel}
                    </Button>
                    <Button
                        type='submit'
                        size='sm'
                        className='min-h-10 rounded-full'
                        disabled={composerSubmitDisabled || isSubmitting}>
                        {submitButtonLabel}
                    </Button>
                </div>
            </div>
            {compactConnectionLabel || routingBadge ? (
                <div className='text-muted-foreground flex flex-wrap items-center gap-2 text-[11px]'>
                    {compactConnectionLabel ? (
                        <span className='border-border bg-background/70 rounded-full border px-3 py-1 tabular-nums'>
                            {compactConnectionLabel}
                        </span>
                    ) : null}
                    {routingBadge ? (
                        <span className='border-border bg-background/70 rounded-full border px-3 py-1'>
                            {routingBadge}
                        </span>
                    ) : null}
                </div>
            ) : null}
        </div>
    );
}
