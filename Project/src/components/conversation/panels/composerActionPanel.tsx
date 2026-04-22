import { buildComposerControlsReadModel } from '@/web/components/conversation/panels/composerActionPanel/buildComposerControlsReadModel';
import { buildComposerSubmissionPolicy } from '@/web/components/conversation/panels/composerActionPanel/buildComposerSubmissionPolicy';
import { ComposerContextSummarySection } from '@/web/components/conversation/panels/composerActionPanel/ComposerContextSummarySection';
import { ComposerPromptCard } from '@/web/components/conversation/panels/composerActionPanel/ComposerPromptCard';
import { ComposerRunContractPreviewSection } from '@/web/components/conversation/panels/composerActionPanel/ComposerRunContractPreviewSection';
import { ComposerRunControlsBar } from '@/web/components/conversation/panels/composerActionPanel/ComposerRunControlsBar';
import { ComposerStatusFooter } from '@/web/components/conversation/panels/composerActionPanel/ComposerStatusFooter';
import {
    formatAttachmentBytes,
    formatImageBytes,
    shouldSubmitComposerOnEnter,
} from '@/web/components/conversation/panels/composerActionPanel/helpers';
import type { ComposerActionPanelProps } from '@/web/components/conversation/panels/composerActionPanel/types';
import { useComposerAttachmentController } from '@/web/components/conversation/panels/composerActionPanel/useComposerAttachmentController';
import { useComposerContextCardController } from '@/web/components/conversation/panels/composerActionPanel/useComposerContextCardController';
import { useComposerDraftController } from '@/web/components/conversation/panels/composerActionPanel/useComposerDraftController';
import { useComposerSlashCommandController } from '@/web/components/conversation/panels/composerActionPanel/useComposerSlashCommandController';
import { shouldInterceptSlashSubmit } from '@/web/components/conversation/panels/composerSlashCommands';
import { isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import { skipToken } from '@tanstack/react-query';
import { useDeferredValue, useEffect, type KeyboardEvent as ReactKeyboardEvent } from 'react';

export { shouldSubmitComposerOnEnter } from '@/web/components/conversation/panels/composerActionPanel/helpers';
export { handleComposerSlashAcceptance } from '@/web/components/conversation/panels/composerActionPanel/useComposerSlashCommandController';

function readReasoningExplanationMessage(input: {
    selectedProviderId: string | undefined;
    selectedModelSupportsReasoning: boolean;
    hasAdjustableReasoningEfforts: boolean;
    selectedReasoningEffort: string;
}): string {
    const isKiloReasoningModel = input.selectedProviderId === 'kilo' && input.selectedModelSupportsReasoning;
    if (!input.selectedModelSupportsReasoning) {
        return 'This model does not support reasoning.';
    }

    if (!input.hasAdjustableReasoningEfforts) {
        return isKiloReasoningModel
            ? 'This model supports reasoning, but Kilo does not expose trusted adjustable effort levels.'
            : 'This model supports reasoning, but does not expose adjustable effort levels.';
    }

    return input.selectedReasoningEffort === 'none'
        ? 'Reasoning is off for the next run.'
        : 'Reasoning level applies to the next run.';
}

function ComposerActionPanelDraftBoundary({
    profileId,
    pendingImages,
    pendingTextFiles,
    readyComposerAttachments,
    hasBlockingPendingAttachments,
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
    browserContext,
    browserContextSummary,
    selectedSessionId,
    workspaceFingerprint,
    sandboxId,
    runtimeOptions,
    showRunContractPreview = true,
    attachedRules = [],
    missingAttachedRuleKeys = [],
    attachedSkills = [],
    missingAttachedSkillKeys = [],
    canCompactContext = false,
    isCompactingContext = false,
    focusComposerRequestKey,
    onDraftPromptSnapshotChange,
    onProfileChange,
    onProviderChange,
    onModelChange,
    onReasoningEffortChange,
    onModeChange,
    onPromptEdited,
    onAddFiles,
    onRemovePendingImage,
    onRemovePendingTextFile,
    onRetryPendingImage,
    onQueuePrompt,
    onSubmitPrompt,
    onCompactContext,
}: ComposerActionPanelProps) {
    const draftController = useComposerDraftController({
        ...(focusComposerRequestKey !== undefined ? { focusComposerRequestKey } : {}),
    });
    useEffect(() => {
        onDraftPromptSnapshotChange?.(draftController.draftPrompt);
    }, [draftController.draftPrompt, onDraftPromptSnapshotChange]);
    const controlsReadModel = buildComposerControlsReadModel({
        disabled,
        topLevelTab,
        selectedProviderId,
        selectedModelSupportsReasoning,
        reasoningEffort,
        ...(controlsDisabled !== undefined ? { controlsDisabled } : {}),
        ...(submitDisabled !== undefined ? { submitDisabled } : {}),
        ...(supportedReasoningEfforts !== undefined ? { supportedReasoningEfforts } : {}),
        ...(selectedProviderStatus ? { selectedProviderStatus } : {}),
    });
    const attachmentController = useComposerAttachmentController({
        canAttachFiles: true,
        controlsDisabled: controlsReadModel.composerControlsDisabled,
        onAddFiles,
    });
    const slashCommandController = useComposerSlashCommandController({
        profileId,
        draftPrompt: draftController.draftPrompt,
        topLevelTab,
        activeModeKey,
        onSubmitPrompt,
        onSetDraftPrompt: (nextDraftPrompt) => {
            draftController.setDraftPrompt(nextDraftPrompt);
        },
        onFocusPrompt: () => {
            draftController.focusPrompt();
        },
        ...(selectedSessionId ? { selectedSessionId } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        attachedRules,
        missingAttachedRuleKeys,
        attachedSkills,
        missingAttachedSkillKeys,
    });
    const contextCardController = useComposerContextCardController({
        selectedProviderId,
        selectedModelId,
        topLevelTab,
        activeModeKey,
        onCompactContext,
    });
    const submissionPolicy = buildComposerSubmissionPolicy({
        pendingImages,
        pendingTextFiles,
        canAttachImages,
        runErrorMessage,
        maxImageAttachmentsPerMessage,
        draftPrompt: draftController.draftPrompt,
        composerSubmitDisabled: controlsReadModel.composerSubmitDisabled,
        isSubmitting,
        ...(imageAttachmentBlockedReason !== undefined ? { imageAttachmentBlockedReason } : {}),
        ...(selectedModelCompatibilityState !== undefined ? { selectedModelCompatibilityState } : {}),
        ...(selectedModelCompatibilityReason !== undefined ? { selectedModelCompatibilityReason } : {}),
        ...(slashCommandController.slashCommandError !== undefined
            ? { slashCommandError: slashCommandController.slashCommandError }
            : {}),
    });
    const reasoningExplanationMessage = readReasoningExplanationMessage({
        selectedProviderId,
        selectedModelSupportsReasoning,
        hasAdjustableReasoningEfforts: controlsReadModel.hasAdjustableReasoningEfforts,
        selectedReasoningEffort: controlsReadModel.selectedReasoningEffort,
    });
    const composerErrorTone = selectedModelCompatibilityState === 'incompatible' ? 'destructive' : 'muted';
    const composerSubmitDisabled =
        controlsReadModel.composerSubmitDisabled || isSubmitting || !submissionPolicy.canSubmit;
    const deferredDraftPrompt = useDeferredValue(draftController.draftPrompt);
    const validatedSelectedProviderId =
        selectedProviderId && isProviderId(selectedProviderId) ? selectedProviderId : undefined;
    const runContractPreviewInput =
        showRunContractPreview &&
        selectedSessionId &&
        validatedSelectedProviderId &&
        selectedModelId &&
        !hasBlockingPendingAttachments &&
        (deferredDraftPrompt.trim().length > 0 || readyComposerAttachments.length > 0 || browserContext !== undefined)
            ? {
                  profileId,
                  sessionId: selectedSessionId,
                  prompt: deferredDraftPrompt.trim(),
                  attachments: readyComposerAttachments,
                  ...(browserContext ? { browserContext } : {}),
                  providerId: validatedSelectedProviderId,
                  modelId: selectedModelId,
                  topLevelTab,
                  modeKey: activeModeKey,
                  ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
                  ...(sandboxId ? { sandboxId } : {}),
                  runtimeOptions,
              }
            : skipToken;
    const runContractPreviewQuery = trpc.session.previewRunContract.useQuery(
        runContractPreviewInput,
        PROGRESSIVE_QUERY_OPTIONS
    );
    const runContractPreviewUnavailableMessage =
        hasBlockingPendingAttachments
            ? undefined
            : runContractPreviewQuery.data && !runContractPreviewQuery.data.available
              ? runContractPreviewQuery.data.message ?? 'Run contract preview is unavailable for the current draft.'
              : !selectedSessionId
                ? 'Select a session to inspect the run contract for the current draft.'
                : undefined;

    function handlePromptEdited() {
        if (slashCommandController.slashCommandError) {
            slashCommandController.clearSlashCommandError();
        }
        onPromptEdited();
    }

    return (
        <>
            <form
                className='border-border/70 bg-background/92 rounded-[30px] border shadow-[0_18px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm'
                onSubmit={(event) => {
                    event.preventDefault();
                    void slashCommandController.handleSlashCommandAccept(true);
                }}>
                <div className='space-y-3 px-4 py-4'>
                    {contextState ? (
                        <ComposerContextSummarySection
                            contextState={contextState}
                            contextFeedback={contextCardController.contextFeedback}
                            canCompactContext={canCompactContext}
                            isCompactingContext={isCompactingContext}
                            onCompactContext={() => {
                                void contextCardController.handleCompactContext();
                            }}
                        />
                    ) : null}
                    {showRunContractPreview ? (
                        <ComposerRunContractPreviewSection
                            isLoading={runContractPreviewQuery.isFetching}
                            waitingForAttachments={hasBlockingPendingAttachments}
                            {...(runContractPreviewQuery.data?.available
                                ? { preview: runContractPreviewQuery.data.preview }
                                : {})}
                            {...(browserContextSummary ? { browserContextSummary } : {})}
                            {...(runContractPreviewUnavailableMessage
                                ? { unavailableMessage: runContractPreviewUnavailableMessage }
                                : {})}
                        />
                    ) : null}
                    <ComposerPromptCard
                        isDragActive={attachmentController.isDragActive}
                        canAttachImages={canAttachImages}
                        imageAttachmentBlockedReason={imageAttachmentBlockedReason}
                        pendingImages={pendingImages}
                        pendingTextFiles={pendingTextFiles}
                        composerErrorMessage={submissionPolicy.composerErrorMessage}
                        composerErrorTone={composerErrorTone}
                        draftPrompt={draftController.draftPrompt}
                        promptTextareaRef={draftController.promptTextareaRef}
                        fileInputRef={attachmentController.fileInputRef}
                        slashPopupState={slashCommandController.slashCommands.popupState}
                        onPromptChange={draftController.setDraftPrompt}
                        onPromptEdited={handlePromptEdited}
                        onPromptPaste={(event) => {
                            attachmentController.handlePaste(event);
                        }}
                        onPromptKeyDown={(event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
                            if (slashCommandController.slashCommands.hasVisiblePopup) {
                                if (event.key === 'ArrowDown') {
                                    event.preventDefault();
                                    slashCommandController.slashCommands.moveHighlight('next');
                                    return;
                                }
                                if (event.key === 'ArrowUp') {
                                    event.preventDefault();
                                    slashCommandController.slashCommands.moveHighlight('previous');
                                    return;
                                }
                                if (event.key === 'Escape') {
                                    event.preventDefault();
                                    slashCommandController.slashCommands.dismiss();
                                    return;
                                }
                            }

                            if (!shouldSubmitComposerOnEnter(event)) {
                                return;
                            }

                            if (shouldInterceptSlashSubmit({ popupState: slashCommandController.slashCommands.popupState })) {
                                event.preventDefault();
                                void slashCommandController.handleSlashCommandAccept(false);
                                return;
                            }

                            if (!submissionPolicy.canSubmit) {
                                return;
                            }

                            event.preventDefault();
                            onSubmitPrompt(draftController.draftPrompt, browserContext);
                        }}
                        onDragOver={(event) => {
                            attachmentController.handleDragOver(event);
                        }}
                        onDragLeave={(event) => {
                            attachmentController.handleDragLeave(event);
                        }}
                        onDrop={(event) => {
                            attachmentController.handleDrop(event);
                        }}
                        onFileInputChange={(event) => {
                            attachmentController.handleFileInputChange(event);
                        }}
                        onPreviewImage={(image) => {
                            attachmentController.previewImage(image);
                        }}
                        onRetryPendingImage={onRetryPendingImage}
                        onRemovePendingImage={onRemovePendingImage}
                        formatImageBytes={formatImageBytes}
                        formatAttachmentBytes={formatAttachmentBytes}
                        onRemovePendingTextFile={onRemovePendingTextFile}
                    />
                    <ComposerRunControlsBar
                        composerControlsDisabled={controlsReadModel.composerControlsDisabled}
                        composerSubmitDisabled={composerSubmitDisabled}
                        isSubmitting={isSubmitting}
                        profiles={profiles}
                        selectedProfileId={selectedProfileId}
                        selectedProviderId={selectedProviderId}
                        selectedModelId={selectedModelId}
                        shouldShowModePicker={controlsReadModel.shouldShowModePicker}
                        activeModeKey={activeModeKey}
                        modes={modes}
                        selectedReasoningEffort={controlsReadModel.selectedReasoningEffort}
                        availableReasoningEfforts={controlsReadModel.availableReasoningEfforts}
                        reasoningControlDisabled={controlsReadModel.reasoningControlDisabled}
                        canAttachImages={canAttachImages}
                        routingBadge={routingBadge}
                        compactConnectionLabel={controlsReadModel.compactConnectionLabel}
                        modelOptions={modelOptions}
                        submitButtonLabel={submissionPolicy.hasBlockingPendingImages ? 'Images preparing…' : 'Start Run'}
                        queueButtonLabel='Queue'
                        onProfileChange={onProfileChange}
                        onProviderChange={onProviderChange}
                        onModelChange={onModelChange}
                        onReasoningEffortChange={onReasoningEffortChange}
                        onModeChange={onModeChange}
                        {...(onQueuePrompt
                            ? {
                                  onQueuePrompt: () => {
                                      onQueuePrompt(draftController.draftPrompt, browserContext);
                                  },
                              }
                            : {})}
                        onOpenFilePicker={() => {
                            attachmentController.openFilePicker();
                        }}
                    />
                    <ComposerStatusFooter
                        composerFooterMessage={submissionPolicy.composerFooterMessage}
                        reasoningExplanationMessage={reasoningExplanationMessage}
                        selectedModelCompatibilityState={selectedModelCompatibilityState}
                    />
                </div>
            </form>
            <ImageLightboxModal
                open={attachmentController.lightboxImage !== undefined}
                {...(attachmentController.lightboxImage?.imageUrl
                    ? { imageUrl: attachmentController.lightboxImage.imageUrl }
                    : {})}
                {...(attachmentController.lightboxImage?.title
                    ? { title: attachmentController.lightboxImage.title }
                    : {})}
                {...(attachmentController.lightboxImage?.detail
                    ? { detail: attachmentController.lightboxImage.detail }
                    : {})}
                previewState={attachmentController.lightboxImage ? 'ready' : 'idle'}
                onClose={() => {
                    attachmentController.closeLightbox();
                }}
            />
        </>
    );
}

export function ComposerActionPanel(input: ComposerActionPanelProps) {
    return <ComposerActionPanelDraftBoundary key={input.promptResetKey ?? 0} {...input} />;
}
