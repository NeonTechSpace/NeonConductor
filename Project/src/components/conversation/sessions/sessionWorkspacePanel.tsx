import { useState } from 'react';

import type { MessageFlowMessage } from '@/web/components/conversation/messages/messageFlowModel';
import { ComposerActionPanel } from '@/web/components/conversation/panels/composerActionPanel';
import { MessageFlowPanel } from '@/web/components/conversation/panels/messageFlowPanel';
import { PendingPermissionsPanel } from '@/web/components/conversation/panels/pendingPermissionsPanel';
import { RunChangeSummaryPanel } from '@/web/components/conversation/panels/runChangeSummaryPanel';
import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';
import { WorkspaceInspector } from '@/web/components/conversation/sessions/workspaceInspector';
import type { WorkspaceInspectorSection } from '@/web/components/conversation/sessions/workspaceShellModel';
import { Button } from '@/web/components/ui/button';

import type {
    MessagePartRecord,
    MessageRecord,
    PermissionRecord,
    ProviderUsageSummary,
    RunRecord,
    SessionSummaryRecord,
} from '@/app/backend/persistence/types';

import type { DiffOverview } from '@/shared/contracts';
import type { ResolvedContextState, RuntimeReasoningEffort, TopLevelTab } from '@/shared/contracts';

import type { ReactNode } from 'react';

interface SessionWorkspacePanelProps {
    profileId: string;
    sessions: SessionSummaryRecord[];
    runs: RunRecord[];
    messages: MessageRecord[];
    partsByMessageId: Map<string, MessagePartRecord[]>;
    selectedSessionId?: string;
    selectedRunId?: string;
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
        status: 'queued' | 'compressing' | 'ready' | 'failed';
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
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    topLevelTab: TopLevelTab;
    activeModeKey: string;
    modes: Array<{ id: string; modeKey: string; label: string }>;
    reasoningEffort: RuntimeReasoningEffort;
    selectedModelSupportsReasoning: boolean;
    supportedReasoningEfforts?: RuntimeReasoningEffort[];
    maxImageAttachmentsPerMessage: number;
    canAttachImages: boolean;
    imageAttachmentBlockedReason?: string;
    routingBadge?: string;
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
        reasoningEfforts?: RuntimeReasoningEffort[];
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
    modePanel?: ReactNode;
    executionEnvironmentPanel?: ReactNode;
    attachedSkillsPanel?: ReactNode;
    diffCheckpointPanel?: ReactNode;
    focusComposerRequestKey?: number;
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onReasoningEffortChange: (effort: RuntimeReasoningEffort) => void;
    onModeChange: (modeKey: string) => void;
    onCreateSession: () => void;
    onPromptChange: (nextPrompt: string) => void;
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
    onEditMessage?: (entry: MessageFlowMessage) => void;
    onBranchFromMessage?: (entry: MessageFlowMessage) => void;
}

function formatSessionOptionLabel(session: SessionSummaryRecord): string {
    const kindLabel = session.kind === 'worktree' ? 'Worktree' : session.kind === 'local' ? 'Workspace' : 'Playground';
    return `${kindLabel} · ${session.turnCount} turns`;
}

