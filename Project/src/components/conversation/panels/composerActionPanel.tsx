import { ImagePlus, LoaderCircle, RefreshCw, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { getImagePreviewStatusLabel, getPendingImagePreviewState } from '@/web/components/conversation/messages/imagePreviewState';
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';
import { Button } from '@/web/components/ui/button';
import { readRelatedTargetNode } from '@/web/lib/dom/readRelatedTargetNode';

import type { ResolvedContextState } from '@/app/backend/runtime/contracts';

interface ProviderOption {
    id: string;
    label: string;
    authState: string;
}

interface ModelOption {
    id: string;
    label: string;
    price?: number;
    latency?: number;
    tps?: number;
}

interface PendingImageView {
    clientId: string;
    fileName: string;
    previewUrl: string;
    status: 'compressing' | 'ready' | 'failed';
    errorMessage?: string;
    byteSize?: number;
    attachment?: {
        mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
        width: number;
        height: number;
    };
}

interface ComposerActionPanelProps {
    prompt: string;
    pendingImages: PendingImageView[];
    disabled: boolean;
    isSubmitting: boolean;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    canAttachImages: boolean;
    imageAttachmentBlockedReason?: string;
    routingBadge?: string;
    providerOptions: ProviderOption[];
    modelOptions: ModelOption[];
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    contextFeedbackMessage?: string;
    contextFeedbackTone?: 'success' | 'error' | 'info';
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onPromptChange: (nextPrompt: string) => void;
    onAddImageFiles: (files: FileList | File[]) => void;
    onRemovePendingImage: (clientId: string) => void;
    onRetryPendingImage: (clientId: string) => void;
    onSubmitPrompt: () => void;
    onCompactContext?: () => void;
}

function formatTokenCount(value: number): string {
    return new Intl.NumberFormat('en-US').format(value);
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

export function ComposerActionPanel({
    prompt,
    pendingImages,
    disabled,
    isSubmitting,
    selectedProviderId,
    selectedModelId,
    canAttachImages,
    imageAttachmentBlockedReason,
    routingBadge,
    providerOptions,
    modelOptions,
    runErrorMessage,
    contextState,
    contextFeedbackMessage,
    contextFeedbackTone = 'info',
    canCompactContext = false,
    isCompactingContext = false,
    onProviderChange,
    onModelChange,
    onPromptChange,
    onAddImageFiles,
    onRemovePendingImage,
    onRetryPendingImage,
    onSubmitPrompt,
    onCompactContext,
}: ComposerActionPanelProps) {
    const [isDragActive, setIsDragActive] = useState(false);
    const [lightboxImage, setLightboxImage] = useState<
        | {
              imageUrl: string;
              title: string;
              detail?: string;
          }
        | undefined
    >(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const thresholdTokens = contextState?.policy.thresholdTokens;
    const totalTokens = contextState?.estimate?.totalTokens;
    const hasUsageNumbers = totalTokens !== undefined && thresholdTokens !== undefined;
    const compactionRecord = contextState?.compaction;
    const hasBlockingPendingImages = pendingImages.some((image) => image.status !== 'ready');
    const hasSubmittableContent = prompt.trim().length > 0 || pendingImages.some((image) => image.status === 'ready');
    const hasUnsupportedPendingImages = pendingImages.length > 0 && !canAttachImages;
    const attachmentStatusMessage = hasUnsupportedPendingImages
        ? imageAttachmentBlockedReason ?? 'Select a vision-capable model to send attached images.'
        : hasBlockingPendingImages
          ? 'Sending is locked until every image finishes processing.'
          : pendingImages.length > 0
            ? 'Images are ready to send with this message.'
            : 'Text-only prompt.';

    function openFilePicker() {
        fileInputRef.current?.click();
    }

    return (
        <>
            <form
                className='border-border mt-3 space-y-2 border-t pt-3'
                onDragOver={(event) => {
                    event.preventDefault();
                    if (!canAttachImages || disabled) {
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
                    if (!canAttachImages || disabled) {
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
                    onSubmitPrompt();
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
                <div className='grid grid-cols-2 gap-2'>
                    <label className='sr-only' htmlFor='composer-provider-select'>
                        Provider
                    </label>
                    <select
                        id='composer-provider-select'
                        name='composerProvider'
                        value={selectedProviderId ?? ''}
                        onChange={(event) => {
                            onProviderChange(event.target.value);
                        }}
                        className='border-border bg-background h-9 rounded-md border px-2 text-xs'
                        disabled={disabled || providerOptions.length === 0}>
                        <option value='' disabled>
                            Select provider
                        </option>
                        {providerOptions.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label} ({provider.authState})
                            </option>
                        ))}
                    </select>
                    <label className='sr-only' htmlFor='composer-model-select'>
                        Model
                    </label>
                    <select
                        id='composer-model-select'
                        name='composerModel'
                        value={selectedModelId ?? ''}
                        onChange={(event) => {
                            onModelChange(event.target.value);
                        }}
                        className='border-border bg-background h-9 rounded-md border px-2 text-xs'
                        disabled={disabled || modelOptions.length === 0}>
                        <option value='' disabled>
                            Select model
                        </option>
                        {modelOptions.map((model) => (
                            <option key={model.id} value={model.id}>
                                {model.label}
                            </option>
                        ))}
                    </select>
                </div>
                {routingBadge ? <p className='text-muted-foreground text-xs'>{routingBadge}</p> : null}
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
                                    <p className='text-muted-foreground text-xs'>
                                        {formatTokenCount(totalTokens)} / {formatTokenCount(thresholdTokens)} token
                                        threshold · {contextState.estimate?.mode === 'exact' ? 'Exact' : 'Estimated'}
                                    </p>
                                ) : contextState.policy.disabledReason === 'missing_model_limits' ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Token-aware compaction is unavailable because this model has no known context
                                        limit.
                                    </p>
                                ) : contextState.policy.disabledReason === 'feature_disabled' ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Global context management is disabled for this profile.
                                    </p>
                                ) : contextState.policy.disabledReason === 'multimodal_counting_unavailable' ? (
                                    <p className='text-muted-foreground text-xs'>
                                        Token-aware compaction is paused for image sessions because multimodal token
                                        counting is not implemented yet.
                                    </p>
                                ) : (
                                    <p className='text-muted-foreground text-xs'>
                                        Context policy is active with {contextState.countingMode} counting for this
                                        model.
                                    </p>
                                )}
                            </div>
                            {onCompactContext ? (
                                <Button
                                    type='button'
                                    size='sm'
                                    variant='outline'
                                    disabled={!canCompactContext || isCompactingContext}
                                    onClick={onCompactContext}>
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
                        <p className='text-muted-foreground text-[11px]'>
                            Limit source: {contextState.policy.limits.source}
                            {contextState.policy.limits.overrideReason
                                ? ` · Override: ${contextState.policy.limits.overrideReason}`
                                : ''}
                        </p>
                        {contextFeedbackMessage ? (
                            <p
                                className={`text-xs ${
                                    contextFeedbackTone === 'error'
                                        ? 'text-destructive'
                                        : contextFeedbackTone === 'success'
                                          ? 'text-primary'
                                          : 'text-muted-foreground'
                                }`}>
                                {contextFeedbackMessage}
                            </p>
                        ) : null}
                    </div>
                ) : null}
                <div
                    className={`border-border bg-card/30 relative overflow-hidden rounded-2xl border transition ${
                        isDragActive ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]' : ''
                    }`}>
                    <div className='border-border flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2'>
                        <div>
                            <p className='text-sm font-semibold'>Prompt</p>
                            <p className='text-muted-foreground text-xs'>
                                Paste or drop images here. Up to 4 images, 1.5 MB each after compression.
                            </p>
                        </div>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={disabled || !canAttachImages}
                            onClick={openFilePicker}>
                            <ImagePlus className='h-4 w-4' />
                            Add images
                        </Button>
                    </div>
                    {imageAttachmentBlockedReason && !canAttachImages ? (
                        <p className='text-muted-foreground border-border border-b px-3 py-2 text-xs'>
                            {imageAttachmentBlockedReason}
                        </p>
                    ) : null}
                    {pendingImages.length > 0 ? (
                        <div className='border-border grid gap-2 border-b px-3 py-3 sm:grid-cols-2 xl:grid-cols-4'>
                            {pendingImages.map((image) => {
                                const previewState = getPendingImagePreviewState(image.status);

                                return (
                                    <div key={image.clientId} className='border-border bg-background/80 rounded-2xl border p-2'>
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
                                                    {previewState === 'loading'
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
                        aria-label='Prompt'
                        name='composerPrompt'
                        value={prompt}
                        onChange={(event) => {
                            onPromptChange(event.target.value);
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
                        rows={4}
                        className='border-border bg-background/70 focus-visible:ring-ring focus-visible:border-ring min-h-[112px] w-full resize-y border-t px-3 py-3 text-sm focus-visible:ring-2 focus-visible:outline-none'
                        autoComplete='off'
                        spellCheck
                        placeholder='Prompt for the selected session…'
                    />
                    {isDragActive ? (
                        <div className='bg-primary/10 text-primary pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold backdrop-blur-sm'>
                            Drop images to attach them
                        </div>
                    ) : null}
                </div>
                <div className='flex items-center justify-between gap-2'>
                    <p aria-live='polite' className='text-muted-foreground text-xs'>
                        {attachmentStatusMessage}
                    </p>
                    <Button
                        type='submit'
                        size='sm'
                        disabled={
                            disabled ||
                            isSubmitting ||
                            !hasSubmittableContent ||
                            hasBlockingPendingImages ||
                            hasUnsupportedPendingImages
                        }>
                        {hasBlockingPendingImages ? 'Images preparing…' : 'Start Run'}
                    </Button>
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
