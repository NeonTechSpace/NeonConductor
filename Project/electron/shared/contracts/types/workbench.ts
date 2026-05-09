export const workbenchCommandIds = ['open_command_palette', 'go_sessions', 'open_settings'] as const;

export type WorkbenchCommandId = (typeof workbenchCommandIds)[number];

export const workbenchCommandGroups = ['navigation', 'utility'] as const;

export type WorkbenchCommandGroup = (typeof workbenchCommandGroups)[number];

export const workbenchKeybindingContextKeys = [
    'global',
    'composer_focus',
    'dialog_open',
    'editable_text_focus',
    'settings_open',
] as const;

export type WorkbenchKeybindingContextKey = (typeof workbenchKeybindingContextKeys)[number];

export interface WorkbenchKeybindingGesture {
    key: string;
    mod?: boolean;
    shift?: boolean;
    alt?: boolean;
}

export type WorkbenchKeybindingOverrides = Partial<Record<WorkbenchCommandId, WorkbenchKeybindingGesture | null>>;

export interface WorkbenchCommandDefinition {
    id: WorkbenchCommandId;
    label: string;
    description: string;
    group: WorkbenchCommandGroup;
    editableKeybinding: boolean;
    defaultKeybinding?: WorkbenchKeybindingGesture;
}

export const workbenchCommandDefinitions = [
    {
        id: 'open_command_palette',
        label: 'Open Command Palette',
        description: 'Open the workbench command palette.',
        group: 'utility',
        editableKeybinding: true,
        defaultKeybinding: { key: 'k', mod: true },
    },
    {
        id: 'go_sessions',
        label: 'Go to Sessions',
        description: 'Switch to the Sessions work surface.',
        group: 'navigation',
        editableKeybinding: true,
    },
    {
        id: 'open_settings',
        label: 'Open Settings',
        description: 'Open the Settings utility surface.',
        group: 'navigation',
        editableKeybinding: true,
    },
] as const satisfies readonly WorkbenchCommandDefinition[];

export interface WorkbenchCommandKeybindingView {
    commandId: WorkbenchCommandId;
    defaultKeybinding?: WorkbenchKeybindingGesture;
    overrideKeybinding?: WorkbenchKeybindingGesture | null;
    effectiveKeybinding?: WorkbenchKeybindingGesture;
}

export interface WorkbenchCommandSettings {
    keybindings: WorkbenchCommandKeybindingView[];
    updatedAt: string;
}

export interface SetWorkbenchCommandKeybindingOverridesInput {
    overrides: WorkbenchKeybindingOverrides;
}