function formatRunOptionLabel(run: RunRecord): string {
    const timestamp = new Date(run.updatedAt);
    const timeLabel = Number.isNaN(timestamp.getTime()) ? run.id : timestamp.toLocaleTimeString();
    return `${run.status.replaceAll('_', ' ')} · ${timeLabel}`;
}

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
    reasoningEffort,
    selectedModelSupportsReasoning,
    supportedReasoningEfforts,
    maxImageAttachmentsPerMessage,
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
    focusComposerRequestKey,
    onSelectSession,
    onSelectRun,
    onProviderChange,
    onModelChange,
    onReasoningEffortChange,
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
}: SessionWorkspacePanelProps) {
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
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
        <div
            className={`grid min-h-0 min-w-0 flex-1 ${isInspectorOpen ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : 'grid-cols-1'}`}>
            <div className='flex min-h-0 min-w-0 flex-col overflow-hidden'>
                <div className='border-border/70 bg-card/30 border-b px-4 py-4'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='text-sm font-semibold'>
                                {selectedSession ? 'Conversation flow' : 'Workspace'}
                            </p>
                            <p className='text-muted-foreground mt-1 text-xs'>
                                Transcript and composer stay primary. Session, run, and workspace detail stay compact
                                until needed.
                            </p>
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                            {compactConnectionLabel ? (
                                <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs'>
                                    {compactConnectionLabel}
                                </span>
                            ) : null}
                            {routingBadge ? (
                                <span className='border-border bg-background/70 text-muted-foreground rounded-full border px-3 py-1 text-xs'>
                                    {routingBadge}
                                </span>
                            ) : null}
                            {pendingPermissionCount > 0 ? (
                                <span className='rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200'>
                                    {String(pendingPermissionCount)} approvals waiting
                                </span>
                            ) : null}
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                disabled={!canCreateSession || isCreatingSession}
                                onClick={onCreateSession}>
                                New session
                            </Button>
                            <Button
                                type='button'
                                size='sm'
                                variant={isInspectorOpen ? 'secondary' : 'outline'}
                                onClick={() => {
                                    setIsInspectorOpen((current) => !current);
                                }}>
                                {isInspectorOpen ? 'Hide Inspector' : 'Show Inspector'}
                            </Button>
                        </div>
                    </div>

                    <div className='mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]'>
                        <label className='space-y-1'>
                            <span className='text-muted-foreground block text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                Session
                            </span>
                            <select
                                aria-label='Selected session'
                                value={selectedSession?.id ?? ''}
                                className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                                onChange={(event) => {
                                    onSelectSession(event.target.value);
                                }}
                                disabled={sessions.length === 0}>
                                {sessions.length === 0 ? <option value=''>No sessions</option> : null}
                                {sessions.map((session) => (
                                    <option key={session.id} value={session.id}>
                                        {formatSessionOptionLabel(session)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className='space-y-1'>
                            <span className='text-muted-foreground block text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                Run focus
                            </span>
                            <select
                                aria-label='Selected run'
                                value={selectedRun?.id ?? ''}
                                className='border-border bg-background h-10 w-full rounded-xl border px-3 text-sm'
                                onChange={(event) => {
                                    onSelectRun(event.target.value);
                                }}
                                disabled={runs.length === 0}>
                                {runs.length === 0 ? <option value=''>No runs</option> : null}
                                {runs.map((run) => (
                                    <option key={run.id} value={run.id}>
                                        {formatRunOptionLabel(run)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className='flex items-end justify-start xl:justify-end'>
                            <div className='text-muted-foreground border-border/70 bg-background/50 rounded-[1.25rem] border px-3 py-2 text-xs'>
                                {selectedSession
                                    ? `${String(selectedSession.turnCount)} turns · ${selectedSession.runStatus}`
                                    : 'No session selected'}
                            </div>
                        </div>
                    </div>
                </div>

                <div className='flex min-h-0 flex-1 flex-col gap-4 overflow-hidden px-4 py-4'>
                    {modePanel ? (
                        <div className='border-border/70 bg-card/35 shrink-0 rounded-[28px] border p-4'>
                            {modePanel}
                        </div>
                    ) : null}

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
                            prompt={prompt}
                            pendingImages={pendingImages}
                            disabled={!selectedSession}
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
                            {...(selectedProviderStatus ? { selectedProviderStatus } : {})}
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
                            {...(focusComposerRequestKey !== undefined ? { focusComposerRequestKey } : {})}
                            onProviderChange={onProviderChange}
                            onModelChange={onModelChange}
                            onReasoningEffortChange={onReasoningEffortChange}
                            onModeChange={onModeChange}
                            onPromptChange={onPromptChange}
                            onAddImageFiles={onAddImageFiles}
                            onRemovePendingImage={onRemovePendingImage}
                            onRetryPendingImage={onRetryPendingImage}
                            onSubmitPrompt={onSubmitPrompt}
                            {...(onCompactContext ? { onCompactContext } : {})}
                        />
                    </div>
                </div>
            </div>

            {isInspectorOpen ? (
                <WorkspaceInspector
                    sections={inspectorSections}
                    onClose={() => {
                        setIsInspectorOpen(false);
                    }}
                />
            ) : null}
        </div>
    );
}
