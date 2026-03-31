import { providerIds, type RuntimeProviderId } from '@/shared/contracts';

export type SettingsPrimarySectionId = 'kilo' | 'modes' | 'providers' | 'profiles' | 'context' | 'registry' | 'app';

export type KiloSettingsSubsectionId = 'account' | 'models' | 'routing' | 'marketplace';
export type ModesSettingsSubsectionId = 'instructions';
export type ProfileSettingsSubsectionId = 'management' | 'execution' | 'naming' | 'utility';
export type ContextSettingsSubsectionId = 'workspace' | 'budgeting';
export type RegistrySettingsSubsectionId = 'rules' | 'skills' | 'modes' | 'diagnostics';
export type AppSettingsSubsectionId = 'privacy' | 'mcp' | 'maintenance';

export type SettingsSelection =
    | { section: 'kilo'; subsection: KiloSettingsSubsectionId }
    | { section: 'modes'; subsection: ModesSettingsSubsectionId }
    | { section: 'providers'; subsection: RuntimeProviderId }
    | { section: 'profiles'; subsection: ProfileSettingsSubsectionId }
    | { section: 'context'; subsection: ContextSettingsSubsectionId }
    | { section: 'registry'; subsection: RegistrySettingsSubsectionId }
    | { section: 'app'; subsection: AppSettingsSubsectionId };

export interface SettingsRouteSearch {
    section?: SettingsPrimarySectionId;
    subsection?: string;
}

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
        description: 'Sign in to Kilo, choose gateway models, and control how Kilo picks an upstream provider.',
        group: 'kilo',
    },
    {
        id: 'modes',
        label: 'Modes & Instructions',
        description: 'Manage the shared instructions and built-in modes Neon uses in Chat, Agent, and Orchestrator.',
        group: 'general',
    },
    {
        id: 'providers',
        label: 'Providers & Models',
        description: 'Connect direct providers, choose models, and manage which connection Neon should use.',
        group: 'general',
    },
    {
        id: 'profiles',
        label: 'Profiles',
        description: 'Create profiles and choose their default behavior for approvals, edits, and conversation naming.',
        group: 'general',
    },
    {
        id: 'context',
        label: 'Context & Limits',
        description: 'Choose defaults for workspaces and set message, media, and context limits.',
        group: 'general',
    },
    {
        id: 'registry',
        label: 'Rules, Skills & Modes',
        description: 'Browse the rules, skills, and modes Neon found, and refresh the files it reads from disk.',
        group: 'general',
    },
    {
        id: 'app',
        label: 'App',
        description: 'Manage privacy, local integrations, and maintenance actions that affect the whole app.',
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
        label: 'Provider Choice',
        description: 'Choose how Kilo picks a provider when the same model is available from more than one source.',
        availability: 'available',
    },
    {
        id: 'marketplace',
        label: 'Marketplace',
        description: 'Reserved for post-MVP marketplace management.',
        availability: 'planned',
    },
];

export const MODES_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<ModesSettingsSubsectionId>> = [
    {
        id: 'instructions',
        label: 'Shared Modes & Instructions',
        description: 'Manage shared instructions, built-in mode behavior, and portable custom mode files.',
        availability: 'available',
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
        description: 'Choose default approval and edit behavior for the selected profile.',
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
        description:
            'Reserved for the future shared utility model used by conversation naming and other small utility tasks.',
        availability: 'available',
    },
];

export const CONTEXT_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<ContextSettingsSubsectionId>> = [
    {
        id: 'workspace',
        label: 'Workspace Defaults',
        description: 'Choose default workspace behavior and message media limits.',
        availability: 'available',
    },
    {
        id: 'budgeting',
        label: 'Context Budgeting',
        description: 'Review how much context Neon keeps and override it per profile when needed.',
        availability: 'available',
    },
];

