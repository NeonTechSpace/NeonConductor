import { skipToken } from '@tanstack/react-query';
import { useDeferredValue, useEffect, useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import { buildComposerControlsReadModel } from '@/web/components/conversation/panels/composerActionPanel/buildComposerControlsReadModel';
import { buildComposerSubmissionPolicy } from '@/web/components/conversation/panels/composerActionPanel/buildComposerSubmissionPolicy';
import { ComposerContextSummarySection } from '@/web/components/conversation/panels/composerActionPanel/ComposerContextSummarySection';
import { buildComposerControlSurfaceModel } from '@/web/components/conversation/panels/composerActionPanel/composerControlSurfaceModel';
import { ComposerControlSurfaceStrip } from '@/web/components/conversation/panels/composerActionPanel/ComposerControlSurfaceStrip';
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
import { ImageLightboxModal } from '@/web/components/conversation/panels/imageLightboxModal';
import { isProviderId } from '@/web/components/conversation/shell/workspace/helpers';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RepoMutationIntent, ResearchTargetKind, ResearchTargetRequest } from '@/shared/contracts';

export { shouldSubmitComposerOnEnter } from '@/web/components/conversation/panels/composerActionPanel/helpers';
export { handleComposerSlashAcceptance } from '@/web/components/conversation/panels/composerActionPanel/useComposerSlashCommandController';

interface ResearchTargetDraftState {
    enabled: boolean;
    repoUrl: string;
    targetKind: ResearchTargetKind['kind'];
    targetValue: string;
    mutationIntent: RepoMutationIntent;
}

function buildResearchTarget(draft: ResearchTargetDraftState): ResearchTargetRequest | undefined {
    const repoUrl = draft.repoUrl.trim();
    if (!draft.enabled || repoUrl.length === 0) {
        return undefined;
    }
    const targetValue = draft.targetValue.trim();
    const requestedTarget: ResearchTargetKind | undefined =
        draft.targetKind === 'branch' && targetValue
            ? { kind: 'branch', name: targetValue }
            : draft.targetKind === 'pull_request' && targetValue
              ? { kind: 'pull_request', id: targetValue }
              : draft.targetKind === 'commit' && targetValue
                ? { kind: 'commit', sha: targetValue }
                : draft.targetKind === 'default_branch'
                  ? { kind: 'default_branch' }
                  : undefined;

    return {
        repoUrl,
        ...(requestedTarget ? { requestedTarget } : {}),
        ...(draft.mutationIntent !== 'inspect' ? { mutationIntent: draft.mutationIntent } : {}),
    };
}

