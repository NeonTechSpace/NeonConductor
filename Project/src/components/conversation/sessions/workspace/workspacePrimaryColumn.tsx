import { skipToken } from '@tanstack/react-query';

import { ComposerActionPanel } from '@/web/components/conversation/panels/composerActionPanel';
import { DevBrowserPanel } from '@/web/components/conversation/panels/devBrowserPanel';
import { MessageFlowPanel } from '@/web/components/conversation/panels/messageFlowPanel';
import { SessionOutboxPanel } from '@/web/components/conversation/panels/sessionOutboxPanel';
import type { SessionWorkspacePanelProps } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { Button } from '@/web/components/ui/button';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';
import { useState } from 'react';

type WorkspacePrimaryColumnProps = Pick<
    SessionWorkspacePanelProps,
    | 'profileId'
    | 'profiles'
    | 'selectedProfileId'
    | 'selectedSessionId'
    | 'selectedWorkspaceFingerprint'
    | 'selectedSandboxId'
    | 'messages'
    | 'partsByMessageId'
    | 'runs'
    | 'optimisticUserMessage'
    | 'pendingImages'
    | 'pendingTextFiles'
    | 'readyComposerAttachments'
    | 'hasBlockingPendingAttachments'
    | 'isStartingRun'
    | 'selectedProviderId'
    | 'selectedModelId'
    | 'topLevelTab'
    | 'activeModeKey'
    | 'modes'
    | 'reasoningEffort'
    | 'selectedModelSupportsReasoning'
    | 'supportedReasoningEfforts'
    | 'maxImageAttachmentsPerMessage'
    | 'canAttachImages'
    | 'imageAttachmentBlockedReason'
    | 'routingBadge'
    | 'selectedModelCompatibilityState'
    | 'selectedModelCompatibilityReason'
    | 'selectedProviderStatus'
    | 'modelOptions'
    | 'runErrorMessage'
    | 'contextState'
    | 'outboxEntries'
    | 'selectedOutboxEntryId'
    | 'attachedRules'
    | 'missingAttachedRuleKeys'
    | 'attachedSkills'
    | 'missingAttachedSkillKeys'
    | 'showRunContractPreview'
    | 'runtimeOptions'
    | 'canCompactContext'
    | 'isCompactingContext'
    | 'promptResetKey'
    | 'focusComposerRequestKey'
    | 'controlsDisabled'
    | 'submitDisabled'
    | 'onProfileChange'
    | 'onProviderChange'
    | 'onModelChange'
    | 'onReasoningEffortChange'
    | 'onModeChange'
    | 'onPromptEdited'
    | 'onAddFiles'
    | 'onRemovePendingImage'
    | 'onRemovePendingTextFile'
    | 'onRetryPendingImage'
    | 'onQueuePrompt'
    | 'onSubmitPrompt'
    | 'onMoveOutboxEntry'
    | 'onResumeOutboxEntry'
    | 'onCancelOutboxEntry'
    | 'onUpdateOutboxEntry'
    | 'onSelectOutboxEntry'
    | 'onCompactContext'
    | 'onEditMessage'
    | 'onBranchFromMessage'
    | 'onOpenToolArtifact'
>;

