import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SessionWorkspacePanel } from '@/web/components/conversation/sessions/sessionWorkspacePanel';
import {
    buildWorkspaceShellProjection,
    type SessionWorkspacePanelProps,
} from '@/web/components/conversation/sessions/workspace/workspacePanelModel';

import { kiloFrontierModelId } from '@/shared/kiloModels';

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

const sessionWorkspacePanelProps: SessionWorkspacePanelProps = {
    profileId: 'profile_default',
    profiles: [{ id: 'profile_default', name: 'Local Default' }],
    selectedProfileId: 'profile_default',
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
    pendingImages: [],
    pendingTextFiles: [],
    readyComposerAttachments: [],
    hasBlockingPendingAttachments: false,
    isCreatingSession: false,
    isStartingRun: false,
    isResolvingPermission: false,
    canCreateSession: true,
    selectedProviderId: 'kilo',
    selectedModelId: kiloFrontierModelId,
    topLevelTab: 'chat',
    activeModeKey: 'chat',
    modes: [],
    reasoningEffort: 'medium',
    runtimeOptions: {
        reasoning: {
            effort: 'medium',
            summary: 'auto',
            includeEncrypted: false,
        },
        cache: {
            strategy: 'auto',
        },
        transport: {
            family: 'auto',
        },
    },
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
    attachedRules: [],
    missingAttachedRuleKeys: [],
    attachedSkills: [],
    missingAttachedSkillKeys: [],
    onSelectSession: vi.fn(),
    onSelectRun: vi.fn(),
    onProfileChange: vi.fn(),
    onProviderChange: vi.fn(),
    onModelChange: vi.fn(),
    onReasoningEffortChange: vi.fn(),
    onModeChange: vi.fn(),
    onCreateSession: vi.fn(),
    onPromptEdited: vi.fn(),
    onAddFiles: vi.fn(),
    onRemovePendingImage: vi.fn(),
    onRemovePendingTextFile: vi.fn(),
    onRetryPendingImage: vi.fn(),
    onSubmitPrompt: vi.fn(),
    onResolvePermission: vi.fn(),
};

describe('session workspace panel layout', () => {
    it('uses compact selectors and keeps the inspector closed by default', () => {
        const html = renderToStaticMarkup(createElement(SessionWorkspacePanel, sessionWorkspacePanelProps));

        expect(html).toContain('Workspace selection');
        expect(html).toContain('Show Inspector');
        expect(html).toContain('Selected thread');
        expect(html).toContain('Thread');
        expect(html).toContain('Run');
        expect(html).toContain('2 turns · completed');
        expect(html).not.toContain('inspector');
    });

    it('builds a workspace shell projection from panel inputs', () => {
        const projection = buildWorkspaceShellProjection(sessionWorkspacePanelProps);

        expect(projection.header.selectedSession?.id).toBe('sess_default');
        expect(projection.header.selectedRun?.id).toBe('run_default');
        expect(projection.inspector.sections.map((section) => section.id)).toEqual([
            'workspace-status',
            'run-changes',
            'pending-permissions',
        ]);
    });
});
