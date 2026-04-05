import {
    APP_SETTINGS_SUBSECTIONS,
    CONTEXT_SETTINGS_SUBSECTIONS,
    KILO_SETTINGS_SUBSECTIONS,
    MODES_SETTINGS_SUBSECTIONS,
    PROFILE_SETTINGS_SUBSECTIONS,
    REGISTRY_SETTINGS_SUBSECTIONS,
    SETTINGS_PRIMARY_SECTIONS,
    type AppSettingsSubsectionId,
    type ContextSettingsSubsectionId,
    type KiloSettingsSubsectionId,
    type ModesSettingsSubsectionId,
    type ProfileSettingsSubsectionId,
    type RegistrySettingsSubsectionId,
    type SettingsPrimarySectionDefinition,
    type SettingsPrimarySectionId,
    type SettingsSelection,
    type SettingsSubsectionDefinition,
} from '@/web/components/settings/settingsNavigation';

import type { RuntimeProviderId } from '@/shared/contracts';

export interface SettingsWorkspacePrimarySectionGroup {
    id: 'kilo' | 'general';
    title: string;
    sections: SettingsPrimarySectionDefinition[];
}

export interface SettingsWorkspaceNavigationModel {
    primaryGroups: SettingsWorkspacePrimarySectionGroup[];
    selectedSection: SettingsPrimarySectionDefinition;
    subsections: ReadonlyArray<SettingsSubsectionDefinition<string>>;
}

export function getGroupedSettingsPrimarySections(): { kiloSections: SettingsPrimarySectionDefinition[]; generalSections: SettingsPrimarySectionDefinition[] } {
    return {
        kiloSections: SETTINGS_PRIMARY_SECTIONS.filter((section) => section.group === 'kilo'),
        generalSections: SETTINGS_PRIMARY_SECTIONS.filter((section) => section.group === 'general'),
    };
}

export function getSettingsPrimarySectionDefinition(
    sectionId: SettingsPrimarySectionId
): SettingsPrimarySectionDefinition {
    const selectedSection = SETTINGS_PRIMARY_SECTIONS.find((section) => section.id === sectionId);
    const fallbackSection = SETTINGS_PRIMARY_SECTIONS[0];
    if (!fallbackSection) {
        throw new Error('Expected at least one settings primary section.');
    }

    return selectedSection ?? fallbackSection;
}

export function getSettingsSubsectionsForSection(
    sectionId: SettingsPrimarySectionId
): ReadonlyArray<SettingsSubsectionDefinition<string>> {
    switch (sectionId) {
        case 'kilo':
            return KILO_SETTINGS_SUBSECTIONS;
        case 'modes':
            return MODES_SETTINGS_SUBSECTIONS;
        case 'profiles':
            return PROFILE_SETTINGS_SUBSECTIONS;
        case 'context':
            return CONTEXT_SETTINGS_SUBSECTIONS;
        case 'registry':
            return REGISTRY_SETTINGS_SUBSECTIONS;
        case 'app':
            return APP_SETTINGS_SUBSECTIONS;
        case 'providers':
            return [];
    }
}

export function createSettingsSelection(
    sectionId: SettingsPrimarySectionId,
    subsectionId: string
): SettingsSelection {
    switch (sectionId) {
        case 'kilo':
            return { section: 'kilo', subsection: subsectionId as KiloSettingsSubsectionId };
        case 'modes':
            return { section: 'modes', subsection: subsectionId as ModesSettingsSubsectionId };
        case 'providers':
            return { section: 'providers', subsection: subsectionId as RuntimeProviderId };
        case 'profiles':
            return { section: 'profiles', subsection: subsectionId as ProfileSettingsSubsectionId };
        case 'context':
            return { section: 'context', subsection: subsectionId as ContextSettingsSubsectionId };
        case 'registry':
            return { section: 'registry', subsection: subsectionId as RegistrySettingsSubsectionId };
        case 'app':
            return { section: 'app', subsection: subsectionId as AppSettingsSubsectionId };
    }
}

export function buildSettingsWorkspaceNavigationModel(selection: SettingsSelection): SettingsWorkspaceNavigationModel {
    const { kiloSections, generalSections } = getGroupedSettingsPrimarySections();

    return {
        primaryGroups: [
            {
                id: 'kilo',
                title: 'Kilo',
                sections: kiloSections,
            },
            {
                id: 'general',
                title: 'General',
                sections: generalSections,
            },
        ],
        selectedSection: getSettingsPrimarySectionDefinition(selection.section),
        subsections: getSettingsSubsectionsForSection(selection.section),
    };
}
