import type {
    BuiltInToolMetadataEntry,
    BuiltInModePromptSettingsItem,
    FileBackedCustomModeSettingsItem,
    ModeAuthoringRole,
    ModeDraftRecord,
    ModeRoleTemplateKey,
    PreparedContextEditablePromptLayerGroup,
    PreparedContextInjectionCheckpoint,
    PreparedContextModeOverrideValue,
    PreparedContextModeOverrides,
    PreparedContextProfileDefaultValue,
    PreparedContextProfileDefaults,
    RuntimeRequirementProfile,
    TopLevelTab,
} from '@/shared/contracts';
import { listModeRoleTemplateDefinitions } from '@/shared/modeRoleCatalog';

export type FileBackedModeItemsByTab = Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;

export interface BuiltInModePromptEntry extends Omit<BuiltInModePromptSettingsItem, 'prompt'> {
    prompt: {
        roleDefinition: string;
        customInstructions: string;
    };
}

export type TopLevelDraftState = Partial<Record<TopLevelTab, { profileId: string; value: string }>>;
export type BuiltInModeDraftState = Partial<
    Record<
        string,
        {
            profileId: string;
            roleDefinition: string;
            customInstructions: string;
            promptLayerOverrides: PreparedContextModeOverrides;
        }
    >
>;
export type BuiltInToolMetadataDraftState = Partial<Record<string, { description: string }>>;
export type PreparedContextProfileDefaultsDraftState =
    | {
          profileId: string;
          values: PreparedContextProfileDefaults;
      }
    | undefined;
export type CustomModeScope = 'global' | 'workspace';

export interface CustomModeEditorDraftBase {
    scope: CustomModeScope;
    slug: string;
    name: string;
    authoringRole: ModeAuthoringRole;
    roleTemplate: ModeRoleTemplateKey;
    description: string;
    roleDefinition: string;
    customInstructions: string;
    whenToUse: string;
    tagsText: string;
    promptLayerOverrides: PreparedContextModeOverrides;
    deleteConfirmed: boolean;
    sourceText: string;
}

export interface CreateCustomModeEditorDraft extends CustomModeEditorDraftBase {
    kind: 'create';
}

export interface DraftCustomModeEditorDraft extends CustomModeEditorDraftBase {
    kind: 'draft';
    draftId: string;
    validationState: ModeDraftRecord['validationState'];
    validationErrors: string[];
}

export interface EditCustomModeEditorDraft extends CustomModeEditorDraftBase {
    kind: 'edit';
    topLevelTab: TopLevelTab;
    modeKey: string;
}

export type CustomModeEditorDraft = CreateCustomModeEditorDraft | DraftCustomModeEditorDraft | EditCustomModeEditorDraft;

export interface PromptSettingsSnapshot {
    appGlobalInstructions: string;
    profileGlobalInstructions: string;
    topLevelInstructions: Record<TopLevelTab, string>;
    preparedContextProfileDefaults: PreparedContextProfileDefaults;
    builtInModes: Record<TopLevelTab, BuiltInModePromptSettingsItem[]>;
    fileBackedCustomModes: {
        global: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
        workspace?: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
    };
    delegatedWorkerModes: {
        global: FileBackedCustomModeSettingsItem[];
        workspace?: FileBackedCustomModeSettingsItem[];
    };
    modeDrafts: ModeDraftRecord[];
}

export type BuiltInToolMetadataSnapshot = BuiltInToolMetadataEntry[];

export function resolveTopLevelDraftValue(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    persistedValue: string | undefined;
    drafts: TopLevelDraftState;
}): string {
    const draft = input.drafts[input.topLevelTab];
    if (draft?.profileId === input.profileId) {
        return draft.value;
    }

    return input.persistedValue ?? '';
}

export function emptyModeItems(): Record<TopLevelTab, FileBackedCustomModeSettingsItem[]> {
    return {
        chat: [],
        agent: [],
        orchestrator: [],
    };
}

export function createDefaultPreparedContextProfileDefaultsSnapshot(): PreparedContextProfileDefaults {
    return {
        app_global_instructions: {
            bootstrap: 'include',
            post_compaction_reseed: 'include',
        },
        profile_global_instructions: {
            bootstrap: 'include',
            post_compaction_reseed: 'include',
        },
        top_level_instructions: {
            bootstrap: 'include',
            post_compaction_reseed: 'include',
        },
    };
}

