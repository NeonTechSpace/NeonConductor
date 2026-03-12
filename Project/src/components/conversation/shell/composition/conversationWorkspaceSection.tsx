import type { MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import { SessionWorkspacePanel } from '@/web/components/conversation/sessions/sessionWorkspacePanel';

import type {
    MessagePartRecord,
    MessageRecord,
    PermissionRecord,
    ProviderUsageSummary,
    RunRecord,
    SessionSummaryRecord,
    ThreadListRecord,
} from '@/app/backend/persistence/types';

import type { DiffOverview, ResolvedContextState, RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

import type { ReactNode } from 'react';

interface ConversationWorkspaceSectionProps {
    profileId: string;
    selectedThread: ThreadListRecord | undefined;
    selectedSessionId: string | undefined;
    selectedRunId: string | undefined;
    streamState: string;
    lastSequence: number;
    tabSwitchNotice: string | undefined;
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    executionPreset: 'privacy' | 'standard' | 'yolo';
    workspaceScope:
        | {
              kind: 'detached';
          }
        | {
              kind: 'workspace';
              label: string;
              absolutePath: string;
              executionEnvironmentMode: 'local' | 'new_worktree';
              executionBranch?: string;
              baseBranch?: string;
          }
        | {
              kind: 'worktree';
              label: string;
              absolutePath: string;
              branch: string;
              baseBranch: string;
              baseWorkspaceLabel: string;
              baseWorkspacePath: string;
              worktreeId: string;
          };
    pendingPermissions: PermissionRecord[];
    permissionWorkspaces?: Record<
        string,
        {
            label: string;
            absolutePath: string;
        }
    >;
    prompt: string;
    pendingImages: Array<{
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
    }>;
    isCreatingSession: boolean;
    isStartingRun: boolean;
    isResolvingPermission: boolean;
    canCreateSession: boolean;
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string | undefined;
    topLevelTab: TopLevelTab;
    activeModeKey: string;
    modes: Array<{ id: string; modeKey: string; label: string }>;
    canAttachImages: boolean;
    imageAttachmentBlockedReason?: string;
    routingBadge: string | undefined;
    selectedProviderStatus?:
        | {
              label: string;
              authState: string;
              authMethod: string;
          }
        | undefined;
    selectedModelLabel?: string;
    selectedUsageSummary?: ProviderUsageSummary;
    registrySummary?:
        | {
              modes: number;
              rulesets: number;
              skillfiles: number;
          }
        | undefined;
    agentContextSummary?:
        | {
              modeLabel: string;
              rulesetCount: number;
              attachedSkillCount: number;
          }
        | undefined;
    runDiffOverview?: DiffOverview;
    modelOptions: Array<{
        id: string;
        label: string;
        providerId?: string;
        providerLabel?: string;
        sourceProvider?: string;
        source?: string;
        promptFamily?: string;
        price?: number;
        latency?: number;
        tps?: number;
    }>;
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    contextFeedbackMessage?: string;
    contextFeedbackTone?: 'success' | 'error' | 'info';
    canCompactContext?: boolean;
    isCompactingContext?: boolean;
    modePanel: ReactNode;
    executionEnvironmentPanel?: ReactNode;
    attachedSkillsPanel?: ReactNode;
    diffCheckpointPanel?: ReactNode;
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onModeChange: (modeKey: string) => void;
    onCreateSession: () => void;
    onPromptChange: (prompt: string) => void;
    onAddImageFiles: (files: FileList | File[]) => void;
    onRemovePendingImage: (clientId: string) => void;
    onRetryPendingImage: (clientId: string) => void;
    onSubmitPrompt: () => void;
    onCompactContext?: () => void;
    onResolvePermission: (
        requestId: PermissionRecord['id'],
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace',
        selectedApprovalResource?: string
    ) => void;
    onEditMessage: (entry: MessageTimelineEntry) => void;
    onBranchFromMessage: (entry: MessageTimelineEntry) => void;
}

export function ConversationWorkspaceSection({
    profileId,
    selectedThread,
    selectedSessionId,
    selectedRunId,
    streamState,
    lastSequence,
    tabSwitchNotice,
    sessions,
    runs,
    messages,
    partsByMessageId,
    executionPreset,
    workspaceScope,
    pendingPermissions,
    permissionWorkspaces,
    prompt,
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
    canAttachImages,
    imageAttachmentBlockedReason,
    routingBadge,
    selectedProviderStatus,
    selectedModelLabel,
    selectedUsageSummary,
    registrySummary,
    agentContextSummary,
    runDiffOverview,
    modelOptions,
    runErrorMessage,
    contextState,
    contextFeedbackMessage,
    contextFeedbackTone,
    canCompactContext,
    isCompactingContext,
    modePanel,
    executionEnvironmentPanel,
    attachedSkillsPanel,
    diffCheckpointPanel,
    onSelectSession,
    onSelectRun,
    onProviderChange,
    onModelChange,
    onModeChange,
    onCreateSession,
    onPromptChange,
    onAddImageFiles,
    onRemovePendingImage,
    onRetryPendingImage,
    onSubmitPrompt,
    onCompactContext,
    onResolvePermission,
    onEditMessage,
    onBranchFromMessage,
}: ConversationWorkspaceSectionProps) {
    return (
        <section className='flex min-h-0 min-w-0 flex-1 flex-col'>
            <header className='border-border flex items-center justify-between border-b px-4 py-3'>
                <div className='min-w-0'>
                    <p className='truncate text-sm font-semibold'>{selectedThread?.title ?? 'No Thread Selected'}</p>
                    <p className='text-muted-foreground text-xs'>
                        Stream: {streamState} · Events: {lastSequence}
                    </p>
                    {tabSwitchNotice ? <p className='text-primary text-xs'>{tabSwitchNotice}</p> : null}
                </div>
            </header>

            <SessionWorkspacePanel
                profileId={profileId}
                sessions={sessions}
                runs={runs}
                messages={messages}
                partsByMessageId={partsByMessageId}
                {...(selectedSessionId ? { selectedSessionId } : {})}
                {...(selectedRunId ? { selectedRunId } : {})}
                executionPreset={executionPreset}
                workspaceScope={workspaceScope}
                pendingPermissions={pendingPermissions}
                {...(permissionWorkspaces ? { permissionWorkspaces } : {})}
                prompt={prompt}
                pendingImages={pendingImages}
                isCreatingSession={isCreatingSession}
                isStartingRun={isStartingRun}
                isResolvingPermission={isResolvingPermission}
                canCreateSession={canCreateSession}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                topLevelTab={topLevelTab}
                activeModeKey={activeModeKey}
                modes={modes}
                canAttachImages={canAttachImages}
                {...(imageAttachmentBlockedReason ? { imageAttachmentBlockedReason } : {})}
                {...(routingBadge !== undefined ? { routingBadge } : {})}
                {...(selectedProviderStatus ? { selectedProviderStatus } : {})}
                {...(selectedModelLabel ? { selectedModelLabel } : {})}
                {...(selectedUsageSummary ? { selectedUsageSummary } : {})}
                {...(registrySummary ? { registrySummary } : {})}
                {...(agentContextSummary ? { agentContextSummary } : {})}
                {...(runDiffOverview ? { runDiffOverview } : {})}
                modelOptions={modelOptions}
                runErrorMessage={runErrorMessage}
                {...(contextState ? { contextState } : {})}
                {...(contextFeedbackMessage
                    ? {
                          contextFeedbackMessage,
                          ...(contextFeedbackTone ? { contextFeedbackTone } : {}),
                      }
                    : {})}
                {...(canCompactContext !== undefined ? { canCompactContext } : {})}
                {...(isCompactingContext !== undefined ? { isCompactingContext } : {})}
                {...(executionEnvironmentPanel ? { executionEnvironmentPanel } : {})}
                onSelectSession={onSelectSession}
                onSelectRun={onSelectRun}
                onProviderChange={onProviderChange}
                onModelChange={onModelChange}
                onModeChange={onModeChange}
                onCreateSession={onCreateSession}
                onPromptChange={onPromptChange}
                onAddImageFiles={onAddImageFiles}
                onRemovePendingImage={onRemovePendingImage}
                onRetryPendingImage={onRetryPendingImage}
                onSubmitPrompt={onSubmitPrompt}
                {...(onCompactContext ? { onCompactContext } : {})}
                onResolvePermission={onResolvePermission}
                onEditMessage={onEditMessage}
                onBranchFromMessage={onBranchFromMessage}
                modePanel={modePanel}
                {...(attachedSkillsPanel ? { attachedSkillsPanel } : {})}
                {...(diffCheckpointPanel ? { diffCheckpointPanel } : {})}
            />
        </section>
    );
}

