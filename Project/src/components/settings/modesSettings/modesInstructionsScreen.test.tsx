import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
    createDefaultPreparedContextModeOverridesSnapshot,
    createDefaultPreparedContextProfileDefaultsSnapshot,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';

vi.mock('@/web/components/settings/modesSettings/useModesInstructionsSettingsController', () => ({
    useModesInstructionsSettingsController: () => ({
        feedback: {
            message: undefined,
            tone: 'info',
            clear: vi.fn(),
        },
        query: {
            isLoading: false,
            data: {
                settings: {},
            },
        },
        workspace: {
            fingerprint: 'wsf_modes_screen',
            selectedLabel: 'Workspace Root',
        },
        viewModel: {
            promptLayers: {
                appGlobal: {
                    title: 'App-Scope Global Instructions',
                    description: 'App-level instructions.',
                    value: '',
                    isSaving: false,
                },
                profileGlobal: {
                    title: 'Profile-Scope Global Instructions',
                    description: 'Profile-level instructions.',
                    value: '',
                    isSaving: false,
                },
                topLevel: [
                    {
                        topLevelTab: 'chat',
                        title: 'Chat Instructions',
                        description: 'Chat instructions.',
                        warning: 'Chat warning.',
                        value: '',
                        isSaving: false,
                    },
                    {
                        topLevelTab: 'agent',
                        title: 'Agent Instructions',
                        description: 'Agent instructions.',
                        warning: 'Agent warning.',
                        value: '',
                        isSaving: false,
                    },
                    {
                        topLevelTab: 'orchestrator',
                        title: 'Orchestrator Instructions',
                        description: 'Orchestrator instructions.',
                        warning: 'Orchestrator warning.',
                        value: '',
                        isSaving: false,
                    },
                ],
            },
            builtInModeSections: [
                {
                    topLevelTab: 'agent',
                    title: 'Agent Modes',
                    description: 'Built-in agent modes.',
                    cards: [
                        {
                            topLevelTab: 'agent',
                            modeKey: 'code',
                            label: 'Agent Code',
                            description: 'Built-in agent code mode.',
                            warning: 'Editing this mode is risky.',
                            roleDefinition: '',
                            customInstructions: '',
                            hasOverride: false,
                            authoringRole: 'single_task_agent',
                            roleTemplate: 'single_task_agent/apply',
                            internalModelRole: 'apply',
                            toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell'],
                            workflowCapabilities: ['artifact_view'],
                            behaviorFlags: ['workspace_mutating'],
                            runtimeProfile: 'mutating_agent',
                            promptLayerOverrides: createDefaultPreparedContextModeOverridesSnapshot(),
                        },
                    ],
                },
            ],
            builtInToolMetadata: {
                title: 'Built-In Tool Metadata',
                description: 'Tool metadata.',
                items: [
                    {
                        toolId: 'write_file',
                        label: 'Write File',
                        description: 'Create a file.',
                        defaultDescription: 'Create a file.',
                        isModified: false,
                    },
                ],
            },
            modeLibrary: {
                title: 'Live Mode Library',
                description: 'Live registry-backed modes after draft promotion.',
                global: {
                    chat: [
                        {
                            topLevelTab: 'chat',
                            modeKey: 'review',
                            label: 'Global Chat Review',
                            authoringRole: 'single_task_agent',
                            roleTemplate: 'single_task_agent/review',
                            internalModelRole: 'apply',
                            delegatedOnly: false,
                            sessionSelectable: true,
                            description: 'Global chat review mode',
                            whenToUse: 'Use when a conversation needs a strict review pass.',
                            tags: ['quality', 'review'],
                            promptLayerOverrides: createDefaultPreparedContextModeOverridesSnapshot(),
                            toolCapabilities: ['filesystem_read', 'mcp'],
                            workflowCapabilities: ['review', 'artifact_view'],
                            behaviorFlags: ['approval_gated', 'artifact_producing'],
                            runtimeProfile: 'reviewer',
                        },
                    ],
                    agent: [],
                    orchestrator: [],
                },
                workspace: {
                    chat: [],
                    agent: [],
                    orchestrator: [],
                },
                hasWorkspaceScope: true,
                selectedWorkspaceLabel: 'Workspace Root',
            },
        },
        appGlobal: {
            value: '',
            isSaving: false,
            setValue: vi.fn(),
            save: vi.fn(),
            reset: vi.fn(),
        },
        profileGlobal: {
            value: '',
            isSaving: false,
            setValue: vi.fn(),
            save: vi.fn(),
            reset: vi.fn(),
        },
        preparedContextDefaults: {
            value: createDefaultPreparedContextProfileDefaultsSnapshot(),
            isSaving: false,
            setValue: vi.fn(),
            save: vi.fn(),
            reset: vi.fn(),
        },
        topLevel: {
            isSaving: false,
            getValue: () => '',
            setValue: vi.fn(),
            save: vi.fn(),
            reset: vi.fn(),
        },
        builtInModes: {
            isSaving: false,
            setPromptField: vi.fn(),
            setPromptLayerOverride: vi.fn(),
            save: vi.fn(),
            reset: vi.fn(),
        },
        builtInToolMetadata: {
            isSaving: false,
            setDescription: vi.fn(),
            save: vi.fn(),
            reset: vi.fn(),
        },
        customModes: {
            global: {
                chat: [],
                agent: [],
                orchestrator: [],
            },
            workspace: {
                chat: [],
                agent: [],
                orchestrator: [],
            },
            delegatedWorkerModes: {
                global: [
                    {
                        topLevelTab: 'agent',
                        modeKey: 'delegated-debug',
                        label: 'Delegated Debug Worker',
                        authoringRole: 'orchestrator_worker_agent',
                        roleTemplate: 'orchestrator_worker_agent/debug',
                        internalModelRole: 'apply',
                        delegatedOnly: true,
                        sessionSelectable: false,
                        description: 'Delegated worker mode',
                        promptLayerOverrides: createDefaultPreparedContextModeOverridesSnapshot(),
                        toolCapabilities: ['filesystem_read', 'filesystem_write', 'shell', 'mcp', 'code_runtime'],
                        workflowCapabilities: ['artifact_view'],
                        behaviorFlags: ['workspace_mutating', 'checkpoint_eligible', 'artifact_producing'],
                        runtimeProfile: 'mutating_agent',
                    },
                ],
                workspace: [],
            },
            modeDrafts: [
                {
                    id: 'mdr_review',
                    profileId: 'profile_default',
                    scope: 'global',
                    sourceKind: 'portable_json_v2',
                    mode: {
                        slug: 'review',
                        name: 'Draft Review',
                        authoringRole: 'single_task_agent',
                        roleTemplate: 'single_task_agent/review',
                    },
                    validationState: 'valid',
                    validationErrors: [],
                    createdAt: '2026-04-19T10:00:00.000Z',
                    updatedAt: '2026-04-19T10:00:00.000Z',
                },
            ],
            editor: {
                draft: {
                    kind: 'draft',
                    draftId: 'mdr_review',
                    scope: 'global',
                    slug: 'review',
                    name: 'Draft Review',
                    authoringRole: 'single_task_agent',
                    roleTemplate: 'single_task_agent/review',
                    description: 'Draft review mode',
                    roleDefinition: 'Act as a precise reviewer.',
                    customInstructions: 'Review the active conversation carefully.',
                    whenToUse: 'Use when a conversation needs a strict review pass.',
                    tagsText: 'quality, review',
                    promptLayerOverrides: createDefaultPreparedContextModeOverridesSnapshot(),
                    deleteConfirmed: false,
                    sourceText: 'Imported from JSON.',
                    validationState: 'valid',
                    validationErrors: [],
                },
                isLoading: false,
                isSaving: false,
                hasWorkspaceScope: true,
                selectedWorkspaceLabel: 'Workspace Root',
                openCreate: vi.fn(),
                openEdit: vi.fn(),
                openDraft: vi.fn(),
                openDelete: vi.fn(),
                close: vi.fn(),
                setScope: vi.fn(),
                setAuthoringRole: vi.fn(),
                setRoleTemplate: vi.fn(),
                setField: vi.fn(),
                setPromptLayerOverride: vi.fn(),
                setDeleteConfirmed: vi.fn(),
                save: vi.fn(),
                deleteMode: vi.fn(),
                validateDraft: vi.fn(),
                applyDraft: vi.fn(),
                draftOverwriteConfirmed: false,
                setDraftOverwriteConfirmed: vi.fn(),
            },
            importDraft: {
                jsonText: '',
                scope: 'global',
                topLevelTab: 'chat',
                hasWorkspaceScope: true,
                selectedWorkspaceLabel: 'Workspace Root',
            },
            exportState: {
                jsonText: '',
                selectedLabel: undefined,
                loadExportJson: vi.fn(),
            },
            isImporting: false,
            isExporting: false,
            isDraftActionPending: false,
            setImportJsonText: vi.fn(),
            setImportScope: vi.fn(),
            setImportTopLevelTab: vi.fn(),
            importMode: vi.fn(),
            exportMode: vi.fn(),
            copyExportJson: vi.fn(),
            validateDraft: vi.fn(),
            applyDraft: vi.fn(),
            discardDraft: vi.fn(),
        },
    }),
}));

