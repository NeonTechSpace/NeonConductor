import { ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
    getImagePreviewStatusLabel,
    getPendingImagePreviewState,
} from '@/web/components/conversation/messages/imagePreviewState';
import type { ModelCompatibilityState, ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { Button } from '@/web/components/ui/button';
import { readRelatedTargetNode } from '@/web/lib/dom/readRelatedTargetNode';

import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
import type { ResolvedContextState, RuntimeReasoningEffort, TopLevelTab } from '@/shared/contracts';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

interface PendingImageView {
    clientId: string;
    fileName: string;
    previewUrl: string;
    status: 'queued' | 'compressing' | 'ready' | 'failed';
    errorMessage?: string;
    byteSize?: number;
    attachment?: {
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
        width: number;
        height: number;
    };
}

interface ComposerActionPanelProps {
    pendingImages: PendingImageView[];
    disabled: boolean;
    controlsDisabled?: boolean;
    submitDisabled?: boolean;
    isSubmitting: boolean;
    profiles?: Array<{ id: string; name: string }>;
    selectedProfileId?: string;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    topLevelTab: TopLevelTab;
    activeModeKey: string;
    modes: ConversationModeOption[];
    reasoningEffort: RuntimeReasoningEffort;
    selectedModelSupportsReasoning: boolean;
    supportedReasoningEfforts?: RuntimeReasoningEffort[];
    canAttachImages: boolean;
    maxImageAttachmentsPerMessage: number;
    imageAttachmentBlockedReason?: string;
    routingBadge?: string;
    selectedModelCompatibilityState?: ModelCompatibilityState;
    selectedModelCompatibilityReason?: string;
    selectedProviderStatus?: {
        label: string;
        authState: string;
        authMethod: string;
    };
    modelOptions: ModelPickerOption[];
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    promptResetKey?: number;
    focusComposerRequestKey?: number;
    onProfileChange?: (profileId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onReasoningEffortChange: (effort: RuntimeReasoningEffort) => void;
    onModeChange: (modeKey: string) => void;
    onPromptEdited: () => void;
    onAddImageFiles: (files: FileList | File[]) => void;
    onRemovePendingImage: (clientId: string) => void;
    onRetryPendingImage: (clientId: string) => void;
    onSubmitPrompt: (prompt: string) => void;
    onCompactContext?: () => Promise<
        | void
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
    >;
}

function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
}

function formatUsagePercent(usedTokens: number, budgetTokens: number): string {
    if (!Number.isFinite(usedTokens) || !Number.isFinite(budgetTokens) || budgetTokens <= 0) {
        return '-';
    }

    return `${Math.round((usedTokens / budgetTokens) * 100).toString()}%`;
}

function formatCompactionTimestamp(value: string): string {
    const timestamp = new Date(value);
    if (Number.isNaN(timestamp.getTime())) {
        return value;
    }
    return timestamp.toLocaleString();
}

function formatImageBytes(value?: number): string | undefined {
    if (value === undefined) {
        return undefined;
    }

    return `${(value / 1_000_000).toFixed(2)} MB`;
}

function extractDroppedFiles(dataTransfer: DataTransfer | null): File[] {
    if (!dataTransfer) {
        return [];
    }

    return Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'));
}

function extractClipboardFiles(clipboardData: DataTransfer | null): File[] {
    if (!clipboardData) {
        return [];
    }

    return Array.from(clipboardData.items)
        .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
        .map((item) => item.getAsFile())
        .filter((file): file is File => file !== null);
}

export function shouldSubmitComposerOnEnter(input: {
    key: string;
    shiftKey: boolean;
    nativeEvent: { isComposing?: boolean };
}): boolean {
    return input.key === 'Enter' && !input.shiftKey && input.nativeEvent.isComposing !== true;
}

const reasoningEffortOptions: Array<{ value: RuntimeReasoningEffort; label: string }> = [
    { value: 'none', label: 'Off' },
    { value: 'minimal', label: 'Minimal' },
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'xhigh', label: 'Max' },
];

