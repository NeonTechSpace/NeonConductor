import { ComposerActionPanel } from '@/web/components/conversation/panels/composerActionPanel';
import { MessageFlowPanel } from '@/web/components/conversation/panels/messageFlowPanel';

import type { SessionWorkspacePanelProps } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';

interface WorkspacePrimaryColumnProps {
    profileId: SessionWorkspacePanelProps['profileId'];
    messages: SessionWorkspacePanelProps['messages'];
    partsByMessageId: SessionWorkspacePanelProps['partsByMessageId'];
    runs: SessionWorkspacePanelProps['runs'];
    pendingImages: SessionWorkspacePanelProps['pendingImages'];
    isStartingRun: SessionWorkspacePanelProps['isStartingRun'];
    selectedSessionId: SessionWorkspacePanelProps['selectedSessionId'];
    selectedProviderId: SessionWorkspacePanelProps['selectedProviderId'];
    selectedModelId: SessionWorkspacePanelProps['selectedModelId'];
    topLevelTab: SessionWorkspacePanelProps['topLevelTab'];
    activeModeKey: SessionWorkspacePanelProps['activeModeKey'];
    modes: SessionWorkspacePanelProps['modes'];
    reasoningEffort: SessionWorkspacePanelProps['reasoningEffort'];
    selectedModelSupportsReasoning: SessionWorkspacePanelProps['selectedModelSupportsReasoning'];
    supportedReasoningEfforts: SessionWorkspacePanelProps['supportedReasoningEfforts'];
    maxImageAttachmentsPerMessage: SessionWorkspacePanelProps['maxImageAttachmentsPerMessage'];
    canAttachImages: SessionWorkspacePanelProps['canAttachImages'];
    imageAttachmentBlockedReason: SessionWorkspacePanelProps['imageAttachmentBlockedReason'];
    routingBadge: SessionWorkspacePanelProps['routingBadge'];
    selectedModelCompatibilityState: SessionWorkspacePanelProps['selectedModelCompatibilityState'];
    selectedModelCompatibilityReason: SessionWorkspacePanelProps['selectedModelCompatibilityReason'];
    selectedProviderStatus: SessionWorkspacePanelProps['selectedProviderStatus'];
    modelOptions: SessionWorkspacePanelProps['modelOptions'];
    runErrorMessage: SessionWorkspacePanelProps['runErrorMessage'];
    contextState: SessionWorkspacePanelProps['contextState'];
    canCompactContext: SessionWorkspacePanelProps['canCompactContext'];
    isCompactingContext: SessionWorkspacePanelProps['isCompactingContext'];
    modePanel: SessionWorkspacePanelProps['modePanel'];
    promptResetKey: SessionWorkspacePanelProps['promptResetKey'];
    focusComposerRequestKey: SessionWorkspacePanelProps['focusComposerRequestKey'];
    onProviderChange: SessionWorkspacePanelProps['onProviderChange'];
    onModelChange: SessionWorkspacePanelProps['onModelChange'];
    onReasoningEffortChange: SessionWorkspacePanelProps['onReasoningEffortChange'];
    onModeChange: SessionWorkspacePanelProps['onModeChange'];
    onPromptEdited: SessionWorkspacePanelProps['onPromptEdited'];
    onAddImageFiles: SessionWorkspacePanelProps['onAddImageFiles'];
    onRemovePendingImage: SessionWorkspacePanelProps['onRemovePendingImage'];
    onRetryPendingImage: SessionWorkspacePanelProps['onRetryPendingImage'];
    onSubmitPrompt: SessionWorkspacePanelProps['onSubmitPrompt'];
    onCompactContext: SessionWorkspacePanelProps['onCompactContext'];
    onEditMessage: SessionWorkspacePanelProps['onEditMessage'];
    onBranchFromMessage: SessionWorkspacePanelProps['onBranchFromMessage'];
}

