import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/conversation/panels/messageFlowPanel', () => ({
    MessageFlowPanel: () => createElement('div', undefined, 'timeline'),
}));

vi.mock('@/web/components/conversation/panels/composerActionPanel', () => ({
    ComposerActionPanel: () => createElement('div', undefined, 'composer'),
}));

vi.mock('@/web/components/conversation/panels/pendingPermissionsPanel', () => ({
    PendingPermissionsPanel: () => createElement('div', undefined, 'permissions'),
}));

vi.mock('@/web/components/conversation/panels/runChangeSummaryPanel', () => ({
    RunChangeSummaryPanel: () => createElement('div', undefined, 'changes'),
}));

vi.mock('@/web/components/conversation/panels/workspaceStatusPanel', () => ({
    WorkspaceStatusPanel: () => createElement('div', undefined, 'status'),
}));

vi.mock('@/web/components/conversation/sessions/workspaceInspector', () => ({
    WorkspaceInspector: () => createElement('aside', undefined, 'inspector'),
}));

import { SessionWorkspacePanel } from '@/web/components/conversation/sessions/sessionWorkspacePanel';

describe('session workspace panel layout', () => {
    it('uses compact selectors and keeps the inspector closed by default', () => {
        const html = renderToStaticMarkup(
            createElement(SessionWorkspacePanel, {
                profileId: 'profile_default',
                sessions: [
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
                ],
                runs: [
                    {
                        id: 'run_default',
                        sessionId: 'sess_default',
                        profileId: 'profile_default',
                        prompt: 'Prompt',
                        status: 'completed',
                        createdAt: '2026-03-12T09:00:00.000Z',
                        updatedAt: '2026-03-12T09:30:00.000Z',
                    },
                ],
                messages: [],
                partsByMessageId: new Map(),
                selectedSessionId: 'sess_default',
                selectedRunId: 'run_default',
                executionPreset: 'standard',
                workspaceScope: {
                    kind: 'workspace',
                    label: 'Workspace Alpha',
                    absolutePath: 'C:\\WorkspaceAlpha',
                    executionEnvironmentMode: 'local',
                },
                pendingPermissions: [],
                prompt: '',
                pendingImages: [],
                isCreatingSession: false,
                isStartingRun: false,
                isResolvingPermission: false,
                canCreateSession: true,
                selectedProviderId: 'kilo',
                selectedModelId: 'kilo/auto',
                topLevelTab: 'chat',
                activeModeKey: 'chat',
                modes: [],
                reasoningEffort: 'medium',
                selectedModelSupportsReasoning: true,
                maxImageAttachmentsPerMessage: 10,
                canAttachImages: false,
                selectedProviderStatus: {
                    label: 'Kilo',
                    authState: 'authenticated',
                    authMethod: 'device_code',
                },
                modelOptions: [],
                runErrorMessage: undefined,
                onSelectSession: vi.fn(),
                onSelectRun: vi.fn(),
                onProviderChange: vi.fn(),
                onModelChange: vi.fn(),
                onReasoningEffortChange: vi.fn(),
                onModeChange: vi.fn(),
                onCreateSession: vi.fn(),
                onPromptChange: vi.fn(),
                onAddImageFiles: vi.fn(),
                onRemovePendingImage: vi.fn(),
                onRetryPendingImage: vi.fn(),
                onSubmitPrompt: vi.fn(),
                onResolvePermission: vi.fn(),
            })
        );

        expect(html).toContain('Show Inspector');
        expect(html).toContain('Session');
        expect(html).toContain('Run focus');
        expect(html).toContain('Conversation flow');
        expect(html).not.toContain('inspector');
    });
});