export function ComposerActionPanel({
    pendingImages,
    disabled,
    controlsDisabled,
    submitDisabled,
    isSubmitting,
    profiles,
    selectedProfileId,
    selectedProviderId,
    selectedModelId,
    topLevelTab,
    activeModeKey,
    modes,
    reasoningEffort,
    selectedModelSupportsReasoning,
    supportedReasoningEfforts,
    canAttachImages,
    maxImageAttachmentsPerMessage,
    imageAttachmentBlockedReason,
    routingBadge,
    selectedModelCompatibilityState,
    selectedModelCompatibilityReason,
    selectedProviderStatus,
    modelOptions,
    runErrorMessage,
    contextState,
    canCompactContext = false,
    isCompactingContext = false,
    promptResetKey,
    focusComposerRequestKey,
    onProfileChange,
    onProviderChange,
    onModelChange,
    onReasoningEffortChange,
    onModeChange,
    onPromptEdited,
    onAddImageFiles,
    onRemovePendingImage,
    onRetryPendingImage,
    onSubmitPrompt,
    onCompactContext,
}: ComposerActionPanelProps) {
    const [isDragActive, setIsDragActive] = useState(false);
    const [draftPrompt, setDraftPrompt] = useState('');
    const [lightboxImage, setLightboxImage] = useState<
        | {
              imageUrl: string;
              title: string;
              detail?: string;
          }
        | undefined
    >(undefined);
    const [contextFeedback, setContextFeedback] = useState<
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
        | undefined
    >(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
    const thresholdTokens = contextState?.policy.thresholdTokens;
    const totalTokens = contextState?.estimate?.totalTokens;
    const usableInputBudgetTokens = contextState?.policy.usableInputBudgetTokens;
    const hasUsageNumbers = totalTokens !== undefined && usableInputBudgetTokens !== undefined;
    const remainingInputTokens =
        hasUsageNumbers && usableInputBudgetTokens !== undefined && totalTokens !== undefined
            ? Math.max(usableInputBudgetTokens - totalTokens, 0)
            : undefined;
    const usagePercent =
        hasUsageNumbers && usableInputBudgetTokens !== undefined && totalTokens !== undefined
            ? formatUsagePercent(totalTokens, usableInputBudgetTokens)
            : undefined;
    const countingModeLabel =
        contextState?.estimate?.mode === 'exact' || contextState?.countingMode === 'exact' ? 'Exact' : 'Estimated';
    const compactionRecord = contextState?.compaction;
    const hasBlockingPendingImages = pendingImages.some((image) => image.status !== 'ready');
    const hasSubmittableContent = draftPrompt.trim().length > 0 || pendingImages.some((image) => image.status === 'ready');
    const hasUnsupportedPendingImages = pendingImages.length > 0 && !canAttachImages;
    const composerControlsDisabled = controlsDisabled ?? disabled;
    const composerSubmitDisabled = submitDisabled ?? disabled;
    const shouldShowModePicker = topLevelTab !== 'chat';
    const isKiloReasoningModel = selectedProviderId === 'kilo' && selectedModelSupportsReasoning;
    const availableReasoningEfforts = selectedModelSupportsReasoning
        ? reasoningEffortOptions.filter((option) => {
              if (option.value === 'none') {
                  return true;
              }

              if (isKiloReasoningModel) {
                  return supportedReasoningEfforts?.includes(option.value) ?? false;
              }

              return supportedReasoningEfforts === undefined || supportedReasoningEfforts.includes(option.value);
          })
        : reasoningEffortOptions.filter((option) => option.value === 'none');
    const hasAdjustableReasoningEfforts = availableReasoningEfforts.length > 1;
    const selectedReasoningEffort = availableReasoningEfforts.some((option) => option.value === reasoningEffort)
        ? reasoningEffort
        : 'none';
    const reasoningControlDisabled =
        composerControlsDisabled || !selectedModelSupportsReasoning || !hasAdjustableReasoningEfforts;
    const compactConnectionLabel = selectedProviderStatus
        ? `${selectedProviderStatus.label} · ${selectedProviderStatus.authState.replace('_', ' ')}`
        : undefined;
    const attachmentStatusMessage = hasUnsupportedPendingImages
        ? (imageAttachmentBlockedReason ?? 'Select a vision-capable model to send attached images.')
        : selectedModelCompatibilityState === 'incompatible' && selectedModelCompatibilityReason
          ? selectedModelCompatibilityReason
          : hasBlockingPendingImages
            ? 'Sending is locked until every image finishes processing.'
            : pendingImages.length > 0
              ? 'Images are ready to send with this message.'
              : canAttachImages
                ? `Attach up to ${String(maxImageAttachmentsPerMessage)} images or send text-only.`
                : 'Text-only prompt.';
    const composerFooterMessage = composerSubmitDisabled
        ? 'Create or select a thread before you start the run.'
        : attachmentStatusMessage;

    useEffect(() => {
        if (focusComposerRequestKey === undefined) {
            return;
        }

        promptTextareaRef.current?.focus();
    }, [focusComposerRequestKey]);

    useEffect(() => {
        if (promptResetKey === undefined) {
            return;
        }

        setDraftPrompt('');
    }, [promptResetKey]);

    useEffect(() => {
        setContextFeedback(undefined);
    }, [selectedProviderId, selectedModelId, topLevelTab, activeModeKey]);

    function openFilePicker() {
        fileInputRef.current?.click();
    }

    return (
        <>
            <form
                className='space-y-3'
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!canAttachImages || composerControlsDisabled) {
                        return;
                    }

                    setIsDragActive(true);
                }}
                onDragLeave={(event) => {
                    if (event.currentTarget.contains(readRelatedTargetNode(event.relatedTarget))) {
                        return;
                    }

                    setIsDragActive(false);
                }}
                onDrop={(event) => {
                    event.preventDefault();
                    setIsDragActive(false);
                    if (!canAttachImages || composerControlsDisabled) {
                        return;
                    }

                    const files = extractDroppedFiles(event.dataTransfer);
                    if (files.length === 0) {
                        return;
                    }

                    onAddImageFiles(files);
                }}
                onSubmit={(event) => {
                    event.preventDefault();
                    onSubmitPrompt(draftPrompt);
                }}>
                <input
                    ref={fileInputRef}
                    type='file'
                    accept='image/jpeg,image/png,image/webp'
                    multiple
                    className='hidden'
                    onChange={(event) => {
                        if (event.target.files && event.target.files.length > 0) {
                            onAddImageFiles(event.target.files);
                            event.target.value = '';
                        }
                    }}
                />
                {runErrorMessage ? (
                    <p aria-live='polite' className='text-destructive text-xs'>
                        {runErrorMessage}
                    </p>
                ) : null}
                {contextState ? (
                    <div className='border-border bg-card/40 space-y-1 rounded-md border px-3 py-2'>
                        <div className='flex flex-wrap items-center justify-between gap-2'>
                            <div className='space-y-0.5'>
                                <p className='text-[11px] font-semibold tracking-[0.14em] uppercase'>Context</p>
                                {hasUsageNumbers ? (
                                    <>
                                        <p className='text-xs font-medium'>
                                            {formatTokenCount(totalTokens)} used of{' '}
                                            {formatTokenCount(usableInputBudgetTokens)} usable input tokens
                                        </p>
                                        <div className='text-muted-foreground grid gap-1 text-[11px] sm:grid-cols-3'>
                                            <p>Remaining {formatTokenCount(remainingInputTokens ?? 0)}</p>
                                            <p>Usage {usagePercent}</p>
                                            <p>{countingModeLabel} counting</p>
                                        </div>
                                    </>
                                ) : contextState.policy.disabledReason === 'missing_model_limits' ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Current thread usage is unavailable because this model has no known context
                                        limit yet.
                                    </p>
                                ) : contextState.policy.disabledReason === 'feature_disabled' ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Current thread usage is unavailable because context management is disabled for
                                        this profile.
                                    </p>
                                ) : contextState.policy.disabledReason === 'multimodal_counting_unavailable' ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Current thread usage is unavailable for image sessions because multimodal token
                                        counting is not implemented yet.
                                    </p>
                                ) : (
                                    <p className='text-muted-foreground text-xs'>
                                        Current thread usage is active with {contextState.countingMode} counting for
                                        this model.
                                    </p>
                                )}
                            </div>
                            {onCompactContext ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={!canCompactContext || isCompactingContext}
                                    onClick={() => {
                                        if (!onCompactContext) {
                                            return;
                                        }

                                        setContextFeedback(undefined);
                                        void onCompactContext()
                                            .then((result) => {
                                                if (!result) {
                                                    return;
                                                }

                                                setContextFeedback(result);
                                            })
                                            .catch((error: unknown) => {
                                                setContextFeedback({
                                                    tone: 'error',
                                                    message:
                                                        error instanceof Error
                                                            ? error.message
                                                            : 'Context compaction failed.',
                                                });
                                            });
                                    }}>
                                    {isCompactingContext ? 'Compacting...' : 'Compact now'}
                                </Button>
                            ) : null}
                        </div>
                        {compactionRecord ? (
                            <p className='text-muted-foreground text-[11px]'>
                                Last compacted {compactionRecord.source} at{' '}
                                {formatCompactionTimestamp(compactionRecord.updatedAt)}.
                            </p>
                        ) : null}
                        {thresholdTokens !== undefined ? (
                            <p className='text-muted-foreground text-[11px]'>
                                Compaction threshold: {formatTokenCount(thresholdTokens)} tokens.
                            </p>
                        ) : null}
                        <p className='text-muted-foreground text-[11px]'>
                            Limit source: {contextState.policy.limits.source}
                            {contextState.policy.limits.overrideReason
                                ? ` · Override: ${contextState.policy.limits.overrideReason}`
                                : ''}
                        </p>
                        {contextFeedback ? (
                            <p
                                className={`text-xs ${
                                    contextFeedback.tone === 'error'
                                        ? 'text-destructive'
                                        : contextFeedback.tone === 'success'
                                          ? 'text-primary'
                                          : 'text-muted-foreground'
                                }`}>
                                {contextFeedback.message}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                <div
                    className={`border-border bg-card/30 relative overflow-hidden rounded-2xl border transition ${
                        isDragActive ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]' : ''
                    }`}>
                    {compactConnectionLabel || routingBadge ? (
                        <div className='border-border flex flex-wrap items-center gap-2 border-b px-4 py-3'>
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
                        </div>
                    ) : null}
                    {imageAttachmentBlockedReason && !canAttachImages ? (
                        <p className='text-muted-foreground border-border border-b px-4 py-3 text-xs'>
                            {imageAttachmentBlockedReason}
                        </p>
                    ) : null}
                    {pendingImages.length > 0 ? (
                        <div className='border-border grid gap-2 border-b px-4 py-4 sm:grid-cols-2 xl:grid-cols-4'>
                            {pendingImages.map((image) => {
                                const previewState = getPendingImagePreviewState(image.status);

                                return (
                                    <div
                                        key={image.clientId}
                                        className='border-border bg-background/80 rounded-2xl border p-2'>
                                        <button
                                            type='button'
                                            className='group focus-visible:ring-ring focus-visible:ring-offset-background block w-full rounded-xl text-left focus-visible:ring-2 focus-visible:ring-offset-2'
                                            onClick={() => {
                                                setLightboxImage({
                                                    imageUrl: image.previewUrl,
                                                    title: image.fileName,
                                                    ...(image.attachment
                                                        ? {
                                                              detail: `${String(image.attachment.width)} × ${String(image.attachment.height)}`,
                                                          }
                                                        : {}),
                                                });
                                            }}>
                                            <div className='bg-muted relative overflow-hidden rounded-xl'>
                                                <img
                                                    src={image.previewUrl}
                                                    alt={image.fileName}
                                                    width={image.attachment?.width ?? 512}
                                                    height={image.attachment?.height ?? 512}
                                                    loading='lazy'
                                                    decoding='async'
                                                    className='h-32 w-full object-cover transition duration-200 group-hover:scale-[1.02]'
                                                />
                                                <div className='absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-1 text-[11px] text-white'>
                                                    <span className='truncate'>
                                                        {getImagePreviewStatusLabel(previewState)}
                                                    </span>
                                                    <span>{formatImageBytes(image.byteSize) ?? ''}</span>
                                                </div>
                                            </div>
                                        </button>
                                        <div className='mt-2 space-y-1'>
                                            <p className='truncate text-xs font-medium'>{image.fileName}</p>
                                            {image.attachment ? (
                                                <p className='text-muted-foreground text-[11px]'>
                                                    {image.attachment.width} × {image.attachment.height} ·{' '}
                                                    {image.attachment.mimeType.replace('image/', '').toUpperCase()}
                                                </p>
                                            ) : null}
                                            {image.errorMessage ? (
                                                <p aria-live='polite' className='text-destructive text-[11px]'>
                                                    {image.errorMessage}
                                                </p>
                                            ) : (
                                                <p aria-live='polite' className='text-muted-foreground text-[11px]'>
                                                    {image.status === 'queued'
                                                        ? 'Image is queued and will start processing soon.'
                                                        : previewState === 'loading'
                                                          ? 'Image is being compressed before it can be sent.'
                                                          : previewState === 'ready'
                                                            ? 'Image is ready to be sent with this message.'
                                                            : 'Image preview is waiting for action.'}
                                                </p>
                                            )}
                                        </div>
                                        <div className='mt-2 flex items-center justify-end gap-1'>
                                            {image.status === 'failed' ? (
                                                <Button
                                                    type='button'
                                                    size='sm'
                                                    variant='outline'
                                                    className='h-7 px-2 text-[11px]'
                                                    onClick={() => {
                                                        onRetryPendingImage(image.clientId);
                                                    }}>
                                                    <RefreshCw className='h-3.5 w-3.5' />
                                                    Retry
                                                </Button>
                                            ) : null}
                                            {image.status === 'compressing' ? (
                                                <span className='text-muted-foreground inline-flex items-center gap-1 px-2 text-[11px]'>
                                                    <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
                                                    Preparing
                                                </span>
                                            ) : null}
                                            {image.status === 'queued' ? (
                                                <span className='text-muted-foreground inline-flex items-center gap-1 px-2 text-[11px]'>
                                                    Queued
                                                </span>
                                            ) : null}
                                            <Button
                                                type='button'
                                                size='sm'
                                                variant='outline'
                                                className='h-7 px-2 text-[11px]'
                                                onClick={() => {
                                                    onRemovePendingImage(image.clientId);
                                                }}>
                                                <X className='h-3.5 w-3.5' />
                                                Remove
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}
                    <textarea
                        ref={promptTextareaRef}
                        aria-label='Prompt'
                        name='composerPrompt'
                        value={draftPrompt}
                        onChange={(event) => {
                            if (runErrorMessage) {
                                onPromptEdited();
                            }
                            setDraftPrompt(event.target.value);
                        }}
                        onPaste={(event) => {
                            const files = extractClipboardFiles(event.clipboardData);
                            if (files.length === 0) {
                                return;
                            }

                            onAddImageFiles(files);
                            if (event.clipboardData.getData('text').trim().length === 0) {
                                event.preventDefault();
                            }
                        }}
                        onKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                            if (!shouldSubmitComposerOnEnter(event)) {
                                return;
                            }

                            if (
                                composerSubmitDisabled ||
                                isSubmitting ||
                                !hasSubmittableContent ||
                                hasBlockingPendingImages ||
                                hasUnsupportedPendingImages ||
                                selectedModelCompatibilityState === 'incompatible'
                            ) {
                                return;
                            }

                            event.preventDefault();
                            onSubmitPrompt(draftPrompt);
                        }}
                        rows={4}
                        className='border-border bg-background/70 focus-visible:ring-ring focus-visible:border-ring min-h-[160px] w-full resize-y border-t px-4 py-4 text-sm leading-6 focus-visible:ring-2 focus-visible:outline-none'
                        autoComplete='off'
                        spellCheck
                        placeholder='Type your message here…'
                    />
                    {isDragActive ? (
                        <div className='bg-primary/10 text-primary pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold backdrop-blur-sm'>
                            Drop images to attach them
                        </div>
                    ) : null}
                    <div className='border-border space-y-3 border-t px-4 py-3'>
                        <div className='flex flex-wrap items-center gap-2'>
                            <div className='min-w-[220px] flex-[1.35]'>
                                <ModelPicker
                                    id='composer-model-select'
                                    name='composerModel'
                                    providerId={undefined}
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
                                        const selectedEffort = availableReasoningEfforts.find(
                                            (option) => option.value === event.target.value
                                        )?.value;
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
                                onClick={openFilePicker}>
                                <ImagePlus className='h-4 w-4' />
                                Attach
                            </Button>
                            <div className='ml-auto'>
                                <Button
                                    type='submit'
                                    size='sm'
                                    className='rounded-full'
                                    disabled={
                                        composerSubmitDisabled ||
                                        isSubmitting ||
                                        !hasSubmittableContent ||
                                        hasBlockingPendingImages ||
                                        hasUnsupportedPendingImages ||
                                        selectedModelCompatibilityState === 'incompatible'
                                    }>
                                    {hasBlockingPendingImages ? 'Images preparing…' : 'Start Run'}
                                </Button>
                            </div>
                        </div>
                        <div className='flex flex-wrap items-start justify-between gap-2'>
                            <div className='space-y-1'>
                                <p
                                    aria-live='polite'
                                    className={`text-xs ${
                                        selectedModelCompatibilityState === 'incompatible'
                                            ? 'text-destructive'
                                            : 'text-muted-foreground'
                                    }`}>
                                    {composerFooterMessage}
                                </p>
                                <p className='text-muted-foreground text-[11px] leading-5'>
                                    {selectedModelSupportsReasoning
                                        ? !hasAdjustableReasoningEfforts
                                            ? isKiloReasoningModel
                                                ? 'This model supports reasoning, but Kilo does not expose trusted adjustable effort levels.'
                                                : 'This model supports reasoning, but does not expose adjustable effort levels.'
                                            : selectedReasoningEffort === 'none'
                                              ? 'Reasoning is off for the next run.'
                                              : 'Reasoning level applies to the next run.'
                                        : 'This model does not support reasoning.'}
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </form>
            <ImageLightboxModal
                open={lightboxImage !== undefined}
                {...(lightboxImage?.imageUrl ? { imageUrl: lightboxImage.imageUrl } : {})}
                {...(lightboxImage?.title ? { title: lightboxImage.title } : {})}
                {...(lightboxImage?.detail ? { detail: lightboxImage.detail } : {})}
                previewState={lightboxImage ? 'ready' : 'idle'}
                onClose={() => {
                    setLightboxImage(undefined);
                }}
            />
        </>
    );
}
