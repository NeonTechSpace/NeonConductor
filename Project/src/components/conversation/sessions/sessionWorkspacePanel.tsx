import type { MessageTimelineEntry } from '@/web/components/conversation/messages/messageTimelineModel';
import { ComposerActionPanel } from '@/web/components/conversation/panels/composerActionPanel';
import { MessageTimelinePanel } from '@/web/components/conversation/panels/messageTimelinePanel';
import { PendingPermissionsPanel } from '@/web/components/conversation/panels/pendingPermissionsPanel';
import { RunChangeSummaryPanel } from '@/web/components/conversation/panels/runChangeSummaryPanel';
import { WorkspaceStatusPanel } from '@/web/components/conversation/panels/workspaceStatusPanel';
import { Button } from '@/web/components/ui/button';

import type {
    MessagePartRecord,
    MessageRecord,
    PermissionRecord,
    ProviderUsageSummary,
    RunRecord,
    SessionSummaryRecord,
} from '@/app/backend/persistence/types';
import type { DiffOverview } from '@/app/backend/runtime/contracts';
import type { ResolvedContextState } from '@/app/backend/runtime/contracts';

import type { ReactNode } from 'react';

interface SessionWorkspacePanelProps {
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
    isCreatingSession: boolean;
    isStartingRun: boolean;
    isResolvingPermission: boolean;
    canCreateSession: boolean;
    selectedProviderId: string | undefined;
    selectedModelId: string | undefined;
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
    providerOptions: Array<{ id: string; label: string; authState: string }>;
    modelOptions: Array<{ id: string; label: string; price?: number; latency?: number; tps?: number }>;
    runErrorMessage: string | undefined;
    contextState?: ResolvedContextState;
    contextErrorMessage?: string;
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
    onCreateSession: () => void;
    onPromptChange: (nextPrompt: string) => void;
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

export function SessionWorkspacePanel({
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
    isCreatingSession,
    isStartingRun,
    isResolvingPermission,
    canCreateSession,
    selectedProviderId,
    selectedModelId,
    routingBadge,
    selectedProviderStatus,
    selectedModelLabel,
    selectedUsageSummary,
    registrySummary,
    agentContextSummary,
    runDiffOverview,
    providerOptions,
    modelOptions,
    runErrorMessage,
    contextState,
    contextErrorMessage,
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
    onCreateSession,
    onPromptChange,
    onSubmitPrompt,
    onCompactContext,
    onResolvePermission,
    onEditMessage,
    onBranchFromMessage,
}: SessionWorkspacePanelProps) {
    return (
        <div className='grid min-h-0 flex-1 grid-cols-[280px_1fr]'>
            <aside className='border-border min-h-0 overflow-y-auto border-r p-3'>
                <div className='mb-2 flex justify-end'>
                    <Button
                        type='button'
                        size='sm'
                        disabled={!canCreateSession || isCreatingSession}
                        onClick={onCreateSession}>
                        New Session
                    </Button>
                </div>

                <div className='space-y-2'>
                    {sessions.map((session) => (
                        <button
                            key={session.id}
                            type='button'
                            className={`w-full rounded-md border p-2 text-left ${
                                selectedSessionId === session.id
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-card hover:bg-accent'
                            }`}
                            onClick={() => {
                                onSelectSession(session.id);
                            }}>
                            <p className='text-sm font-medium'>{session.id}</p>
                            <p className='text-muted-foreground text-xs'>
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
            </aside>

            <div className='flex min-h-0 flex-col p-4'>
                <div className='mb-3 flex items-center gap-2 overflow-x-auto pb-1'>
                    {runs.map((run) => (
                        <button
                            key={run.id}
                            type='button'
                            className={`rounded-md border px-2 py-1 text-xs ${
                                selectedRunId === run.id
                                    ? 'border-primary bg-primary/10 text-primary'
                                    : 'border-border bg-card text-foreground'
                            }`}
                            onClick={() => {
                                onSelectRun(run.id);
                            }}>
                            {run.id} · {run.status}
                        </button>
                    ))}
                </div>

                {modePanel}

                {executionEnvironmentPanel}

                <WorkspaceStatusPanel
                    run={runs.find((run) => run.id === selectedRunId) ?? runs.at(-1)}
                    executionPreset={executionPreset}
                    workspaceScope={workspaceScope}
                    provider={selectedProviderStatus}
                    modelLabel={selectedModelLabel}
                    usageSummary={selectedUsageSummary}
                    routingBadge={routingBadge}
                    registrySummary={registrySummary}
                    agentContextSummary={agentContextSummary}
                />

                {attachedSkillsPanel}

                <RunChangeSummaryPanel
                    {...(selectedRunId ? { selectedRunId } : {})}
                    {...(runDiffOverview ? { overview: runDiffOverview } : {})}
                />

                <PendingPermissionsPanel
                    requests={pendingPermissions}
                    {...(permissionWorkspaces ? { workspaceByFingerprint: permissionWorkspaces } : {})}
                    busy={isResolvingPermission}
                    onResolve={onResolvePermission}
                />

                {diffCheckpointPanel}

                <MessageTimelinePanel
                    messages={messages}
                    partsByMessageId={partsByMessageId}
                    {...(onEditMessage ? { onEditMessage } : {})}
                    {...(onBranchFromMessage ? { onBranchFromMessage } : {})}
                />

                <ComposerActionPanel
                    prompt={prompt}
                    disabled={!selectedSessionId}
                    isSubmitting={isStartingRun}
                    selectedProviderId={selectedProviderId}
                    selectedModelId={selectedModelId}
                    {...(routingBadge !== undefined ? { routingBadge } : {})}
                    providerOptions={providerOptions}
                    modelOptions={modelOptions}
                    runErrorMessage={runErrorMessage}
                    {...(contextState ? { contextState } : {})}
                    {...(contextErrorMessage ? { contextErrorMessage } : {})}
                    {...(canCompactContext !== undefined ? { canCompactContext } : {})}
                    {...(isCompactingContext !== undefined ? { isCompactingContext } : {})}
                    onProviderChange={onProviderChange}
                    onModelChange={onModelChange}
                    onPromptChange={onPromptChange}
                    onSubmitPrompt={onSubmitPrompt}
                    {...(onCompactContext ? { onCompactContext } : {})}
                />
            </div>
        </div>
    );
}
