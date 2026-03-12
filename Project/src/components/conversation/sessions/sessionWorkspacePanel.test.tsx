import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({
            session: {
                status: { prefetch: vi.fn() },
                listRuns: { prefetch: vi.fn() },
                listMessages: { prefetch: vi.fn() },
            },
            diff: {
                listByRun: { prefetch: vi.fn() },
            },
            checkpoint: {
                list: { prefetch: vi.fn() },
            },
        }),
    },
}));

vi.mock('@/web/components/conversation/panels/messageTimelinePanel', () => ({
    MessageTimelinePanel: () => <div>timeline</div>,
}));

vi.mock('@/web/components/conversation/panels/composerActionPanel', () => ({
    ComposerActionPanel: () => <div>composer</div>,
}));

vi.mock('@/web/components/conversation/panels/pendingPermissionsPanel', () => ({
    PendingPermissionsPanel: () => <div>permissions</div>,
}));

vi.mock('@/web/components/conversation/panels/runChangeSummaryPanel', () => ({
    RunChangeSummaryPanel: () => <div>changes</div>,
}));

vi.mock('@/web/components/conversation/panels/workspaceStatusPanel', () => ({
    WorkspaceStatusPanel: () => <div>status</div>,
}));

vi.mock('@/web/components/conversation/sessions/workspaceInspector', () => ({
    WorkspaceInspector: () => <aside>inspector</aside>,
}));

import { SessionWorkspacePanel } from '@/web/components/conversation/sessions/sessionWorkspacePanel';

describe('session workspace panel layout', () => {
    it('keeps sessions and runs in compact strips and hides the inspector by default', () => {
        const html = renderToStaticMarkup(
            <SessionWorkspacePanel
                profileId='profile_default'
                sessions={[
                    {
                        id: 'sess_default',
                        profileId: 'profile_default',
                        conversationId: 'conv_default',
                        threadId: 'thr_default',
                        kind: 'local',
                        runStatus: 'completed',
                        turnCount: 2,
                        createdAt: '2026-03-12T09:00:00.000Z',
                        updatedAt: '2026-03-12T09:00:00.000Z',
                    },
                ]}
                runs={[
                    {
                        id: 'run_default',
                        sessionId: 'sess_default',
                        profileId: 'profile_default',
                        prompt: 'Prompt',
                        status: 'completed',
                        createdAt: '2026-03-12T09:00:00.000Z',
                        updatedAt: '2026-03-12T09:30:00.000Z',
                    },
                ]}
                messages={[]}
                partsByMessageId={new Map()}
                selectedSessionId='sess_default'
                selectedRunId='run_default'
                executionPreset='standard'
                workspaceScope={{
                    kind: 'workspace',
                    label: 'Workspace Alpha',
                    absolutePath: 'C:\\WorkspaceAlpha',
                    executionEnvironmentMode: 'local',
                }}
                pendingPermissions={[]}
                prompt=''
                pendingImages={[]}
                isCreatingSession={false}
                isStartingRun={false}
                isResolvingPermission={false}
                canCreateSession
                selectedProviderId='kilo'
                selectedModelId='kilo/auto'
                topLevelTab='chat'
                activeModeKey='chat'
                modes={[]}
                maxImageAttachmentsPerMessage={10}
                canAttachImages={false}
                selectedProviderStatus={{
                    label: 'Kilo',
                    authState: 'authenticated',
                    authMethod: 'device_code',
                }}
                modelOptions={[]}
                runErrorMessage={undefined}
                onSelectSession={vi.fn()}
                onSelectRun={vi.fn()}
                onProviderChange={vi.fn()}
                onModelChange={vi.fn()}
                onModeChange={vi.fn()}
                onCreateSession={vi.fn()}
                onPromptChange={vi.fn()}
                onAddImageFiles={vi.fn()}
                onRemovePendingImage={vi.fn()}
                onRetryPendingImage={vi.fn()}
                onSubmitPrompt={vi.fn()}
                onResolvePermission={vi.fn()}
            />
        );

        expect(html).toContain('Show Inspector');
        expect(html).toContain('Sessions');
        expect(html).toContain('Runs');
        expect(html).not.toContain('Run History');
        expect(html).not.toContain('Workspace Status');
        expect(html).not.toContain('inspector');
    });
});
