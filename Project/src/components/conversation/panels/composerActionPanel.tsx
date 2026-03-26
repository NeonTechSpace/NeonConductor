import { ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import {
    useComposerSlashCommands,
    type SlashAcceptResult,
} from '@/web/components/conversation/hooks/useComposerSlashCommands';
import { ContextSummaryCard } from '@/web/components/conversation/panels/composerActionPanel/contextSummaryCard';
import {
    extractClipboardFiles,
    extractDroppedFiles,
    formatCompactionTimestamp,
    formatImageBytes,
    formatTokenCount,
    formatUsagePercent,
    reasoningEffortOptions,
    shouldSubmitComposerOnEnter,
} from '@/web/components/conversation/panels/composerActionPanel/helpers';
import {
    PendingImagesGrid,
    type PendingImageCardView,
} from '@/web/components/conversation/panels/composerActionPanel/pendingImagesGrid';
import { ComposerSlashCommandPopup } from '@/web/components/conversation/panels/composerSlashCommandPopup';
import { shouldInterceptSlashSubmit } from '@/web/components/conversation/panels/composerSlashCommands';
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';
import type { ConversationModeOption } from '@/web/components/conversation/shell/workspace/helpers';
import type { ModelCompatibilityState, ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { Button } from '@/web/components/ui/button';
import { readRelatedTargetNode } from '@/web/lib/dom/readRelatedTargetNode';


import type {
    EntityId,
    ResolvedContextState,
    RulesetDefinition,
    RuntimeReasoningEffort,
    SkillfileDefinition,
    TopLevelTab,
} from '@/shared/contracts';

import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

export { shouldSubmitComposerOnEnter } from '@/web/components/conversation/panels/composerActionPanel/helpers';

type PendingImageView = PendingImageCardView;

function readComposerActionErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Slash command action failed.';
}

export async function handleComposerSlashAcceptance(input: {
    acceptHighlighted: () => Promise<SlashAcceptResult>;
    draftPrompt: string;
    submitWhenUnhandled: boolean;
    onSubmitPrompt: (prompt: string) => void;
    onSetDraftPrompt: (prompt: string) => void;
    onFocusPrompt: () => void;
    onError: (message: string | undefined) => void;
}): Promise<void> {
    input.onError(undefined);

    try {
        const slashResult = await input.acceptHighlighted();
        if (!slashResult.handled) {
            if (input.submitWhenUnhandled) {
                input.onSubmitPrompt(input.draftPrompt);
            }
            return;
        }

        if (slashResult.clearDraft) {
            input.onSetDraftPrompt('');
            input.onFocusPrompt();
            return;
        }
        if (slashResult.nextDraft !== undefined) {
            input.onSetDraftPrompt(slashResult.nextDraft);
            input.onFocusPrompt();
        }
    } catch (error) {
        input.onError(readComposerActionErrorMessage(error));
    }
}

interface ComposerActionPanelProps {
    profileId: string;
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
    selectedSessionId?: EntityId<'sess'>;
    workspaceFingerprint?: string;
    sandboxId?: EntityId<'sb'>;
    attachedRules?: RulesetDefinition[];
    missingAttachedRuleKeys?: string[];
    attachedSkills?: SkillfileDefinition[];
    missingAttachedSkillKeys?: string[];
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
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
        | undefined
    >;
}

function ComposerContextSummarySection(input: {
    contextState: ResolvedContextState;
    selectedProviderStatus?: {
        label: string;
        authState: string;
        authMethod: string;
    };
    canCompactContext: boolean;
    isCompactingContext: boolean;
    onCompactContext?: () => Promise<
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
        | undefined
    >;
}) {
    const [contextFeedback, setContextFeedback] = useState<
        | {
              message: string;
              tone: 'success' | 'error' | 'info';
          }
        | undefined
    >(undefined);
    const thresholdTokens = input.contextState.policy.thresholdTokens;
    const totalTokens = input.contextState.estimate?.totalTokens;
    const usableInputBudgetTokens = input.contextState.policy.usableInputBudgetTokens;
    const hasUsageNumbers = totalTokens !== undefined && usableInputBudgetTokens !== undefined;
    const remainingInputTokens =
        hasUsageNumbers
            ? Math.max(usableInputBudgetTokens - totalTokens, 0)
            : undefined;
    const usagePercent =
        hasUsageNumbers
            ? formatUsagePercent(totalTokens, usableInputBudgetTokens)
            : undefined;
    const countingModeLabel =
        input.contextState.estimate?.mode === 'exact' || input.contextState.countingMode === 'exact'
            ? 'Exact'
            : 'Estimated';
    function handleCompactContext() {
        if (!input.onCompactContext) {
            return;
        }

        setContextFeedback(undefined);
        void input
            .onCompactContext()
            .then((result) => {
                if (!result) {
                    return;
                }

                setContextFeedback(result);
            })
            .catch((error: unknown) => {
                setContextFeedback({
                    tone: 'error',
                    message: error instanceof Error ? error.message : 'Context compaction failed.',
                });
            });
    }

    return (
        <ContextSummaryCard
            hasUsageNumbers={hasUsageNumbers}
            totalTokens={totalTokens}
            usableInputBudgetTokens={usableInputBudgetTokens}
            remainingInputTokens={remainingInputTokens}
            usagePercent={usagePercent}
            countingModeLabel={countingModeLabel}
            missingReason={input.contextState.policy.disabledReason}
            countingMode={input.contextState.countingMode}
            thresholdTokens={thresholdTokens}
            limitsSource={input.contextState.policy.limits.source}
            limitsOverrideReason={input.contextState.policy.limits.overrideReason}
            compactionRecord={input.contextState.compaction}
            contextFeedback={contextFeedback}
            canCompactContext={input.canCompactContext}
            isCompactingContext={input.isCompactingContext}
            onCompactContext={input.onCompactContext ? handleCompactContext : undefined}
            formatTokenCount={formatTokenCount}
            formatCompactionTimestamp={formatCompactionTimestamp}
        />
    );
}

function ComposerActionPanelDraftBoundary({
    profileId,
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
    selectedSessionId,
    workspaceFingerprint,
    sandboxId,
    attachedRules = [],
    missingAttachedRuleKeys = [],
    attachedSkills = [],
    missingAttachedSkillKeys = [],
    canCompactContext = false,
    isCompactingContext = false,
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
    const [slashCommandError, setSlashCommandError] = useState<string | undefined>(undefined);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
    const hasBlockingPendingImages = pendingImages.some((image) => image.status !== 'ready');
    const hasSubmittableContent =
        draftPrompt.trim().length > 0 || pendingImages.some((image) => image.status === 'ready');
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
    const contextFeedbackResetKey = [selectedProviderId ?? '', selectedModelId ?? '', topLevelTab, activeModeKey].join(
        '|'
    );
    const slashCommands = useComposerSlashCommands({
        draftPrompt,
        profileId,
        ...(selectedSessionId ? { selectedSessionId } : {}),
        topLevelTab,
        modeKey: activeModeKey,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        attachedRules,
        missingAttachedRuleKeys,
        attachedSkills,
        missingAttachedSkillKeys,
    });
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
    const composerErrorMessage = slashCommandError ?? runErrorMessage;

    useEffect(() => {
        if (focusComposerRequestKey === undefined) {
            return;
        }

        promptTextareaRef.current?.focus();
    }, [focusComposerRequestKey]);

    function openFilePicker() {
        fileInputRef.current?.click();
    }

    async function handleSlashCommandAccept(submitWhenUnhandled: boolean) {
        await handleComposerSlashAcceptance({
            acceptHighlighted: slashCommands.acceptHighlighted,
            draftPrompt,
            submitWhenUnhandled,
            onSubmitPrompt,
            onSetDraftPrompt: setDraftPrompt,
            onFocusPrompt: () => {
                promptTextareaRef.current?.focus();
            },
            onError: setSlashCommandError,
        });
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
                    void handleSlashCommandAccept(true);
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
                {composerErrorMessage ? (
                    <p aria-live='polite' className='text-destructive text-xs'>
                        {composerErrorMessage}
                    </p>
                ) : null}
                {contextState ? (
                    <ComposerContextSummarySection
                        key={contextFeedbackResetKey}
                        contextState={contextState}
                        canCompactContext={canCompactContext}
                        isCompactingContext={isCompactingContext}
                        {...(selectedProviderStatus ? { selectedProviderStatus } : {})}
                        {...(onCompactContext ? { onCompactContext } : {})}
                    />
                ) : null}
                <div
                    className={`border-border bg-card/30 relative overflow-hidden rounded-2xl border transition ${
                        isDragActive ? 'border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.25)]' : ''
                    }`}>
                    <ComposerSlashCommandPopup state={slashCommands.popupState} />
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
                    <PendingImagesGrid
                        pendingImages={pendingImages}
                        onPreviewImage={(image) => {
                            setLightboxImage(image);
                        }}
                        onRetryPendingImage={onRetryPendingImage}
                        onRemovePendingImage={onRemovePendingImage}
                        formatImageBytes={formatImageBytes}
                    />
                    <textarea
                        ref={promptTextareaRef}
                        aria-label='Prompt'
                        name='composerPrompt'
                        value={draftPrompt}
                        onChange={(event) => {
                            if (runErrorMessage) {
                                onPromptEdited();
                            }
                            if (slashCommandError) {
                                setSlashCommandError(undefined);
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
                            if (slashCommands.hasVisiblePopup) {
                                if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    slashCommands.moveHighlight('next');
                                    return;
                                }
                                if (event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    slashCommands.moveHighlight('previous');
                                    return;
                                }
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    slashCommands.dismiss();
                                    return;
                                }
                            }

                            if (!shouldSubmitComposerOnEnter(event)) {
                                return;
                            }

                            if (shouldInterceptSlashSubmit({ popupState: slashCommands.popupState })) {
                                event.preventDefault();
                                void handleSlashCommandAccept(false);
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

export function ComposerActionPanel(input: ComposerActionPanelProps) {
    return <ComposerActionPanelDraftBoundary key={input.promptResetKey ?? 0} {...input} />;
}