export function WorkspacePrimaryColumn({
    profileId,
    profiles,
    selectedProfileId,
    selectedSessionId,
    selectedWorkspaceFingerprint,
    selectedSandboxId,
    messages,
    partsByMessageId,
    runs,
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
    selectedOutboxEntryId,
    attachedRules,
    missingAttachedRuleKeys,
    attachedSkills,
    missingAttachedSkillKeys,
    showRunContractPreview,
    runtimeOptions,
    canCompactContext,
    isCompactingContext,
    promptResetKey,
    focusComposerRequestKey,
    controlsDisabled,
    submitDisabled,
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
    onSelectOutboxEntry,
    onCompactContext,
    onEditMessage,
    onBranchFromMessage,
    onOpenToolArtifact,
}: WorkspacePrimaryColumnProps) {
    const validatedSelectedSessionId = isEntityId(selectedSessionId, 'sess') ? selectedSessionId : undefined;
    const [activePrimarySurface, setActivePrimarySurface] = useState<'transcript' | 'browser'>('transcript');
    const [draftPromptSnapshot, setDraftPromptSnapshot] = useState('');
    const includedBrowserPacketQuery = trpc.session.buildBrowserContextPacket.useQuery(
        validatedSelectedSessionId
            ? {
                  profileId,
                  sessionId: validatedSelectedSessionId,
              }
            : skipToken,
        PROGRESSIVE_QUERY_OPTIONS
    );
    const includedBrowserPacket =
        includedBrowserPacketQuery.data?.available === true ? includedBrowserPacketQuery.data.packet : undefined;
    const includedBrowserSummary =
        includedBrowserPacketQuery.data?.available === true ? includedBrowserPacketQuery.data.summary : undefined;

    return (
        <div className='flex min-h-0 min-w-0 flex-col overflow-hidden'>
            <div className='flex min-h-0 flex-1 flex-col gap-3 overflow-hidden px-4 py-4'>
                <div className='border-border/70 bg-card/15 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[34px] border shadow-[0_16px_44px_rgba(15,23,42,0.06)]'>
                    <div className='border-border/50 flex items-center justify-between gap-3 border-b px-4 py-3'>
                        <div>
                            <p className='text-sm font-semibold'>Session Surface</p>
                            <p className='text-muted-foreground text-xs'>
                                Switch between the transcript and the local dev browser for frontend review work.
                            </p>
                        </div>
                        <div className='flex items-center gap-2'>
                            <Button
                                type='button'
                                size='sm'
                                variant={activePrimarySurface === 'transcript' ? 'default' : 'outline'}
                                onClick={() => {
                                    setActivePrimarySurface('transcript');
                                }}>
                                Transcript
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant={activePrimarySurface === 'browser' ? 'default' : 'outline'}
                                disabled={!validatedSelectedSessionId}
                                onClick={() => {
                                    setActivePrimarySurface('browser');
                                }}>
                                Browser
                            </Button>
                        </div>
                    </div>
                    <div className='border-border/50 flex min-h-0 flex-1 flex-col overflow-hidden rounded-[34px] border-dashed p-3 md:p-4'>
                        {activePrimarySurface === 'browser' ? (
                            <DevBrowserPanel
                                profileId={profileId}
                                {...(validatedSelectedSessionId ? { sessionId: validatedSelectedSessionId } : {})}
                                visible
                                currentDraftPrompt={draftPromptSnapshot}
                                onSubmitPrompt={onSubmitPrompt}
                                {...(onQueuePrompt ? { onQueuePrompt } : {})}
                            />
                        ) : (
                            <MessageFlowPanel
                                profileId={profileId}
                                messages={messages}
                                partsByMessageId={partsByMessageId}
                                runs={runs}
                                {...(validatedSelectedSessionId ? { selectedSessionId: validatedSelectedSessionId } : {})}
                                {...(optimisticUserMessage ? { optimisticUserMessage } : {})}
                                {...(onEditMessage ? { onEditMessage } : {})}
                                {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                                {...(onOpenToolArtifact ? { onOpenToolArtifact } : {})}
                            />
                        )}
                    </div>
                </div>

                {outboxEntries && outboxEntries.length > 0 ? (
                    <SessionOutboxPanel
                        entries={outboxEntries}
                        {...(selectedOutboxEntryId ? { selectedEntryId: selectedOutboxEntryId } : {})}
                        {...(onSelectOutboxEntry ? { onSelectEntry: onSelectOutboxEntry } : {})}
                        onMoveEntry={(entryId, direction) => {
                            onMoveOutboxEntry?.(entryId, direction);
                        }}
                        onResumeEntry={(entryId) => {
                            onResumeOutboxEntry?.(entryId);
                        }}
                        onCancelEntry={(entryId) => {
                            onCancelOutboxEntry?.(entryId);
                        }}
                        {...(onUpdateOutboxEntry
                            ? {
                                  onUpdateEntry: onUpdateOutboxEntry,
                              }
                            : {})}
                    />
                ) : null}

                <ComposerActionPanel
                    profileId={profileId}
                    pendingImages={pendingImages}
                    pendingTextFiles={pendingTextFiles}
                    readyComposerAttachments={readyComposerAttachments}
                    hasBlockingPendingAttachments={hasBlockingPendingAttachments}
                    disabled={false}
                    isSubmitting={isStartingRun}
                    profiles={profiles}
                    {...(selectedProfileId ? { selectedProfileId } : {})}
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
                    {...(validatedSelectedSessionId ? { selectedSessionId: validatedSelectedSessionId } : {})}
                    {...(selectedWorkspaceFingerprint ? { workspaceFingerprint: selectedWorkspaceFingerprint } : {})}
                    {...(selectedSandboxId ? { sandboxId: selectedSandboxId } : {})}
                    runtimeOptions={runtimeOptions}
                    attachedRules={attachedRules}
                    missingAttachedRuleKeys={missingAttachedRuleKeys}
                    attachedSkills={attachedSkills}
                    missingAttachedSkillKeys={missingAttachedSkillKeys}
                    {...(includedBrowserPacket ? { browserContext: includedBrowserPacket } : {})}
                    {...(includedBrowserSummary ? { browserContextSummary: includedBrowserSummary } : {})}
                    {...(showRunContractPreview !== undefined ? { showRunContractPreview } : {})}
                    {...(canCompactContext !== undefined ? { canCompactContext } : {})}
                    {...(isCompactingContext !== undefined ? { isCompactingContext } : {})}
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
                    onDraftPromptSnapshotChange={setDraftPromptSnapshot}
                    onAddFiles={onAddFiles}
                    onRemovePendingImage={onRemovePendingImage}
                    onRemovePendingTextFile={onRemovePendingTextFile}
                    onRetryPendingImage={onRetryPendingImage}
                    {...(onQueuePrompt ? { onQueuePrompt } : {})}
                    onSubmitPrompt={onSubmitPrompt}
                    {...(onCompactContext ? { onCompactContext } : {})}
                />
            </div>
        </div>
    );
}
