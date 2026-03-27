import type {
    BuiltInModePromptEntry,
    FileBackedModeItemsByTab,
} from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';
import type { CustomModeScope } from '@/web/components/settings/modesSettings/modesInstructionsControllerShared';

import type { TopLevelTab } from '@/shared/contracts';

export interface PromptLayerSectionModel {
    title: string;
    description: string;
    warning?: string;
    value: string;
    isSaving: boolean;
}

export interface BuiltInModePromptCardModel {
    topLevelTab: TopLevelTab;
    modeKey: string;
    label: string;
    description: string;
    warning: string;
    roleDefinition: string;
    customInstructions: string;
    hasOverride: boolean;
}

export interface BuiltInModePromptSectionModel {
    topLevelTab: TopLevelTab;
    title: string;
    description: string;
    cards: BuiltInModePromptCardModel[];
}

export interface ModeLibrarySectionModel {
    title: string;
    description: string;
    global: FileBackedModeItemsByTab;
    workspace: FileBackedModeItemsByTab;
    hasWorkspaceScope: boolean;
    selectedWorkspaceLabel?: string;
}

export interface ModesInstructionsViewModel {
    promptLayers: {
        appGlobal: PromptLayerSectionModel;
        profileGlobal: PromptLayerSectionModel;
        topLevel: Array<
            PromptLayerSectionModel & {
                topLevelTab: TopLevelTab;
            }
        >;
    };
    builtInModeSections: BuiltInModePromptSectionModel[];
    modeLibrary: ModeLibrarySectionModel;
}

function formatTopLevelLabel(topLevelTab: TopLevelTab): string {
    if (topLevelTab === 'agent') {
        return 'Agent';
    }
    if (topLevelTab === 'orchestrator') {
        return 'Orchestrator';
    }
    return 'Chat';
}

function formatBuiltInModeDescription(topLevelTab: TopLevelTab, label: string): string {
    return `Shipped ${formatTopLevelLabel(topLevelTab).toLowerCase()} behavior for ${label.toLowerCase()} lives here before custom rules, skills, or prompt attachments are applied.`;
}

function buildBuiltInModeSectionModel(input: {
    topLevelTab: TopLevelTab;
    items: BuiltInModePromptEntry[];
    isSaving: boolean;
}): BuiltInModePromptSectionModel | undefined {
    if (input.items.length === 0) {
        return undefined;
    }

    return {
        topLevelTab: input.topLevelTab,
        title: `${formatTopLevelLabel(input.topLevelTab)} Modes`,
        description: 'Reset any edited built-in mode to restore the shipped default prompt for that mode.',
        cards: input.items.map((mode) => ({
            topLevelTab: input.topLevelTab,
            modeKey: mode.modeKey,
            label: mode.label,
            description: formatBuiltInModeDescription(input.topLevelTab, mode.label),
            warning: `Editing the built-in ${mode.label.toLowerCase()} prompt can make the app behave unexpectedly. Reset restores the shipped behavior.`,
            roleDefinition: mode.prompt.roleDefinition ?? '',
            customInstructions: mode.prompt.customInstructions ?? '',
            hasOverride: mode.hasOverride,
        })),
    };
}

export function buildModesInstructionsViewModel(input: {
    appGlobalValue: string;
    appGlobalIsSaving: boolean;
    profileGlobalValue: string;
    profileGlobalIsSaving: boolean;
    topLevelValues: Record<TopLevelTab, string>;
    topLevelIsSaving: boolean;
    builtInModesByTab: Record<TopLevelTab, BuiltInModePromptEntry[]>;
    builtInModesIsSaving: boolean;
    fileBackedGlobalModes: FileBackedModeItemsByTab;
    fileBackedWorkspaceModes: FileBackedModeItemsByTab;
    selectedWorkspaceLabel?: string;
    hasWorkspaceScope: boolean;
}) : ModesInstructionsViewModel {
    const topLevelTabs: TopLevelTab[] = ['chat', 'agent', 'orchestrator'];
    const builtInModeSections = topLevelTabs
        .map((topLevelTab) =>
            buildBuiltInModeSectionModel({
                topLevelTab,
                items: input.builtInModesByTab[topLevelTab],
                isSaving: input.builtInModesIsSaving,
            })
        )
        .filter((section): section is BuiltInModePromptSectionModel => section !== undefined);

    return {
        promptLayers: {
            appGlobal: {
                title: 'App-Scope Global Instructions',
                description: 'These instructions apply across the app before any profile, tab, mode, rule, or skill content.',
                value: input.appGlobalValue,
                isSaving: input.appGlobalIsSaving,
            },
            profileGlobal: {
                title: 'Profile-Scope Global Instructions',
                description: 'These instructions apply only to the selected profile after app-scope instructions and before built-in tab instructions.',
                value: input.profileGlobalValue,
                isSaving: input.profileGlobalIsSaving,
            },
            topLevel: topLevelTabs.map((topLevelTab) => ({
                topLevelTab,
                title: `${formatTopLevelLabel(topLevelTab)} Instructions`,
                description: `Shipped ${formatTopLevelLabel(topLevelTab).toLowerCase()} behavior lives here before mode-specific instructions are applied.`,
                warning: `Editing built-in ${formatTopLevelLabel(topLevelTab).toLowerCase()} instructions can make the app behave differently than the shipped defaults.`,
                value: input.topLevelValues[topLevelTab],
                isSaving: input.topLevelIsSaving,
            })),
        },
        builtInModeSections,
        modeLibrary: {
            title: 'File-Backed Custom Modes',
            description: 'Manage app-level file-backed custom modes while keeping the registry roots as the only source of truth.',
            global: input.fileBackedGlobalModes,
            workspace: input.fileBackedWorkspaceModes,
            hasWorkspaceScope: input.hasWorkspaceScope,
            ...(input.selectedWorkspaceLabel ? { selectedWorkspaceLabel: input.selectedWorkspaceLabel } : {}),
        },
    };
}

export function formatModeLibraryScopeLabel(scope: CustomModeScope, selectedWorkspaceLabel?: string): string {
    if (scope === 'workspace') {
        return selectedWorkspaceLabel ?? 'Selected workspace';
    }

    return 'Global registry root';
}