export const REGISTRY_SETTINGS_SUBSECTIONS: ReadonlyArray<SettingsSubsectionDefinition<RegistrySettingsSubsectionId>> =
    [
        {
            id: 'rules',
            label: 'Rules',
            description: 'Browse the rules Neon can use right now and the rule files it found on disk.',
            availability: 'available',
        },
        {
            id: 'skills',
            label: 'Skills',
            description: 'Search the skills Neon can use and inspect the files they came from.',
            availability: 'available',
        },
        {
            id: 'modes',
            label: 'Modes',
            description: 'Inspect the modes Neon can use and the mode files it found.',
            availability: 'available',
        },
        {
            id: 'diagnostics',
            label: 'File Discovery',
            description: 'See which folders Neon checks, what it found there, and refresh the results.',
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
        id: 'mcp',
        label: 'MCP',
        description: 'Manage MCP servers, secrets, and the tools Neon discovers from those servers.',
        availability: 'available',
    },
    {
        id: 'maintenance',
        label: 'Maintenance',
        description: 'Factory reset and other destructive maintenance controls.',
        availability: 'available',
    },
];

function isOneOf<const TValue extends readonly string[]>(
    value: string | undefined,
    allowed: TValue
): value is TValue[number] {
    return typeof value === 'string' && allowed.includes(value);
}

const kiloSettingsSubsectionIds = KILO_SETTINGS_SUBSECTIONS.map(
    (subsection) => subsection.id
) as readonly KiloSettingsSubsectionId[];
const modesSettingsSubsectionIds = MODES_SETTINGS_SUBSECTIONS.map(
    (subsection) => subsection.id
) as readonly ModesSettingsSubsectionId[];
const profileSettingsSubsectionIds = PROFILE_SETTINGS_SUBSECTIONS.map(
    (subsection) => subsection.id
) as readonly ProfileSettingsSubsectionId[];
const contextSettingsSubsectionIds = CONTEXT_SETTINGS_SUBSECTIONS.map(
    (subsection) => subsection.id
) as readonly ContextSettingsSubsectionId[];
const registrySettingsSubsectionIds = REGISTRY_SETTINGS_SUBSECTIONS.map(
    (subsection) => subsection.id
) as readonly RegistrySettingsSubsectionId[];
const appSettingsSubsectionIds = APP_SETTINGS_SUBSECTIONS.map(
    (subsection) => subsection.id
) as readonly AppSettingsSubsectionId[];
const settingsPrimarySectionIds = SETTINGS_PRIMARY_SECTIONS.map(
    (section) => section.id
) as readonly SettingsPrimarySectionId[];

export function getDefaultSettingsSelection(section: SettingsPrimarySectionId = 'kilo'): SettingsSelection {
    switch (section) {
        case 'kilo':
            return { section, subsection: 'account' };
        case 'modes':
            return { section, subsection: 'instructions' };
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

export function resolveSettingsSelectionFromRouteSearch(search: SettingsRouteSearch): SettingsSelection {
    const section = isOneOf(search.section, settingsPrimarySectionIds) ? search.section : 'kilo';
    const subsection = typeof search.subsection === 'string' ? search.subsection : undefined;

    switch (section) {
        case 'kilo':
            return isOneOf(subsection, kiloSettingsSubsectionIds)
                ? { section, subsection }
                : getDefaultSettingsSelection(section);
        case 'modes':
            return isOneOf(subsection, modesSettingsSubsectionIds)
                ? { section, subsection }
                : getDefaultSettingsSelection(section);
        case 'providers':
            return isOneOf(subsection, providerIds) ? { section, subsection } : getDefaultSettingsSelection(section);
        case 'profiles':
            return isOneOf(subsection, profileSettingsSubsectionIds)
                ? { section, subsection }
                : getDefaultSettingsSelection(section);
        case 'context':
            return isOneOf(subsection, contextSettingsSubsectionIds)
                ? { section, subsection }
                : getDefaultSettingsSelection(section);
        case 'registry':
            return isOneOf(subsection, registrySettingsSubsectionIds)
                ? { section, subsection }
                : getDefaultSettingsSelection(section);
        case 'app':
            return isOneOf(subsection, appSettingsSubsectionIds)
                ? { section, subsection }
                : getDefaultSettingsSelection(section);
    }
}

export function getSettingsRouteSearch(selection: SettingsSelection): Required<SettingsRouteSearch> {
    return {
        section: selection.section,
        subsection: selection.subsection,
    };
}

export function parseSettingsRouteSearch(search: Record<string, unknown>): SettingsRouteSearch {
    const section =
        typeof search.section === 'string' && isOneOf(search.section, settingsPrimarySectionIds)
            ? search.section
            : undefined;
    const subsection = typeof search.subsection === 'string' ? search.subsection : undefined;

    return {
        ...(section ? { section } : {}),
        ...(subsection ? { subsection } : {}),
    };
}
