import {
    buildWorkspaceShellProjection,
    type SessionWorkspacePanelProps,
} from '@/web/components/conversation/sessions/workspace/workspacePanelModel';
import { WorkspacePrimaryColumn } from '@/web/components/conversation/sessions/workspace/workspacePrimaryColumn';
import { WorkspaceSelectionHeader } from '@/web/components/conversation/sessions/workspace/workspaceSelectionHeader';
import { WorkspaceShell } from '@/web/components/conversation/sessions/workspace/workspaceShell';
import { useEffect, useState } from 'react';

export type { SessionWorkspacePanelProps } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';

export function SessionWorkspacePanel(input: SessionWorkspacePanelProps) {
    const [selectedOutboxEntryId, setSelectedOutboxEntryId] = useState(input.outboxEntries?.[0]?.id);

    useEffect(() => {
        if (!input.outboxEntries || input.outboxEntries.length === 0) {
            setSelectedOutboxEntryId(undefined);
            return;
        }
        if (selectedOutboxEntryId && input.outboxEntries.some((entry) => entry.id === selectedOutboxEntryId)) {
            return;
        }
        setSelectedOutboxEntryId(input.outboxEntries[0]?.id);
    }, [input.outboxEntries, selectedOutboxEntryId]);

    const selectedOutboxEntry = input.outboxEntries?.find((entry) => entry.id === selectedOutboxEntryId);
    const workspaceShell =
        input.workspaceShell ??
        buildWorkspaceShellProjection({
            ...input,
            ...(selectedOutboxEntry ? { selectedOutboxEntry } : {}),
        });
    const {
        profileId,
        profiles,
        selectedProfileId,
        selectedWorkspaceFingerprint,
        selectedSandboxId,
        messages,
        partsByMessageId,
        runs,
        selectedSessionId,
        optimisticUserMessage,
        pendingImages,
        pendingTextFiles,
        readyComposerAttachments,
        hasBlockingPendingAttachments,
        isStartingRun,
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
        outboxEntries,
        showRunContractPreview,
        attachedRules,
        missingAttachedRuleKeys,
        attachedSkills,
        missingAttachedSkillKeys,
        runtimeOptions,
        canCompactContext,
        isCompactingContext,
        promptResetKey,
        focusComposerRequestKey,
        controlsDisabled,
        submitDisabled,
        onSelectSession,
        onSelectRun,
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
        onMoveOutboxEntry,
        onResumeOutboxEntry,
        onCancelOutboxEntry,
        onUpdateOutboxEntry,
        onCompactContext,
        onEditMessage,
        onBranchFromMessage,
        onOpenToolArtifact,
    } = input;

    return (
        <WorkspaceShell
            inspectorSections={workspaceShell.inspector.sections}
            renderHeader={({ isInspectorOpen, toggleInspector }) => (
                <WorkspaceSelectionHeader
                    selectedSession={workspaceShell.header.selectedSession}
                    selectedRun={workspaceShell.header.selectedRun}
                    {...(workspaceShell.header.compactConnectionLabel
                        ? { compactConnectionLabel: workspaceShell.header.compactConnectionLabel }
                        : {})}
                    {...(workspaceShell.header.routingBadge ? { routingBadge: workspaceShell.header.routingBadge } : {})}
                    pendingPermissionCount={workspaceShell.header.pendingPermissionCount}
                    isInspectorOpen={isInspectorOpen}
                    sessions={workspaceShell.header.sessions}
                    runs={workspaceShell.header.runs}
                    onSelectSession={onSelectSession}
                    onSelectRun={onSelectRun}
                    onToggleInspector={toggleInspector}
                />
            )}>
            <WorkspacePrimaryColumn
                profileId={profileId}
                profiles={profiles}
                messages={messages}
                partsByMessageId={partsByMessageId}
                runs={runs}
                pendingImages={pendingImages}
                pendingTextFiles={pendingTextFiles}
                readyComposerAttachments={readyComposerAttachments}
                hasBlockingPendingAttachments={hasBlockingPendingAttachments}
                isStartingRun={isStartingRun}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                topLevelTab={topLevelTab}
                activeModeKey={activeModeKey}
                modes={modes}
                reasoningEffort={reasoningEffort}
                selectedModelSupportsReasoning={selectedModelSupportsReasoning}
                maxImageAttachmentsPerMessage={maxImageAttachmentsPerMessage}
                canAttachImages={canAttachImages}
                modelOptions={modelOptions}
                runErrorMessage={runErrorMessage}
                attachedRules={attachedRules}
                missingAttachedRuleKeys={missingAttachedRuleKeys}
                attachedSkills={attachedSkills}
                missingAttachedSkillKeys={missingAttachedSkillKeys}
                {...(selectedProfileId ? { selectedProfileId } : {})}
                {...(selectedSessionId ? { selectedSessionId } : {})}
                {...(selectedWorkspaceFingerprint ? { selectedWorkspaceFingerprint } : {})}
                {...(selectedSandboxId ? { selectedSandboxId } : {})}
                {...(optimisticUserMessage ? { optimisticUserMessage } : {})}
                {...(supportedReasoningEfforts ? { supportedReasoningEfforts } : {})}
                {...(imageAttachmentBlockedReason ? { imageAttachmentBlockedReason } : {})}
                {...(routingBadge !== undefined ? { routingBadge } : {})}
                {...(selectedModelCompatibilityState ? { selectedModelCompatibilityState } : {})}
                {...(selectedModelCompatibilityReason ? { selectedModelCompatibilityReason } : {})}
                {...(selectedProviderStatus ? { selectedProviderStatus } : {})}
                {...(contextState ? { contextState } : {})}
                {...(outboxEntries ? { outboxEntries } : {})}
                {...(selectedOutboxEntryId ? { selectedOutboxEntryId } : {})}
                {...(showRunContractPreview !== undefined ? { showRunContractPreview } : {})}
                {...(canCompactContext !== undefined ? { canCompactContext } : {})}
                {...(isCompactingContext !== undefined ? { isCompactingContext } : {})}
                runtimeOptions={runtimeOptions}
                {...(promptResetKey !== undefined ? { promptResetKey } : {})}
                {...(focusComposerRequestKey !== undefined ? { focusComposerRequestKey } : {})}
                {...(controlsDisabled !== undefined ? { controlsDisabled } : {})}
                {...(submitDisabled !== undefined ? { submitDisabled } : {})}
                onProfileChange={onProfileChange}
                onProviderChange={onProviderChange}
                onModelChange={onModelChange}
                onReasoningEffortChange={onReasoningEffortChange}
                onModeChange={onModeChange}
                onPromptEdited={onPromptEdited}
                onAddFiles={onAddFiles}
                onRemovePendingImage={onRemovePendingImage}
                onRemovePendingTextFile={onRemovePendingTextFile}
                onRetryPendingImage={onRetryPendingImage}
                {...(onQueuePrompt ? { onQueuePrompt } : {})}
                onSubmitPrompt={onSubmitPrompt}
                {...(onMoveOutboxEntry ? { onMoveOutboxEntry } : {})}
                {...(onResumeOutboxEntry ? { onResumeOutboxEntry } : {})}
                {...(onCancelOutboxEntry ? { onCancelOutboxEntry } : {})}
                {...(onUpdateOutboxEntry ? { onUpdateOutboxEntry } : {})}
                onSelectOutboxEntry={(entryId) => {
                    setSelectedOutboxEntryId(entryId);
                }}
                {...(onCompactContext ? { onCompactContext } : {})}
                {...(onEditMessage ? { onEditMessage } : {})}
                {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                {...(onOpenToolArtifact ? { onOpenToolArtifact } : {})}
            />
        </WorkspaceShell>
    );
}