export function WorkspacePrimaryColumn({
    profileId,
    messages,
    partsByMessageId,
    runs,
    pendingImages,
    isStartingRun,
    selectedSessionId,
    selectedProviderId,
    selectedModelId,
    topLevelTab,
    activeModeKey,
    modes,
    reasoningEffort,
    selectedModelSupportsReasoning,
    supportedReasoningEfforts,
    maxImageAttachmentsPerMessage,
    canAttachImages,
    imageAttachmentBlockedReason,
    routingBadge,
    selectedModelCompatibilityState,
    selectedModelCompatibilityReason,
    selectedProviderStatus,
    modelOptions,
    runErrorMessage,
    contextState,
    canCompactContext,
    isCompactingContext,
    modePanel,
    promptResetKey,
    focusComposerRequestKey,
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
    onEditMessage,
    onBranchFromMessage,
}: WorkspacePrimaryColumnProps) {
    return (
        <div className='flex min-h-0 min-w-0 flex-col overflow-hidden'>
            <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4'>
                {modePanel ? <div className='border-border/70 bg-card/35 shrink-0 rounded-[28px] border p-4'>{modePanel}</div> : null}

                <div className='border-border/70 bg-card/20 flex min-h-[320px] min-w-0 flex-1 flex-col overflow-hidden rounded-[32px] border px-3 py-5 md:px-5'>
                    <MessageFlowPanel
                        profileId={profileId}
                        messages={messages}
                        partsByMessageId={partsByMessageId}
                        runs={runs}
                        {...(onEditMessage ? { onEditMessage } : {})}
                        {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                    />
                </div>

                <div className='border-border/70 bg-background/85 shrink-0 rounded-[28px] border p-4 shadow-sm'>
                    <ComposerActionPanel
                        pendingImages={pendingImages}
                        disabled={!selectedSessionId}
                        isSubmitting={isStartingRun}
                        selectedProviderId={selectedProviderId}
                        selectedModelId={selectedModelId}
                        topLevelTab={topLevelTab}
                        activeModeKey={activeModeKey}
                        modes={modes}
                        reasoningEffort={reasoningEffort}
                        selectedModelSupportsReasoning={selectedModelSupportsReasoning}
                        {...(supportedReasoningEfforts ? { supportedReasoningEfforts } : {})}
                        maxImageAttachmentsPerMessage={maxImageAttachmentsPerMessage}
                        canAttachImages={canAttachImages}
                        {...(imageAttachmentBlockedReason ? { imageAttachmentBlockedReason } : {})}
                        {...(routingBadge !== undefined ? { routingBadge } : {})}
                        {...(selectedModelCompatibilityState ? { selectedModelCompatibilityState } : {})}
                        {...(selectedModelCompatibilityReason ? { selectedModelCompatibilityReason } : {})}
                        {...(selectedProviderStatus ? { selectedProviderStatus } : {})}
                        modelOptions={modelOptions}
                        runErrorMessage={runErrorMessage}
                        {...(contextState ? { contextState } : {})}
                        {...(canCompactContext !== undefined ? { canCompactContext } : {})}
                        {...(isCompactingContext !== undefined ? { isCompactingContext } : {})}
                        {...(promptResetKey !== undefined ? { promptResetKey } : {})}
                        {...(focusComposerRequestKey !== undefined ? { focusComposerRequestKey } : {})}
                        onProviderChange={onProviderChange}
                        onModelChange={onModelChange}
                        onReasoningEffortChange={onReasoningEffortChange}
                        onModeChange={onModeChange}
                        onPromptEdited={onPromptEdited}
                        onAddImageFiles={onAddImageFiles}
                        onRemovePendingImage={onRemovePendingImage}
                        onRetryPendingImage={onRetryPendingImage}
                        onSubmitPrompt={onSubmitPrompt}
                        {...(onCompactContext ? { onCompactContext } : {})}
                    />
                </div>
            </div>
        </div>
    );
}
