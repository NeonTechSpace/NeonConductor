import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/web/components/settings/profileSettings/useProfileSettingsController', () => ({
    useProfileSettingsController: () => ({
        selection: {
            selectedProfileId: 'profile_default',
            profiles: [{ id: 'profile_default', name: 'Default' }],
            setSelectedProfileId: vi.fn(),
        },
        feedback: {
            message: undefined,
            tone: 'info',
        },
        library: {
            selectedProfile: {
                id: 'profile_default',
                name: 'Default',
                isActive: true,
                createdAt: '2026-03-31T00:00:00.000Z',
                updatedAt: '2026-03-31T00:00:00.000Z',
            },
            renameValue: 'Default',
            newProfileName: '',
            createMutation: { isPending: false },
            renameMutation: { isPending: false },
            duplicateMutation: { isPending: false },
            deleteMutation: { isPending: false },
            setActiveMutation: { isPending: false },
            cannotDeleteLastProfile: false,
            confirmDeleteOpen: false,
            setConfirmDeleteOpen: vi.fn(),
            setRenameValue: vi.fn(),
            setNewProfileName: vi.fn(),
            createProfile: vi.fn(),
            renameProfile: vi.fn(),
            duplicateProfile: vi.fn(),
            activateProfile: vi.fn(),
            deleteProfile: vi.fn(),
        },
        preferences: {
            executionPreset: 'standard',
            editPreference: 'ask',
            threadTitleMode: 'template',
            setExecutionPresetMutation: { isPending: false },
            setEditPreferenceMutation: { isPending: false },
            setThreadTitlePreferenceMutation: { isPending: false },
            setUtilityModelMutation: { isPending: false },
            utilityProviderItems: [{ id: 'openai', label: 'OpenAI' }],
            selectedUtilityProviderId: 'openai',
            utilityModelOptions: [{ id: 'openai/gpt-5-mini', label: 'GPT-5 Mini', providerId: 'openai' }],
            selectedUtilityModelId: 'openai/gpt-5-mini',
            selectedUtilityModelOption: undefined,
            utilityModelSelection: {
                providerId: 'openai',
                modelId: 'openai/gpt-5-mini',
            },
            updateExecutionPreset: vi.fn(),
            updateEditPreference: vi.fn(),
            updateThreadTitleMode: vi.fn(),
            setUtilityProviderId: vi.fn(),
            setUtilityModelId: vi.fn(),
            saveUtilityModel: vi.fn(),
            clearUtilityModel: vi.fn(),
        },
        reset: {
            factoryResetMutation: { isPending: false, error: null },
        },
    }),
}));

vi.mock('@/web/components/settings/profileSettings/profileCreateSection', () => ({
    ProfileCreateSection: () => <div>create section</div>,
}));

vi.mock('@/web/components/settings/shared/settingsSelectionRail', () => ({
    SettingsSelectionRail: () => <div>settings rail</div>,
}));

vi.mock('@/web/components/settings/shared/settingsFeedbackBanner', () => ({
    SettingsFeedbackBanner: () => null,
}));

vi.mock('@/web/components/modelSelection/modelPicker', () => ({
    ModelPicker: () => <div>model picker</div>,
}));

vi.mock('@/web/components/ui/button', () => ({
    Button: (props: any) => <button>{props.children}</button>,
}));

vi.mock('@/web/components/ui/confirmDialog', () => ({
    ConfirmDialog: () => null,
}));

import { ProfileSettingsView } from '@/web/components/settings/profileSettingsView';

describe('ProfileSettingsView', () => {
    it('renders the Utility AI subsection and does not render the removed raw naming-model field', () => {
        const html = renderToStaticMarkup(
            <ProfileSettingsView activeProfileId='profile_default' onProfileActivated={vi.fn()} subsection='utility' />
        );

        expect(html).toContain('Utility AI');
        expect(html).toContain('Save Utility AI');
        expect(html).not.toContain('Interim AI model override');
        expect(html).not.toContain('threadTitleAiModel');
    });

    it('renders naming mode copy without the removed raw model selector', () => {
        const html = renderToStaticMarkup(
            <ProfileSettingsView activeProfileId='profile_default' onProfileActivated={vi.fn()} subsection='naming' />
        );

        expect(html).toContain('Conversation Naming');
        expect(html).toContain('Template + optional AI refine');
        expect(html).not.toContain('Save AI Model');
        expect(html).not.toContain('Interim AI model override');
    });
});
