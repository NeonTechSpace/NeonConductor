import type { RuntimeProviderId } from '@/shared/contracts';

export type SettingsPrimarySectionId = 'kilo' | 'providers' | 'profiles' | 'context' | 'registry' | 'app';

export type KiloSettingsSubsectionId = 'account' | 'models' | 'routing' | 'instructions' | 'marketplace';
export type ProfileSettingsSubsectionId = 'management' | 'execution' | 'naming' | 'utility';
export type ContextSettingsSubsectionId = 'workspace' | 'budgeting';
export type RegistrySettingsSubsectionId = 'rules' | 'skills' | 'modes' | 'diagnostics';
export type AppSettingsSubsectionId = 'privacy' | 'maintenance';

export type SettingsSelection =
    | { section: 'kilo'; subsection: KiloSettingsSubsectionId }
    | { section: 'providers'; subsection: RuntimeProviderId }
    | { section: 'profiles'; subsection: ProfileSettingsSubsectionId }
    | { section: 'context'; subsection: ContextSettingsSubsectionId }
    | { section: 'registry'; subsection: RegistrySettingsSubsectionId }
    | { section: 'app'; subsection: AppSettingsSubsectionId };

export interface SettingsPrimarySectionDefinition {
    id: SettingsPrimarySectionId;
    label: string;
    description: string;
    group: 'kilo' | 'general';
}

export interface SettingsSubsectionDefinition<TId extends string> {
    id: TId;
    label: string;
    description: string;
    availability: 'available' | 'planned';
}

export const SETTINGS_PRIMARY_SECTIONS: ReadonlyArray<SettingsPrimarySectionDefinition> = [
    {
        id: 'kilo',
        label: 'Kilo',
        description: 'Product-default account, gateway routing, and shipped mode instruction controls.',
        group: 'kilo',
    },
    {
        id: 'providers',
        label: 'Providers & Models',
        description: 'Shared provider management with Kilo Gateway pinned first and direct providers below.',
        group: 'general',
    },
    {
        id: 'profiles',
        label: 'Profiles',
        description: 'Profile lifecycle, execution defaults, and conversation naming preferences.',
        group: 'general',
    },
    {
        id: 'context',
        label: 'Context & Limits',
        description: 'Workspace defaults and profile-specific context budgeting controls.',
        group: 'general',
    },
    {
        id: 'registry',
        label: 'Skills & Registry',
        description: 'Inspect resolved rules, skills, modes, and registry discovery state.',
        group: 'general',
    },
    {
        id: 'app',
        label: 'App',
        description: 'Privacy and destructive maintenance actions that apply across the app.',
        group: 'general',
    },
];

export const KILO_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<KiloSettingsSubsectionId>> = [
    {
        id: 'account',
        label: 'Account & Access',
        description: 'Sign in, inspect account state, and manage organization membership.',
        availability: 'available',
    },
    {
        id: 'models',
        label: 'Gateway Models',
        description: 'Choose default Kilo models and specialist defaults.',
        availability: 'available',
    },
    {
        id: 'routing',
        label: 'Routing',
        description: 'Control Kilo routing when a selected model supports multiple upstream providers.',
        availability: 'available',
    },
    {
        id: 'instructions',
        label: 'Modes & Instructions',
        description: 'Global Kilo prompt layers, built-in mode overrides, and custom mode management.',
        availability: 'planned',
    },
    {
        id: 'marketplace',
        label: 'Marketplace',
        description: 'Reserved for post-MVP marketplace management.',
        availability: 'planned',
    },
];

export const PROFILE_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<ProfileSettingsSubsectionId>> = [
    {
        id: 'management',
        label: 'Profile Management',
        description: 'Rename, duplicate, activate, delete, and create profiles.',
        availability: 'available',
    },
    {
        id: 'execution',
        label: 'Execution Defaults',
        description: 'Default runtime approvals and edit-flow behavior for the selected profile.',
        availability: 'available',
    },
    {
        id: 'naming',
        label: 'Conversation Naming',
        description: 'How new conversation names are generated for the selected profile.',
        availability: 'available',
    },
    {
        id: 'utility',
        label: 'Utility AI',
        description: 'Reserved for the future shared utility model used by naming and commit generation.',
        availability: 'planned',
    },
];

export const CONTEXT_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<ContextSettingsSubsectionId>> = [
    {
        id: 'workspace',
        label: 'Workspace Defaults',
        description: 'Global context defaults and composer media limits.',
        availability: 'available',
    },
    {
        id: 'budgeting',
        label: 'Context Budgeting',
        description: 'Profile overrides and resolved compact-window previews.',
        availability: 'available',
    },
];

export const REGISTRY_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<RegistrySettingsSubsectionId>> = [
    {
        id: 'rules',
        label: 'Rules',
        description: 'Resolved and discovered rulesets available to the runtime.',
        availability: 'available',
    },
    {
        id: 'skills',
        label: 'Skills',
        description: 'Search and inspect resolved skill assets.',
        availability: 'available',
    },
    {
        id: 'modes',
        label: 'Modes',
        description: 'Resolved agent modes and discovered mode files.',
        availability: 'available',
    },
    {
        id: 'diagnostics',
        label: 'Registry Diagnostics',
        description: 'Registry roots, counts, workspace scope, and refresh controls.',
        availability: 'available',
    },
];

export const APP_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<AppSettingsSubsectionId>> = [
    {
        id: 'privacy',
        label: 'Privacy',
        description: 'Sensitive value redaction across the app.',
        availability: 'available',
    },
    {
        id: 'maintenance',
        label: 'Maintenance',
        description: 'Factory reset and other destructive maintenance controls.',
        availability: 'available',
    },
];

export function getDefaultSettingsSelection(section: SettingsPrimarySectionId = 'kilo'): SettingsSelection {
    switch (section) {
        case 'kilo':
            return { section, subsection: 'account' };
        case 'providers':
            return { section, subsection: 'kilo' };
        case 'profiles':
            return { section, subsection: 'management' };
        case 'context':
            return { section, subsection: 'workspace' };
        case 'registry':
            return { section, subsection: 'rules' };
        case 'app':
            return { section, subsection: 'privacy' };
    }
}