export function createDefaultPreparedContextModeOverridesSnapshot(): PreparedContextModeOverrides {
    return {
        app_global_instructions: {
            bootstrap: 'inherit',
            post_compaction_reseed: 'inherit',
        },
        profile_global_instructions: {
            bootstrap: 'inherit',
            post_compaction_reseed: 'inherit',
        },
        top_level_instructions: {
            bootstrap: 'inherit',
            post_compaction_reseed: 'inherit',
        },
    };
}

export const preparedContextEditablePromptLayerGroupOrder: PreparedContextEditablePromptLayerGroup[] = [
    'app_global_instructions',
    'profile_global_instructions',
    'top_level_instructions',
];

export const preparedContextInjectionCheckpointOrder: PreparedContextInjectionCheckpoint[] = [
    'bootstrap',
    'post_compaction_reseed',
];

export function clonePreparedContextProfileDefaults(
    value: PreparedContextProfileDefaults
): PreparedContextProfileDefaults {
    return {
        app_global_instructions: { ...value.app_global_instructions },
        profile_global_instructions: { ...value.profile_global_instructions },
        top_level_instructions: { ...value.top_level_instructions },
    };
}

export function clonePreparedContextModeOverrides(value: PreparedContextModeOverrides): PreparedContextModeOverrides {
    return {
        app_global_instructions: { ...value.app_global_instructions },
        profile_global_instructions: { ...value.profile_global_instructions },
        top_level_instructions: { ...value.top_level_instructions },
    };
}

export function formatPreparedContextLayerGroupLabel(group: PreparedContextEditablePromptLayerGroup): string {
    switch (group) {
        case 'app_global_instructions':
            return 'App instructions';
        case 'profile_global_instructions':
            return 'Profile instructions';
        case 'top_level_instructions':
            return 'Top-level instructions';
        default:
            return formatDelimitedLabel(group);
    }
}

export function formatPreparedContextCheckpointLabel(checkpoint: PreparedContextInjectionCheckpoint): string {
    switch (checkpoint) {
        case 'bootstrap':
            return 'Bootstrap';
        case 'post_compaction_reseed':
            return 'Post-compaction reseed';
        default:
            return formatDelimitedLabel(checkpoint);
    }
}

export function formatPreparedContextProfileDefaultValueLabel(value: PreparedContextProfileDefaultValue): string {
    return value === 'include' ? 'Include' : 'Exclude';
}

export function formatPreparedContextModeOverrideValueLabel(value: PreparedContextModeOverrideValue): string {
    switch (value) {
        case 'inherit':
            return 'Inherit';
        case 'include':
            return 'Include';
        case 'exclude':
            return 'Exclude';
        default:
            return formatDelimitedLabel(value);
    }
}

export function normalizeOptionalText(value: string): string | undefined {
    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

export function parseListText(value: string): string[] | undefined {
    const items = value
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return items.length > 0 ? Array.from(new Set(items)) : undefined;
}

export function formatDelimitedLabel(value: string): string {
    return value
        .split(/[_-]+/g)
        .filter((part) => part.length > 0)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export function formatRuntimeProfileLabel(value: RuntimeRequirementProfile): string {
    switch (value) {
        case 'general':
            return 'General';
        case 'read_only_agent':
            return 'Read-Only Agent';
        case 'mutating_agent':
            return 'Mutating Agent';
        case 'planner':
            return 'Planner';
        case 'orchestrator':
            return 'Orchestrator';
        case 'reviewer':
            return 'Reviewer';
        default:
            return formatDelimitedLabel(value);
    }
}

export function createEmptyCustomModeEditorDraft(scope: CustomModeScope): CreateCustomModeEditorDraft {
    return {
        kind: 'create',
        scope,
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
    };
}

export function resolveCustomModeEditorTopLevelTab(draft: CustomModeEditorDraft): TopLevelTab {
    return draft.kind === 'edit'
        ? draft.topLevelTab
        : listModeRoleTemplateDefinitions().find((definition) => definition.roleTemplate === draft.roleTemplate)
              ?.topLevelTab ?? 'agent';
}

export function getModeRoleTemplateOptions(authoringRole: ModeAuthoringRole) {
    return listModeRoleTemplateDefinitions().filter((definition) => definition.authoringRole === authoringRole);
}
