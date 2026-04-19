import type {
    BuiltInToolMetadataSnapshot,
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
    authoringRole: BuiltInModePromptEntry['authoringRole'];
    roleTemplate: BuiltInModePromptEntry['roleTemplate'];
    internalModelRole: BuiltInModePromptEntry['internalModelRole'];
    toolCapabilities: BuiltInModePromptEntry['toolCapabilities'];
    workflowCapabilities: BuiltInModePromptEntry['workflowCapabilities'];
    behaviorFlags: BuiltInModePromptEntry['behaviorFlags'];
    runtimeProfile: BuiltInModePromptEntry['runtimeProfile'];
    promptLayerOverrides: BuiltInModePromptEntry['promptLayerOverrides'];
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

export interface BuiltInToolMetadataCardModel {
    toolId: string;
    label: string;
    description: string;
    defaultDescription: string;
    isModified: boolean;
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
    builtInToolMetadata: {
        title: string;
        description: string;
        items: BuiltInToolMetadataCardModel[];
    };
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
            authoringRole: mode.authoringRole,
            roleTemplate: mode.roleTemplate,
            internalModelRole: mode.internalModelRole,
            toolCapabilities: mode.toolCapabilities,
            workflowCapabilities: mode.workflowCapabilities,
            behaviorFlags: mode.behaviorFlags,
            runtimeProfile: mode.runtimeProfile,
            promptLayerOverrides: mode.promptLayerOverrides,
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
    preparedContextProfileDefaults: import('@/shared/contracts').PreparedContextProfileDefaults;
    builtInModesIsSaving: boolean;
    builtInToolMetadata: BuiltInToolMetadataSnapshot;
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
        builtInToolMetadata: {
            title: 'Built-In Tool Metadata',
            description:
                'These global descriptions become the editable base text the model sees for shipped native tools. Runtime-only shell and tool guidance still appends after them.',
            items: input.builtInToolMetadata.map((tool) => ({
                toolId: tool.toolId,
                label: tool.label,
                description: tool.description,
                defaultDescription: tool.defaultDescription,
                isModified: tool.isModified,
            })),
        },
        modeLibrary: {
            title: 'Live Mode Library',
            description: 'Review the active file-backed mode library after draft validation and promotion have written into the registry roots.',
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
