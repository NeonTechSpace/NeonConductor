import { useState } from 'react';

import type { MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import { ComposerActionPanel } from '@/web/components/conversation/panels/composerActionPanel';
import { MessageTimelinePanel } from '@/web/components/conversation/panels/messageTimelinePanel';
import { PendingPermissionsPanel } from '@/web/components/conversation/panels/pendingPermissionsPanel';
import { RunChangeSummaryPanel } from '@/web/components/conversation/panels/runChangeSummaryPanel';
import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';
import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { WorkspaceInspector } from '@/web/components/conversation/sessions/workspaceInspector';
import type {
    WorkspaceInspectorSection,
    WorkspaceStripChip,
} from '@/web/components/conversation/sessions/workspaceShellModel';
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

function describeSession(session: SessionSummaryRecord): WorkspaceStripChip {
    const label =
        session.kind === 'worktree'
            ? 'Worktree session'
            : session.kind === 'local'
              ? 'Workspace session'
              : 'Playground session';

    return {
        id: session.id,
        label,
        detail: `${session.runStatus.replaceAll('_', ' ')} · ${String(session.turnCount)} turns`,
        selected: false,
    };
}

function describeRun(run: RunRecord): WorkspaceStripChip {
    const timestamp = new Date(run.updatedAt);

    return {
        id: run.id,
        label: run.status.replaceAll('_', ' '),
        detail: Number.isNaN(timestamp.getTime()) ? run.id : timestamp.toLocaleTimeString(),
        selected: false,
    };
}

function StripChip({
    item,
    onClick,
    onPointerIntent,
}: {
    item: WorkspaceStripChip;
    onClick: () => void;
    onPointerIntent?: () => void;
}) {
    return (
        <button
            type='button'
            className={`min-w-[180px] shrink-0 rounded-2xl border px-3 py-2 text-left transition-colors ${
                item.selected
                    ? 'border-primary bg-primary/10 shadow-sm'
                    : 'border-border bg-background/80 hover:bg-accent'
            }`}
            onMouseEnter={onPointerIntent}
            onFocus={onPointerIntent}
            onClick={onClick}>
            <p className='truncate text-sm font-medium'>{item.label}</p>
            <p className='text-muted-foreground mt-1 text-xs'>{item.detail}</p>
        </button>
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
    const [isInspectorOpen, setIsInspectorOpen] = useState(false);
    const latestRun = runs.find((run) => run.id === selectedRunId) ?? runs.at(0);
    const pendingPermissionCount = pendingPermissions.length;
    const isPlanPrimarySurface = Boolean(modePanel) && (topLevelTab === 'orchestrator' || activeModeKey === 'plan');
    const sessionChips = sessions.map((session) => ({
        ...describeSession(session),
        selected: selectedSessionId === session.id,
    }));
    const runChips = runs.map((run) => ({
        ...describeRun(run),
        selected: selectedRunId === run.id,
    }));
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
            description: 'Approvals stay out of the main composer until an action needs them.',
            badge:
                pendingPermissionCount > 0
                    ? `${String(pendingPermissionCount)} waiting`
                    : 'None waiting',
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
            className={`grid min-h-0 flex-1 min-w-0 ${
                isInspectorOpen ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'grid-cols-1'
            }`}>
            <div className='bg-background/20 flex min-h-0 min-w-0 flex-col overflow-hidden'>
                <div className='border-border/70 bg-card/30 border-b px-4 py-4'>
                    <div className='flex flex-wrap items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='text-sm font-semibold'>Workspace</p>
                            <p className='text-muted-foreground text-xs'>
                                Keep the timeline and composer primary. Secondary execution detail lives in the inspector.
                            </p>
                        </div>
                        <div className='flex flex-wrap items-center gap-2'>
                            {compactConnectionLabel ? (
                                <span className='border-border bg-background text-muted-foreground rounded-full border px-3 py-1 text-xs'>
                                    {compactConnectionLabel}
                                </span>
                            ) : null}
                            {routingBadge ? (
                                <span className='border-border bg-background text-muted-foreground rounded-full border px-3 py-1 text-xs'>
                                    {routingBadge}
                                </span>
                            ) : null}
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

                    <div className='mt-4 space-y-4'>
                        <div className='flex items-center justify-between gap-3'>
                            <div className='min-w-0'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                    Sessions
                                </p>
                                <p className='text-muted-foreground mt-1 text-xs'>
                                    Sessions stay close, but they no longer own a permanent side rail.
                                </p>
                            </div>
                            <Button
                                type='button'
                                size='sm'
                                disabled={!canCreateSession || isCreatingSession}
                                onClick={onCreateSession}>
                                New session
                            </Button>
                        </div>

                        <div className='flex gap-2 overflow-x-auto pb-1'>
                            {sessionChips.length > 0 ? (
                                sessionChips.map((sessionChip) => (
                                    <StripChip
                                        key={sessionChip.id}
                                        item={sessionChip}
                                        onPointerIntent={() => {
                                            if (!isEntityId(sessionChip.id, 'sess')) {
                                                return;
                                            }
                                            void utils.session.status.prefetch({
                                                profileId,
                                                sessionId: sessionChip.id,
                                            });
                                            void utils.session.listRuns.prefetch({
                                                profileId,
                                                sessionId: sessionChip.id,
                                            });
                                        }}
                                        onClick={() => {
                                            onSelectSession(sessionChip.id);
                                        }}
                                    />
                                ))
                            ) : (
                                <div className='border-border bg-background/70 text-muted-foreground rounded-2xl border px-4 py-3 text-sm'>
                                    No sessions for this thread yet.
                                </div>
                            )}
                        </div>

                        {runChips.length > 0 ? (
                            <div className='space-y-2'>
                                <div className='flex items-center justify-between gap-3'>
                                    <div className='min-w-0'>
                                        <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                            Runs
                                        </p>
                                        <p className='text-muted-foreground mt-1 text-xs'>
                                            Recent runs stay in a compact strip instead of a separate panel.
                                        </p>
                                    </div>
                                    {pendingPermissionCount > 0 ? (
                                        <span className='rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-200'>
                                            {String(pendingPermissionCount)} approvals waiting
                                        </span>
                                    ) : null}
                                </div>
                                <div className='flex gap-2 overflow-x-auto pb-1'>
                                    {runChips.map((runChip) => (
                                        <StripChip
                                            key={runChip.id}
                                            item={runChip}
                                            onPointerIntent={() => {
                                                if (!isEntityId(runChip.id, 'run')) {
                                                    return;
                                                }
                                                if (!isEntityId(selectedSessionId, 'sess')) {
                                                    return;
                                                }

                                                void utils.session.listMessages.prefetch({
                                                    profileId,
                                                    sessionId: selectedSessionId,
                                                    runId: runChip.id,
                                                });
                                                void utils.diff.listByRun.prefetch({
                                                    profileId,
                                                    runId: runChip.id,
                                                });
                                                void utils.checkpoint.list.prefetch({
                                                    profileId,
                                                    sessionId: selectedSessionId,
                                                });
                                            }}
                                            onClick={() => {
                                                onSelectRun(runChip.id);
                                            }}
                                        />
                                    ))}
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>

                <div className='flex min-h-0 flex-1 flex-col gap-4 px-4 py-4'>
                    {isPlanPrimarySurface ? (
                        <div className='grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]'>
                            <div className='border-border/70 bg-card/35 min-h-0 min-w-0 overflow-y-auto rounded-[28px] border p-4'>
                                {modePanel}
                            </div>
                            <div className='flex min-h-[280px] min-w-0 flex-col rounded-[28px] border border-border/70 bg-card/35 p-4'>
                                <MessageTimelinePanel
                                    profileId={profileId}
                                    messages={messages}
                                    partsByMessageId={partsByMessageId}
                                    {...(latestRun ? { run: latestRun } : {})}
                                    {...(onEditMessage ? { onEditMessage } : {})}
                                    {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                                />
                            </div>
                        </div>
                    ) : (
                        <>
                            {modePanel ? (
                                <div className='border-border/70 bg-card/35 shrink-0 rounded-[28px] border p-4'>
                                    {modePanel}
                                </div>
                            ) : null}

                            <div className='flex min-h-[320px] min-w-0 flex-1 flex-col rounded-[28px] border border-border/70 bg-card/35 p-4'>
                                <MessageTimelinePanel
                                    profileId={profileId}
                                    messages={messages}
                                    partsByMessageId={partsByMessageId}
                                    {...(latestRun ? { run: latestRun } : {})}
                                    {...(onEditMessage ? { onEditMessage } : {})}
                                    {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                                />
                            </div>
                        </>
                    )}

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
