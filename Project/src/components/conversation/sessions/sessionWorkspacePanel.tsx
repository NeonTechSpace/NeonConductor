import type { MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import { ComposerActionPanel } from '@/web/components/conversation/panels/composerActionPanel';
import { MessageTimelinePanel } from '@/web/components/conversation/panels/messageTimelinePanel';
import { PendingPermissionsPanel } from '@/web/components/conversation/panels/pendingPermissionsPanel';
import { RunChangeSummaryPanel } from '@/web/components/conversation/panels/runChangeSummaryPanel';
import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { Button } from '@/web/components/ui/button';
import { trpc } from '@/web/trpc/client';

import type {
    MessagePartRecord,
    MessageRecord,
    PermissionRecord,
    ProviderUsageSummary,
    RunRecord,
    SessionSummaryRecord,
} from '@/app/backend/persistence/types';

import type { DiffOverview } from '@/shared/contracts';
import type { ResolvedContextState, TopLevelTab } from '@/shared/contracts';

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
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
    topLevelTab: TopLevelTab;
    activeModeKey: string;
    modes: Array<{ id: string; modeKey: string; label: string }>;
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
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
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
    onEditMessage?: (entry: MessageTimelineEntry) => void;
    onBranchFromMessage?: (entry: MessageTimelineEntry) => void;
}

