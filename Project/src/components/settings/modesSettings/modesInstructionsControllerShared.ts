import type {
    BuiltInModePromptSettingsItem,
    FileBackedCustomModeSettingsItem,
    ToolCapability,
    TopLevelTab,
} from '@/shared/contracts';

export type TopLevelDraftState = Partial<Record<TopLevelTab, { profileId: string; value: string }>>;
export type BuiltInModeDraftState = Partial<
    Record<string, { profileId: string; roleDefinition: string; customInstructions: string }>
>;
export type CustomModeScope = 'global' | 'workspace';

export interface CustomModeEditorDraftBase {
    scope: CustomModeScope;
    topLevelTab: TopLevelTab;
    slug: string;
    name: string;
    description: string;
    roleDefinition: string;
    customInstructions: string;
    whenToUse: string;
    tagsText: string;
    selectedToolCapabilities: ToolCapability[];
    deleteConfirmed: boolean;
}

export interface CreateCustomModeEditorDraft extends CustomModeEditorDraftBase {
    kind: 'create';
}

export interface EditCustomModeEditorDraft extends CustomModeEditorDraftBase {
    kind: 'edit';
    modeKey: string;
}

export type CustomModeEditorDraft = CreateCustomModeEditorDraft | EditCustomModeEditorDraft;

export interface PromptSettingsSnapshot {
    appGlobalInstructions: string;
    profileGlobalInstructions: string;
    topLevelInstructions: Record<TopLevelTab, string>;
    builtInModes: Record<TopLevelTab, BuiltInModePromptSettingsItem[]>;
    fileBackedCustomModes: {
        global: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
        workspace?: Record<TopLevelTab, FileBackedCustomModeSettingsItem[]>;
    };
}

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

export function toggleToolCapability(value: ToolCapability[], capability: ToolCapability): ToolCapability[] {
    return value.includes(capability) ? value.filter((candidate) => candidate !== capability) : [...value, capability];
}

export function createEmptyCustomModeEditorDraft(scope: CustomModeScope): CreateCustomModeEditorDraft {
    return {
        kind: 'create',
        scope,
        topLevelTab: 'chat',
        slug: '',
        name: '',
        description: '',
        roleDefinition: '',
        customInstructions: '',
        whenToUse: '',
        tagsText: '',
        selectedToolCapabilities: [],
        deleteConfirmed: false,
    };
}
