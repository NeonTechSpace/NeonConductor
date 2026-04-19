import { describe, expect, it } from 'vitest';

import {
    createEmptyCustomModeEditorDraft,
    createDefaultPreparedContextModeOverridesSnapshot,
    formatRuntimeProfileLabel,
    getModeRoleTemplateOptions,
    resolveCustomModeEditorTopLevelTab,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';

describe('modesInstructionsControllerShared', () => {
    it('initializes custom-mode drafts with role-driven defaults', () => {
        const draft = createEmptyCustomModeEditorDraft('workspace');

        expect(draft).toEqual({
            kind: 'create',
            scope: 'workspace',
            slug: '',
            name: '',
            authoringRole: 'chat',
            roleTemplate: 'chat/default',
            description: '',
            roleDefinition: '',
            customInstructions: '',
            whenToUse: '',
            tagsText: '',
            promptLayerOverrides: createDefaultPreparedContextModeOverridesSnapshot(),
            deleteConfirmed: false,
            sourceText: '',
        });
    });

    it('resolves the top-level tab from the selected role template for drafts', () => {
        expect(
            resolveCustomModeEditorTopLevelTab({
                kind: 'create',
                scope: 'global',
                slug: '',
                name: '',
                authoringRole: 'single_task_agent',
                roleTemplate: 'single_task_agent/review',
                description: '',
                roleDefinition: '',
                customInstructions: '',
                whenToUse: '',
                tagsText: '',
                promptLayerOverrides: createDefaultPreparedContextModeOverridesSnapshot(),
                deleteConfirmed: false,
                sourceText: '',
            })
        ).toBe('agent');
    });

    it('lists only templates for the selected authoring role', () => {
        expect(getModeRoleTemplateOptions('orchestrator_worker_agent').map((template) => template.roleTemplate)).toEqual([
            'orchestrator_worker_agent/apply',
            'orchestrator_worker_agent/debug',
        ]);
    });

    it('formats runtime profile labels clearly', () => {
        expect(formatRuntimeProfileLabel('general')).toBe('General');
        expect(formatRuntimeProfileLabel('read_only_agent')).toBe('Read-Only Agent');
        expect(formatRuntimeProfileLabel('mutating_agent')).toBe('Mutating Agent');
    });
});