function UtilityDetails({
    title,
    summary,
    children,
    open = false,
}: {
    title: string;
    summary: string;
    children: ReactNode;
    open?: boolean;
}) {
    return (
        <details
            className='border-border/70 bg-card/70 rounded-2xl border p-4'
            {...(open ? { open: true } : {})}>
            <summary className='flex cursor-pointer list-none items-center justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>{title}</p>
                    <p className='text-muted-foreground mt-1 text-xs'>{summary}</p>
                </div>
                <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    Toggle
                </span>
            </summary>
            <div className='mt-4 min-w-0'>{children}</div>
        </details>
    );
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
}: SessionWorkspacePanelProps) {
    const utils = trpc.useUtils();
    const latestRun = runs.find((run) => run.id === selectedRunId) ?? runs.at(-1);
    const pendingPermissionCount = pendingPermissions.length;

    return (
        <div className='grid min-h-0 flex-1 2xl:grid-cols-[220px_minmax(0,1fr)]'>
            <aside className='border-border/70 bg-card/35 min-h-0 overflow-hidden border-b 2xl:border-r 2xl:border-b-0'>
                <div className='flex h-full min-h-0 flex-col px-4 py-4'>
                    <div className='mb-4 flex items-center justify-between gap-3'>
                        <div>
                            <p className='text-sm font-semibold'>Sessions</p>
                            <p className='text-muted-foreground text-xs'>Keep the active execution thread close.</p>
                        </div>
                        <Button
                            type='button'
                            size='sm'
                            disabled={!canCreateSession || isCreatingSession}
                            onClick={onCreateSession}>
                            New
                        </Button>
                    </div>

                    <div className='flex min-h-0 gap-2 overflow-x-auto pb-1 2xl:flex-col 2xl:overflow-y-auto 2xl:pb-0'>
                        {sessions.map((session) => (
                            <button
                                key={session.id}
                                type='button'
                                className={`min-w-[220px] shrink-0 rounded-2xl border p-3 text-left transition-colors 2xl:min-w-0 2xl:w-full ${
                                    selectedSessionId === session.id
                                        ? 'border-primary bg-primary/10 shadow-sm'
                                        : 'border-border bg-background/80 hover:bg-accent'
                                }`}
                                onMouseEnter={() => {
                                    void utils.session.status.prefetch({
                                        profileId,
                                        sessionId: session.id,
                                    });
                                    void utils.session.listRuns.prefetch({
                                        profileId,
                                        sessionId: session.id,
                                    });
                                }}
                                onFocus={() => {
                                    void utils.session.status.prefetch({
                                        profileId,
                                        sessionId: session.id,
                                    });
                                    void utils.session.listRuns.prefetch({
                                        profileId,
                                        sessionId: session.id,
                                    });
                                }}
                                onClick={() => {
                                    onSelectSession(session.id);
                                }}>
                                <p className='truncate text-sm font-medium'>{session.id}</p>
                                <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                    {session.kind === 'worktree'
                                        ? 'managed worktree'
                                        : session.kind === 'local'
                                          ? 'local workspace'
                                          : session.kind}
                                    {' · '}
                                    {session.runStatus} · turns {session.turnCount}
                                </p>
                            </button>
                        ))}
                        {sessions.length === 0 ? (
                            <p className='text-muted-foreground text-sm'>No sessions for this thread yet.</p>
                        ) : null}
                    </div>
                </div>
            </aside>

            <div className='bg-background/20 flex min-h-0 min-w-0 flex-col'>
                <div className='border-border/70 flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4'>
                    <div className='min-w-0'>
                        <p className='text-sm font-semibold'>Run History</p>
                        <p className='text-muted-foreground text-xs'>
                            Review recent runs, then continue in the composer below.
                        </p>
                    </div>
                </div>

                <div className='flex min-h-0 flex-1 flex-col gap-4 px-4 py-4'>
                    {runs.length > 0 ? (
                        <div className='flex items-center gap-2 overflow-x-auto pb-1'>
                            {runs.map((run) => (
                                <button
                                    key={run.id}
                                    type='button'
                                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${
                                        selectedRunId === run.id
                                            ? 'border-primary bg-primary/10 text-primary'
                                            : 'border-border bg-card text-foreground'
                                    }`}
                                    onMouseEnter={() => {
                                        if (!isEntityId(selectedSessionId, 'sess')) {
                                            return;
                                        }

                                        void utils.session.listMessages.prefetch({
                                            profileId,
                                            sessionId: selectedSessionId,
                                            runId: run.id,
                                        });
                                        void utils.diff.listByRun.prefetch({
                                            profileId,
                                            runId: run.id,
                                        });
                                        void utils.checkpoint.list.prefetch({
                                            profileId,
                                            sessionId: selectedSessionId,
                                        });
                                    }}
                                    onFocus={() => {
                                        if (!isEntityId(selectedSessionId, 'sess')) {
                                            return;
                                        }

                                        void utils.session.listMessages.prefetch({
                                            profileId,
                                            sessionId: selectedSessionId,
                                            runId: run.id,
                                        });
                                        void utils.diff.listByRun.prefetch({
                                            profileId,
                                            runId: run.id,
                                        });
                                        void utils.checkpoint.list.prefetch({
                                            profileId,
                                            sessionId: selectedSessionId,
                                        });
                                    }}
                                    onClick={() => {
                                        onSelectRun(run.id);
                                    }}>
                                    {run.status} · {run.id}
                                </button>
                            ))}
                        </div>
                    ) : null}

                    {modePanel}

                    {executionEnvironmentPanel}

                    <div className='flex min-h-[280px] min-w-0 flex-1 flex-col rounded-[28px] border border-border/70 bg-card/35 p-4'>
                        <MessageTimelinePanel
                            profileId={profileId}
                            messages={messages}
                            partsByMessageId={partsByMessageId}
                            {...(onEditMessage ? { onEditMessage } : {})}
                            {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                        />
                    </div>

                    <div className='shrink-0 rounded-[28px] border border-border/70 bg-background/80 p-4 shadow-sm'>
                        <ComposerActionPanel
                            prompt={prompt}
                            pendingImages={pendingImages}
                            disabled={!selectedSessionId}
                            isSubmitting={isStartingRun}
                            selectedProviderId={selectedProviderId}
                            selectedModelId={selectedModelId}
                            topLevelTab={topLevelTab}
                            activeModeKey={activeModeKey}
                            modes={modes}
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
                            onProviderChange={onProviderChange}
                            onModelChange={onModelChange}
                            onModeChange={onModeChange}
                            onPromptChange={onPromptChange}
                            onAddImageFiles={onAddImageFiles}
                            onRemovePendingImage={onRemovePendingImage}
                            onRetryPendingImage={onRetryPendingImage}
                            onSubmitPrompt={onSubmitPrompt}
                            {...(onCompactContext ? { onCompactContext } : {})}
                        />
                    </div>

                    <div className='shrink-0 grid gap-3 xl:grid-cols-2 2xl:grid-cols-3'>
                        <UtilityDetails
                            title='Workspace Status'
                            summary='Run state, workspace scope, and telemetry.'
                            open={Boolean(latestRun?.errorMessage)}>
                            <WorkspaceStatusPanel
                                run={latestRun}
                                executionPreset={executionPreset}
                                workspaceScope={workspaceScope}
                                provider={selectedProviderStatus}
                                modelLabel={selectedModelLabel}
                                usageSummary={selectedUsageSummary}
                                routingBadge={routingBadge}
                                registrySummary={registrySummary}
                                agentContextSummary={agentContextSummary}
                            />
                        </UtilityDetails>

                        {attachedSkillsPanel ? (
                            <UtilityDetails title='Attached Skills' summary='Agent-specific attached skills and rule context.'>
                                {attachedSkillsPanel}
                            </UtilityDetails>
                        ) : null}

                        <UtilityDetails
                            title='Run Changes'
                            summary='Diff summaries and run-level changes.'
                            open={Boolean(runDiffOverview)}>
                            <RunChangeSummaryPanel
                                {...(selectedRunId ? { selectedRunId } : {})}
                                {...(runDiffOverview ? { overview: runDiffOverview } : {})}
                            />
                        </UtilityDetails>

                        <UtilityDetails
                            title='Pending Permissions'
                            summary={`${String(pendingPermissionCount)} approval request${pendingPermissionCount === 1 ? '' : 's'} waiting.`}
                            open={pendingPermissionCount > 0}>
                            <PendingPermissionsPanel
                                requests={pendingPermissions}
                                {...(permissionWorkspaces ? { workspaceByFingerprint: permissionWorkspaces } : {})}
                                busy={isResolvingPermission}
                                onResolve={onResolvePermission}
                            />
                        </UtilityDetails>

                        {diffCheckpointPanel ? (
                            <UtilityDetails title='Checkpoints' summary='Checkpoint and diff recovery data.'>
                                {diffCheckpointPanel}
                            </UtilityDetails>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

