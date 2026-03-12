import { PendingPermissionsPanel } from '@/web/components/conversation/panels/pendingPermissionsPanel';
import { RunChangeSummaryPanel } from '@/web/components/conversation/panels/runChangeSummaryPanel';
import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';
import type { WorkspaceInspectorSection } from '@/web/components/conversation/sessions/workspaceShellModel';
import { WorkspacePrimaryColumn } from '@/web/components/conversation/sessions/workspace/workspacePrimaryColumn';
import type { SessionWorkspacePanelProps } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';
import { WorkspaceSelectionHeader } from '@/web/components/conversation/sessions/workspace/workspaceSelectionHeader';
import { WorkspaceShell } from '@/web/components/conversation/sessions/workspace/workspaceShell';

export type { SessionWorkspacePanelProps } from '@/web/components/conversation/sessions/workspace/workspacePanelModel';

export function SessionWorkspacePanel({
    profileId,
    sessions,
    runs,
    messages,
    partsByMessageId,
    selectedSessionId,
    selectedRunId,
    executionPreset,
    workspaceScope,
    pendingPermissions,
    permissionWorkspaces,
    pendingImages,
    isCreatingSession,
    isStartingRun,
    isResolvingPermission,
    canCreateSession,
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
    selectedModelLabel,
    selectedUsageSummary,
    registrySummary,
    agentContextSummary,
    runDiffOverview,
    modelOptions,
    runErrorMessage,
    contextState,
    canCompactContext,
    isCompactingContext,
    modePanel,
    executionEnvironmentPanel,
    attachedSkillsPanel,
    diffCheckpointPanel,
    promptResetKey,
    focusComposerRequestKey,
    onSelectSession,
    onSelectRun,
    onProviderChange,
    onModelChange,
    onReasoningEffortChange,
    onModeChange,
    onCreateSession,
    onPromptEdited,
    onAddImageFiles,
    onRemovePendingImage,
    onRetryPendingImage,
    onSubmitPrompt,
    onCompactContext,
    onResolvePermission,
    onEditMessage,
    onBranchFromMessage,
}: SessionWorkspacePanelProps) {
    const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? sessions[0];
    const selectedRun = runs.find((run) => run.id === selectedRunId) ?? runs[0];
    const pendingPermissionCount = pendingPermissions.length;
    const compactConnectionLabel = selectedProviderStatus
        ? `${selectedProviderStatus.label} · ${selectedProviderStatus.authState.replaceAll('_', ' ')}`
        : undefined;

    const inspectorSections: WorkspaceInspectorSection[] = [
        {
            id: 'workspace-status',
            label: 'Workspace status',
            description: 'Run state, workspace scope, provider readiness, and local telemetry.',
            content: (
                <WorkspaceStatusPanel
                    run={selectedRun}
                    executionPreset={executionPreset}
                    workspaceScope={workspaceScope}
                    provider={selectedProviderStatus}
                    modelLabel={selectedModelLabel}
                    usageSummary={selectedUsageSummary}
                    routingBadge={routingBadge}
                    registrySummary={registrySummary}
                    agentContextSummary={agentContextSummary}
                />
            ),
        },
        ...(executionEnvironmentPanel
            ? [
                  {
                      id: 'execution-environment',
                      label: 'Execution environment',
                      description: 'Workspace targeting and execution-scope details.',
                      content: executionEnvironmentPanel,
                  } satisfies WorkspaceInspectorSection,
              ]
            : []),
        {
            id: 'run-changes',
            label: 'Run changes',
            description: 'Diff summaries and run-level changes for the selected run.',
            content: (
                <RunChangeSummaryPanel
                    {...(selectedRunId ? { selectedRunId } : {})}
                    {...(runDiffOverview ? { overview: runDiffOverview } : {})}
                />
            ),
        },
        {
            id: 'pending-permissions',
            label: 'Pending permissions',
            description: 'Approvals stay in the inspector until an action needs them.',
            badge: pendingPermissionCount > 0 ? `${String(pendingPermissionCount)} waiting` : 'None waiting',
            tone: pendingPermissionCount > 0 ? 'attention' : 'default',
            content: (
                <PendingPermissionsPanel
                    requests={pendingPermissions}
                    {...(permissionWorkspaces ? { workspaceByFingerprint: permissionWorkspaces } : {})}
                    busy={isResolvingPermission}
                    onResolve={onResolvePermission}
                />
            ),
        },
        ...(attachedSkillsPanel
            ? [
                  {
                      id: 'attached-skills',
                      label: 'Attached skills',
                      description: 'Agent-specific rules and attached skill context.',
                      content: attachedSkillsPanel,
                  } satisfies WorkspaceInspectorSection,
              ]
            : []),
        ...(diffCheckpointPanel
            ? [
                  {
                      id: 'checkpoints',
                      label: 'Checkpoints',
                      description: 'Checkpoint and diff recovery data for the current session.',
                      content: diffCheckpointPanel,
                  } satisfies WorkspaceInspectorSection,
              ]
            : []),
    ];

    return (
        <WorkspaceShell
            inspectorSections={inspectorSections}
            renderHeader={({ isInspectorOpen, toggleInspector }) => (
                <WorkspaceSelectionHeader
                    sessions={sessions}
                    runs={runs}
                    selectedSession={selectedSession}
                    selectedRun={selectedRun}
                    {...(compactConnectionLabel ? { compactConnectionLabel } : {})}
                    {...(routingBadge ? { routingBadge } : {})}
                    pendingPermissionCount={pendingPermissionCount}
                    canCreateSession={canCreateSession}
                    isCreatingSession={isCreatingSession}
                    isInspectorOpen={isInspectorOpen}
                    onCreateSession={onCreateSession}
                    onSelectSession={onSelectSession}
                    onSelectRun={onSelectRun}
                    onToggleInspector={toggleInspector}
                />
            )}>
            <WorkspacePrimaryColumn
                profileId={profileId}
                messages={messages}
                partsByMessageId={partsByMessageId}
                runs={runs}
                pendingImages={pendingImages}
                isStartingRun={isStartingRun}
                selectedSessionId={selectedSession?.id}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                topLevelTab={topLevelTab}
                activeModeKey={activeModeKey}
                modes={modes}
                reasoningEffort={reasoningEffort}
                selectedModelSupportsReasoning={selectedModelSupportsReasoning}
                supportedReasoningEfforts={supportedReasoningEfforts}
                maxImageAttachmentsPerMessage={maxImageAttachmentsPerMessage}
                canAttachImages={canAttachImages}
                imageAttachmentBlockedReason={imageAttachmentBlockedReason}
                routingBadge={routingBadge}
                selectedModelCompatibilityState={selectedModelCompatibilityState}
                selectedModelCompatibilityReason={selectedModelCompatibilityReason}
                selectedProviderStatus={selectedProviderStatus}
                modelOptions={modelOptions}
                runErrorMessage={runErrorMessage}
                contextState={contextState}
                canCompactContext={canCompactContext}
                isCompactingContext={isCompactingContext}
                modePanel={modePanel}
                promptResetKey={promptResetKey}
                focusComposerRequestKey={focusComposerRequestKey}
                onProviderChange={onProviderChange}
                onModelChange={onModelChange}
                onReasoningEffortChange={onReasoningEffortChange}
                onModeChange={onModeChange}
                onPromptEdited={onPromptEdited}
                onAddImageFiles={onAddImageFiles}
                onRemovePendingImage={onRemovePendingImage}
                onRetryPendingImage={onRetryPendingImage}
                onSubmitPrompt={onSubmitPrompt}
                onCompactContext={onCompactContext}
                onEditMessage={onEditMessage}
                onBranchFromMessage={onBranchFromMessage}
            />
        </WorkspaceShell>
    );
}
