import type { MessageTimelineEntry } from '@/web/components/conversation/messageTimelineModel';
import { SessionWorkspacePanel } from '@/web/components/conversation/sessionWorkspacePanel';

import type {
    MessagePartRecord,
    MessageRecord,
    PermissionRecord,
    ProviderUsageSummary,
    RunRecord,
    SessionSummaryRecord,
    ThreadListRecord,
} from '@/app/backend/persistence/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

import type { ReactNode } from 'react';

interface ConversationShellWorkspaceSectionProps {
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
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string | undefined;
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
    providerOptions: Array<{ id: string; label: string; authState: string }>;
    modelOptions: Array<{ id: string; label: string; price?: number; latency?: number; tps?: number }>;
    runErrorMessage: string | undefined;
    modePanel: ReactNode;
    attachedSkillsPanel?: ReactNode;
    diffCheckpointPanel?: ReactNode;
    onSelectSession: (sessionId: string) => void;
    onSelectRun: (runId: string) => void;
    onProviderChange: (providerId: string) => void;
    onModelChange: (modelId: string) => void;
    onCreateSession: () => void;
    onPromptChange: (prompt: string) => void;
    onSubmitPrompt: () => void;
    onResolvePermission: (
        requestId: PermissionRecord['id'],
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace',
        selectedApprovalResource?: string
    ) => void;
    onEditMessage: (entry: MessageTimelineEntry) => void;
    onBranchFromMessage: (entry: MessageTimelineEntry) => void;
}

export function ConversationShellWorkspaceSection({
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
    providerOptions,
    modelOptions,
    runErrorMessage,
    modePanel,
    attachedSkillsPanel,
    diffCheckpointPanel,
    onSelectSession,
    onSelectRun,
    onProviderChange,
    onModelChange,
    onCreateSession,
    onPromptChange,
    onSubmitPrompt,
    onResolvePermission,
    onEditMessage,
    onBranchFromMessage,
}: ConversationShellWorkspaceSectionProps) {
    return (
        <section className='flex min-h-0 flex-1 flex-col'>
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
                isCreatingSession={isCreatingSession}
                isStartingRun={isStartingRun}
                isResolvingPermission={isResolvingPermission}
                canCreateSession={canCreateSession}
                selectedProviderId={selectedProviderId}
                selectedModelId={selectedModelId}
                {...(routingBadge !== undefined ? { routingBadge } : {})}
                {...(selectedProviderStatus ? { selectedProviderStatus } : {})}
                {...(selectedModelLabel ? { selectedModelLabel } : {})}
                {...(selectedUsageSummary ? { selectedUsageSummary } : {})}
                {...(registrySummary ? { registrySummary } : {})}
                {...(agentContextSummary ? { agentContextSummary } : {})}
                providerOptions={providerOptions}
                modelOptions={modelOptions}
                runErrorMessage={runErrorMessage}
                onSelectSession={onSelectSession}
                onSelectRun={onSelectRun}
                onProviderChange={onProviderChange}
                onModelChange={onModelChange}
                onCreateSession={onCreateSession}
                onPromptChange={onPromptChange}
                onSubmitPrompt={onSubmitPrompt}
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
