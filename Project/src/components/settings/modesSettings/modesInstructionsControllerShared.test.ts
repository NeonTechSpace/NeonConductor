import { describe, expect, it } from 'vitest';

import {
    createEmptyCustomModeEditorDraft,
    formatRuntimeProfileLabel,
    toggleListValue,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';

describe('modesInstructionsControllerShared', () => {
    it('initializes custom-mode drafts with the new capability metadata defaults', () => {
        const draft = createEmptyCustomModeEditorDraft('workspace');

        expect(draft).toEqual({
            kind: 'create',
            scope: 'workspace',
            topLevelTab: 'chat',
            slug: '',
            name: '',
            description: '',
            roleDefinition: '',
            customInstructions: '',
            whenToUse: '',
            tagsText: '',
            selectedToolCapabilities: [],
            selectedWorkflowCapabilities: [],
            selectedBehaviorFlags: [],
            selectedRuntimeProfile: 'general',
            deleteConfirmed: false,
        });
    });

    it('toggles enum-style list values without duplicates', () => {
        expect(toggleListValue(['planning', 'review'], 'planning')).toEqual(['review']);
        expect(toggleListValue(['planning'], 'review')).toEqual(['planning', 'review']);
    });

    it('formats runtime profile labels clearly', () => {
        expect(formatRuntimeProfileLabel('general')).toBe('General');
        expect(formatRuntimeProfileLabel('read_only_agent')).toBe('Read-Only Agent');
        expect(formatRuntimeProfileLabel('mutating_agent')).toBe('Mutating Agent');
    });
});