function ResearchTargetEditor(input: {
    draft: ResearchTargetDraftState;
    onDraftChange: (draft: ResearchTargetDraftState) => void;
}) {
    return (
        <section className='border-border/60 bg-card/25 rounded-2xl border px-3 py-3'>
            <div className='mb-2 flex items-center justify-between gap-3'>
                <div>
                    <h3 className='text-sm font-semibold'>Research Repository</h3>
                    <p className='text-muted-foreground text-xs'>Resolve an external checkout for agent.research.</p>
                </div>
                <label className='flex items-center gap-2 text-xs'>
                    <input
                        type='checkbox'
                        checked={input.draft.enabled}
                        onChange={(event) => {
                            input.onDraftChange({ ...input.draft, enabled: event.target.checked });
                        }}
                    />
                    Enabled
                </label>
            </div>
            {input.draft.enabled ? (
                <div className='grid gap-2 text-xs sm:grid-cols-[minmax(0,1fr)_140px_160px]'>
                    <label className='space-y-1'>
                        <span className='text-muted-foreground'>Repository URL</span>
                        <input
                            className='border-input bg-background h-9 w-full rounded-md border px-3'
                            value={input.draft.repoUrl}
                            onChange={(event) => {
                                input.onDraftChange({ ...input.draft, repoUrl: event.target.value });
                            }}
                            placeholder='https://github.com/owner/repo'
                        />
                    </label>
                    <label className='space-y-1'>
                        <span className='text-muted-foreground'>Target</span>
                        <select
                            className='border-input bg-background h-9 w-full rounded-md border px-2'
                            value={input.draft.targetKind}
                            onChange={(event) => {
                                input.onDraftChange({
                                    ...input.draft,
                                    targetKind: event.target.value as ResearchTargetKind['kind'],
                                    targetValue: '',
                                });
                            }}>
                            <option value='default_branch'>Default</option>
                            <option value='branch'>Branch</option>
                            <option value='pull_request'>PR</option>
                            <option value='commit'>Commit</option>
                        </select>
                    </label>
                    <label className='space-y-1'>
                        <span className='text-muted-foreground'>Intent</span>
                        <select
                            className='border-input bg-background h-9 w-full rounded-md border px-2'
                            value={input.draft.mutationIntent}
                            onChange={(event) => {
                                input.onDraftChange({
                                    ...input.draft,
                                    mutationIntent: event.target.value as RepoMutationIntent,
                                });
                            }}>
                            <option value='inspect'>Inspect</option>
                            <option value='commit'>Commit</option>
                            <option value='push'>Push</option>
                        </select>
                    </label>
                    {input.draft.targetKind !== 'default_branch' ? (
                        <label className='space-y-1 sm:col-span-3'>
                            <span className='text-muted-foreground'>Target value</span>
                            <input
                                className='border-input bg-background h-9 w-full rounded-md border px-3'
                                value={input.draft.targetValue}
                                onChange={(event) => {
                                    input.onDraftChange({ ...input.draft, targetValue: event.target.value });
                                }}
                                placeholder='main, 123, or commit SHA'
                            />
                        </label>
                    ) : null}
                </div>
            ) : null}
        </section>
    );
}

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
    pendingDocuments,
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
    modelFavorites,
    modelRoleDefaults,
    modelContinuationLockMessage,
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
    pendingPermissionCount = 0,
    planControlSummary,
    inspectorSectionIds = [],
    canCompactContext = false,
    isCompactingContext = false,
    focusComposerRequestKey,
    onDraftPromptSnapshotChange,
    onProfileChange,
    onProviderChange,
    onModelChange,
    onToggleModelFavorite,
    onReasoningEffortChange,
    onModeChange,
    onPromptEdited,
    onAddFiles,
    onRemovePendingImage,
    onRemovePendingTextFile,
    onRemovePendingDocument,
    onRetryPendingImage,
    onQueuePrompt,
    onSubmitPrompt,
    onOpenInspectorSection,
    onOpenBrowserSurface,
    onCompactContext,
}: ComposerActionPanelProps) {
    const draftController = useComposerDraftController({
        ...(focusComposerRequestKey !== undefined ? { focusComposerRequestKey } : {}),
    });
    const [researchTargetDraft, setResearchTargetDraft] = useState<ResearchTargetDraftState>({
        enabled: false,
        repoUrl: '',
        targetKind: 'default_branch',
        targetValue: '',
        mutationIntent: 'inspect',
    });
    const researchTarget = useMemo(() => buildResearchTarget(researchTargetDraft), [researchTargetDraft]);
    const showResearchTargetEditor = topLevelTab === 'agent' && activeModeKey === 'research';
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
    const activeModeLabel = modes.find((mode) => mode.modeKey === activeModeKey)?.label;
    const controlSurfaceModel = buildComposerControlSurfaceModel({
        pendingImages,
        pendingTextFiles,
        pendingDocuments,
        readyComposerAttachments,
        hasBlockingPendingAttachments,
        attachedRules,
        missingAttachedRuleKeys,
        attachedSkills,
        missingAttachedSkillKeys,
        inspectorSectionIds,
        ...(browserContextSummary ? { browserContextSummary } : {}),
        canOpenBrowserSurface: Boolean(onOpenBrowserSurface && selectedSessionId),
        ...(selectedProviderId ? { selectedProviderId } : {}),
        ...(selectedModelId ? { selectedModelId } : {}),
        modelOptions,
        activeModeKey,
        ...(activeModeLabel ? { activeModeLabel } : {}),
        reasoningEffort: controlsReadModel.selectedReasoningEffort,
        pendingPermissionCount,
        ...(planControlSummary ? { planControlSummary } : {}),
        showRunContractPreview,
        canQueuePrompt: Boolean(onQueuePrompt),
        isSubmitting,
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
        ...(onOpenInspectorSection ? { inspectorSectionIds } : {}),
        ...(onOpenInspectorSection ? { onOpenInspectorSection } : {}),
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
        pendingDocuments,
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
        (deferredDraftPrompt.trim().length > 0 ||
            readyComposerAttachments.length > 0 ||
            browserContext !== undefined ||
            researchTarget !== undefined)
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
                  ...(researchTarget ? { researchTarget } : {}),
                  runtimeOptions,
              }
            : skipToken;
    const runContractPreviewQuery = trpc.session.previewRunContract.useQuery(
        runContractPreviewInput,
        PROGRESSIVE_QUERY_OPTIONS
    );
    const runContractPreviewUnavailableMessage = hasBlockingPendingAttachments
        ? undefined
        : runContractPreviewQuery.data && !runContractPreviewQuery.data.available
          ? (runContractPreviewQuery.data.message ?? 'Run contract preview is unavailable for the current draft.')
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
                    <ComposerControlSurfaceStrip
                        model={controlSurfaceModel}
                        onOpenFilePicker={() => {
                            attachmentController.openFilePicker();
                        }}
                        {...(onOpenBrowserSurface ? { onOpenBrowserSurface } : {})}
                        {...(onOpenInspectorSection ? { onOpenInspectorSection } : {})}
                    />
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
                    {showResearchTargetEditor ? (
                        <ResearchTargetEditor draft={researchTargetDraft} onDraftChange={setResearchTargetDraft} />
                    ) : null}
                    {showRunContractPreview ? (
                        <ComposerRunContractPreviewSection
                            profileId={profileId}
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
                        pendingDocuments={pendingDocuments}
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

                            if (
                                shouldInterceptSlashSubmit({
                                    popupState: slashCommandController.slashCommands.popupState,
                                })
                            ) {
                                event.preventDefault();
                                void slashCommandController.handleSlashCommandAccept(false);
                                return;
                            }

                            if (!submissionPolicy.canSubmit) {
                                return;
                            }

                            event.preventDefault();
                            onSubmitPrompt(draftController.draftPrompt, browserContext, researchTarget);
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
                        onRemovePendingDocument={onRemovePendingDocument}
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
                        routingBadge={routingBadge}
                        compactConnectionLabel={controlsReadModel.compactConnectionLabel}
                        modelOptions={modelOptions}
                        {...(modelFavorites ? { modelFavorites } : {})}
                        {...(modelRoleDefaults ? { modelRoleDefaults } : {})}
                        {...(modelContinuationLockMessage ? { modelContinuationLockMessage } : {})}
                        submitButtonLabel={
                            hasBlockingPendingAttachments || submissionPolicy.hasBlockingPendingImages
                                ? 'Files preparing...'
                                : 'Start Run'
                        }
                        queueButtonLabel='Queue'
                        onProfileChange={onProfileChange}
                        onProviderChange={onProviderChange}
                        onModelChange={onModelChange}
                        {...(onToggleModelFavorite ? { onToggleModelFavorite } : {})}
                        onReasoningEffortChange={onReasoningEffortChange}
                        onModeChange={onModeChange}
                        {...(onQueuePrompt
                            ? {
                                  onQueuePrompt: () => {
                                      onQueuePrompt(draftController.draftPrompt, browserContext, researchTarget);
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