import { ModesInstructionsScreen } from '@/web/components/settings/modesSettings/modesInstructionsScreen';

describe('modes instructions screen', () => {
    it('renders draft-first mode authoring, draft review, and delegated-worker inventory', () => {
        const html = renderToStaticMarkup(
            createElement(ModesInstructionsScreen, {
                profileId: 'profile_default',
                workspaceFingerprint: 'wsf_modes_screen',
                selectedWorkspaceLabel: 'Workspace Root',
            })
        );

        expect(html).toContain('Built-In Mode Prompts');
        expect(html).toContain('Show Advanced Tool Settings');
        expect(html).toContain('Live Mode Library');
        expect(html).toContain('New Global Draft');
        expect(html).toContain('New Workspace Draft');
        expect(html).toContain('Review Mode Draft');
        expect(html).toContain('Draft Validation');
        expect(html).toContain('Import Portable Mode JSON To Draft');
        expect(html).toContain('authoringRole');
        expect(html).toContain('roleTemplate');
        expect(html).toContain('Export Portable Mode JSON');
        expect(html).toContain('Mode Draft Review');
        expect(html).toContain('Draft Review');
        expect(html).toContain('Delegated Worker Modes');
        expect(html).toContain('Delegated Debug Worker');
        expect(html).toContain('Global Chat Review');
        expect(html).toContain('Load Export JSON');
        expect(html).toContain('Apply Draft');
        expect(html).toContain('Discard Draft');
    });
});
