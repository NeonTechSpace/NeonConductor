import {
    appPromptLayerSettingsStore,
    builtInModePromptOverrideStore,
    modeDraftStore,
    modeStore,
    settingsStore,
} from '@/app/backend/persistence/stores';
import {
    createDefaultPreparedContextProfileDefaults,
    createDefaultPreparedContextModeOverrides,
    type FileBackedCustomModeSettingsItem,
    normalizeModePromptDefinition,
    normalizePreparedContextModeOverrides,
    normalizePreparedContextProfileDefaults,
    topLevelTabs,
    type BuiltInModePromptSettingsItem,
    type ModeDefinition,
    type PreparedContextProfileDefaults,
    type PromptLayerCustomModePayload,
    type PromptLayerCustomModeRecord,
    type PromptLayerSettings,
    type TopLevelTab,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import {
    getModeAuthoringRole,
    getModeBehaviorFlags,
    getModeInternalModelRole,
    getModeRoleTemplate,
    getModeRuntimeProfile,
    getModeWorkflowCapabilities,
    modeIsDelegatedOnly,
    modeIsSessionSelectable,
} from '@/app/backend/runtime/services/mode/metadata';
import { buildCanonicalCustomModePayload } from '@/app/backend/runtime/services/promptLayers/customModePortability';
import { buildDiscoveredAssets, replaceDiscoveredModes } from '@/app/backend/runtime/services/registry/discovery';
import { resolveRegistryPaths } from '@/app/backend/runtime/services/registry/filesystem';

export const PROFILE_GLOBAL_INSTRUCTIONS_KEY = 'prompt_layer.profile_global_instructions';
export const PREPARED_CONTEXT_PROFILE_DEFAULTS_KEY = 'prompt_layer.prepared_context_profile_defaults';
const TOP_LEVEL_INSTRUCTIONS_KEY_PREFIX = 'prompt_layer.top_level.';
const BUILT_IN_MODE_ORDER: Record<TopLevelTab, string[]> = {
    chat: ['chat'],
    agent: ['plan', 'ask', 'code', 'debug'],
    orchestrator: ['plan', 'orchestrate', 'debug'],
};

export function normalizeInstructions(value: string | undefined): string {
    return value?.trim() ?? '';
}

export function getTopLevelInstructionsKey(topLevelTab: TopLevelTab): string {
    return `${TOP_LEVEL_INSTRUCTIONS_KEY_PREFIX}${topLevelTab}`;
}

function isBuiltInMode(mode: Pick<ModeDefinition, 'scope' | 'sourceKind'>): boolean {
    return mode.scope === 'system' && mode.sourceKind === 'system_seed';
}

function sortBuiltInModes(left: BuiltInModePromptSettingsItem, right: BuiltInModePromptSettingsItem): number {
    const order = BUILT_IN_MODE_ORDER[left.topLevelTab];
    return order.indexOf(left.modeKey) - order.indexOf(right.modeKey);
}

function createEmptyCustomModeGroups(): Record<TopLevelTab, FileBackedCustomModeSettingsItem[]> {
    return {
        chat: [],
        agent: [],
        orchestrator: [],
    };
}

function sortFileBackedCustomModes(
    left: FileBackedCustomModeSettingsItem,
    right: FileBackedCustomModeSettingsItem
): number {
    return left.label.localeCompare(right.label) || left.modeKey.localeCompare(right.modeKey);
}

async function readFileBackedCustomModes(input: {
    profileId: string;
    workspaceFingerprint?: string;
}): Promise<{
    fileBackedCustomModes: PromptLayerSettings['fileBackedCustomModes'];
    delegatedWorkerModes: PromptLayerSettings['delegatedWorkerModes'];
}> {
    const storedModes = await modeStore.listByProfile(input.profileId);
    const globalModes = createEmptyCustomModeGroups();
    const workspaceModes = createEmptyCustomModeGroups();
    const globalDelegatedModes: FileBackedCustomModeSettingsItem[] = [];
    const workspaceDelegatedModes: FileBackedCustomModeSettingsItem[] = [];

    for (const mode of storedModes) {
        if (mode.scope === 'system' || mode.sourceKind === 'system_seed' || mode.scope === 'session') {
            continue;
        }
        if (mode.sourceKind !== 'global_file' && mode.sourceKind !== 'workspace_file') {
            continue;
        }
        if (mode.scope === 'workspace' && mode.workspaceFingerprint !== input.workspaceFingerprint) {
            continue;
        }

        const workflowCapabilities = getModeWorkflowCapabilities(mode.executionPolicy);
        const behaviorFlags = getModeBehaviorFlags(mode.executionPolicy);
        const runtimeProfile = getModeRuntimeProfile(mode.executionPolicy);
        const item: FileBackedCustomModeSettingsItem = {
            topLevelTab: mode.topLevelTab,
            modeKey: mode.modeKey,
            label: mode.label,
            authoringRole: getModeAuthoringRole(mode.executionPolicy),
            roleTemplate: getModeRoleTemplate(mode.executionPolicy),
            internalModelRole: getModeInternalModelRole(mode.executionPolicy),
            delegatedOnly: modeIsDelegatedOnly(mode),
            sessionSelectable: modeIsSessionSelectable(mode),
            ...(mode.description ? { description: mode.description } : {}),
            ...(mode.whenToUse ? { whenToUse: mode.whenToUse } : {}),
            ...(mode.tags ? { tags: mode.tags } : {}),
            promptLayerOverrides: normalizePreparedContextModeOverrides(mode.promptLayerOverrides),
            ...(mode.executionPolicy.toolCapabilities
                ? { toolCapabilities: mode.executionPolicy.toolCapabilities }
                : {}),
            ...(workflowCapabilities.length > 0
                ? { workflowCapabilities }
                : {}),
            ...(behaviorFlags.length > 0
                ? { behaviorFlags }
                : {}),
            ...(runtimeProfile
                ? { runtimeProfile }
                : {}),
        };
        if (item.delegatedOnly) {
            if (mode.scope === 'workspace') {
                workspaceDelegatedModes.push(item);
            } else {
                globalDelegatedModes.push(item);
            }
            continue;
        }

        if (mode.scope === 'workspace') {
            workspaceModes[mode.topLevelTab].push(item);
            continue;
        }

        globalModes[mode.topLevelTab].push(item);
    }

    for (const topLevelTab of topLevelTabs) {
        globalModes[topLevelTab].sort(sortFileBackedCustomModes);
        workspaceModes[topLevelTab].sort(sortFileBackedCustomModes);
    }
    globalDelegatedModes.sort(sortFileBackedCustomModes);
    workspaceDelegatedModes.sort(sortFileBackedCustomModes);

    return {
        fileBackedCustomModes: {
            global: globalModes,
            ...(input.workspaceFingerprint ? { workspace: workspaceModes } : {}),
        },
        delegatedWorkerModes: {
            global: globalDelegatedModes,
            ...(input.workspaceFingerprint ? { workspace: workspaceDelegatedModes } : {}),
        },
    };
}

async function readModeDrafts(input: {
    profileId: string;
    workspaceFingerprint?: string;
}): Promise<PromptLayerSettings['modeDrafts']> {
    const drafts = await modeDraftStore.listByProfile(input.profileId);
    return drafts.filter((draft) => {
        if (draft.scope === 'workspace') {
            return draft.workspaceFingerprint === input.workspaceFingerprint;
        }

        return true;
    });
}

export async function readBuiltInModes(
    profileId: string
): Promise<Record<TopLevelTab, BuiltInModePromptSettingsItem[]>> {
    const [storedModes, overrides] = await Promise.all([
        modeStore.listByProfile(profileId),
        builtInModePromptOverrideStore.listByProfile(profileId),
    ]);
    const overrideByKey = new Map(
        overrides.map((override) => [`${override.topLevelTab}:${override.modeKey}`, override] as const)
    );

    const builtInModes = storedModes.filter(isBuiltInMode).map((mode) => {
        const override = overrideByKey.get(`${mode.topLevelTab}:${mode.modeKey}`);
        const workflowCapabilities = getModeWorkflowCapabilities(mode.executionPolicy);
        const behaviorFlags = getModeBehaviorFlags(mode.executionPolicy);
        const runtimeProfile = getModeRuntimeProfile(mode.executionPolicy);
        return {
            topLevelTab: mode.topLevelTab,
            modeKey: mode.modeKey,
            label: mode.label,
            prompt: override ? normalizeModePromptDefinition({ ...mode.prompt, ...override.prompt }) : mode.prompt,
            hasOverride: override !== undefined,
            authoringRole: getModeAuthoringRole(mode.executionPolicy),
            roleTemplate: getModeRoleTemplate(mode.executionPolicy),
            internalModelRole: getModeInternalModelRole(mode.executionPolicy),
            promptLayerOverrides: override
                ? normalizePreparedContextModeOverrides(override.promptLayerOverrides)
                : createDefaultPreparedContextModeOverrides(),
            ...(mode.executionPolicy.toolCapabilities ? { toolCapabilities: mode.executionPolicy.toolCapabilities } : {}),
            ...(workflowCapabilities.length > 0 ? { workflowCapabilities } : {}),
            ...(behaviorFlags.length > 0 ? { behaviorFlags } : {}),
            ...(runtimeProfile ? { runtimeProfile } : {}),
        } satisfies BuiltInModePromptSettingsItem;
    });

    return {
        chat: builtInModes.filter((mode) => mode.topLevelTab === 'chat').sort(sortBuiltInModes),
        agent: builtInModes.filter((mode) => mode.topLevelTab === 'agent').sort(sortBuiltInModes),
        orchestrator: builtInModes.filter((mode) => mode.topLevelTab === 'orchestrator').sort(sortBuiltInModes),
    };
}

export async function assertBuiltInModeExists(
    profileId: string,
    topLevelTab: TopLevelTab,
    modeKey: string
): Promise<OperationalResult<void>> {
    const builtInModes = await modeStore.listByProfile(profileId);
    const builtInMode = builtInModes.find(
        (mode) => mode.topLevelTab === topLevelTab && mode.modeKey === modeKey && isBuiltInMode(mode)
    );
    if (!builtInMode) {
        return errOp('not_found', `Built-in mode "${topLevelTab}:${modeKey}" was not found.`);
    }
    return okOp(undefined);
}

export async function readTopLevelInstructions(profileId: string): Promise<Record<TopLevelTab, string>> {
    const storedInstructions = await Promise.all(
        topLevelTabs.map(async (topLevelTab) => {
            const storedValue = await settingsStore.getStringOptional(
                profileId,
                getTopLevelInstructionsKey(topLevelTab)
            );
            return [topLevelTab, normalizeInstructions(storedValue)] as const;
        })
    );

    return Object.fromEntries(storedInstructions) as Record<TopLevelTab, string>;
}

export async function readPreparedContextProfileDefaults(profileId: string): Promise<PreparedContextProfileDefaults> {
    const storedValue = await settingsStore.getJsonOptional(
        profileId,
        PREPARED_CONTEXT_PROFILE_DEFAULTS_KEY,
        (value): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
    );

    return storedValue
        ? normalizePreparedContextProfileDefaults(storedValue)
        : createDefaultPreparedContextProfileDefaults();
}

export async function readPromptLayerSettings(input: {
    profileId: string;
    workspaceFingerprint?: string;
}): Promise<PromptLayerSettings> {
    const [appSettings, profileGlobalInstructions, topLevelInstructions, preparedContextProfileDefaults, builtInModes, customModeInventories, modeDrafts] =
        await Promise.all([
            appPromptLayerSettingsStore.get(),
            settingsStore.getStringOptional(input.profileId, PROFILE_GLOBAL_INSTRUCTIONS_KEY),
            readTopLevelInstructions(input.profileId),
            readPreparedContextProfileDefaults(input.profileId),
            readBuiltInModes(input.profileId),
            readFileBackedCustomModes(input),
            readModeDrafts(input),
        ]);

    return {
        appGlobalInstructions: normalizeInstructions(appSettings.globalInstructions),
        profileGlobalInstructions: normalizeInstructions(profileGlobalInstructions),
        topLevelInstructions,
        preparedContextProfileDefaults,
        builtInModes,
        fileBackedCustomModes: customModeInventories.fileBackedCustomModes,
        delegatedWorkerModes: customModeInventories.delegatedWorkerModes,
        modeDrafts,
    };
}

export async function findFileBackedCustomMode(input: {
    profileId: string;
    topLevelTab: TopLevelTab;
    modeKey: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}): Promise<ModeDefinition | undefined> {
    const storedModes = await modeStore.listByProfile(input.profileId);
    return storedModes.find(
        (mode) =>
            mode.topLevelTab === input.topLevelTab &&
            mode.modeKey === input.modeKey &&
            mode.scope === input.scope &&
            mode.sourceKind === (input.scope === 'global' ? 'global_file' : 'workspace_file') &&
            (input.scope !== 'workspace' || mode.workspaceFingerprint === input.workspaceFingerprint)
    );
}

export function toPromptLayerCustomModeRecord(mode: ModeDefinition): PromptLayerCustomModeRecord {
    const workflowCapabilities = getModeWorkflowCapabilities(mode.executionPolicy);
    const behaviorFlags = getModeBehaviorFlags(mode.executionPolicy);
    const runtimeProfile = getModeRuntimeProfile(mode.executionPolicy);
    return {
        scope: mode.scope === 'workspace' ? 'workspace' : 'global',
        topLevelTab: mode.topLevelTab,
        modeKey: mode.modeKey,
        slug: mode.modeKey,
        name: mode.label,
        authoringRole: getModeAuthoringRole(mode.executionPolicy),
        roleTemplate: getModeRoleTemplate(mode.executionPolicy),
        internalModelRole: getModeInternalModelRole(mode.executionPolicy),
        delegatedOnly: modeIsDelegatedOnly(mode),
        sessionSelectable: modeIsSessionSelectable(mode),
        ...(mode.description ? { description: mode.description } : {}),
        ...(mode.prompt.roleDefinition ? { roleDefinition: mode.prompt.roleDefinition } : {}),
        ...(mode.prompt.customInstructions ? { customInstructions: mode.prompt.customInstructions } : {}),
        ...(mode.whenToUse ? { whenToUse: mode.whenToUse } : {}),
        ...(mode.tags ? { tags: mode.tags } : {}),
        promptLayerOverrides: normalizePreparedContextModeOverrides(mode.promptLayerOverrides),
        ...(mode.executionPolicy.toolCapabilities ? { toolCapabilities: mode.executionPolicy.toolCapabilities } : {}),
        ...(workflowCapabilities.length > 0
            ? { workflowCapabilities }
            : {}),
        ...(behaviorFlags.length > 0
            ? { behaviorFlags }
            : {}),
        ...(runtimeProfile
            ? { runtimeProfile }
            : {}),
    };
}

export function buildEditableCustomModePayload(input: {
    slug: string;
    name: string;
    authoringRole: PromptLayerCustomModePayload['authoringRole'];
    roleTemplate: PromptLayerCustomModePayload['roleTemplate'];
    description?: string;
    roleDefinition?: string;
    customInstructions?: string;
    whenToUse?: string;
    tags?: string[];
    promptLayerOverrides?: PromptLayerCustomModePayload['promptLayerOverrides'];
}): PromptLayerCustomModePayload {
    return buildCanonicalCustomModePayload({
        slug: input.slug,
        name: input.name,
        authoringRole: input.authoringRole,
        roleTemplate: input.roleTemplate,
        ...(input.description ? { description: input.description } : {}),
        ...(input.roleDefinition ? { roleDefinition: input.roleDefinition } : {}),
        ...(input.customInstructions ? { customInstructions: input.customInstructions } : {}),
        ...(input.whenToUse ? { whenToUse: input.whenToUse } : {}),
        ...(input.tags ? { tags: input.tags } : {}),
        ...(input.promptLayerOverrides ? { promptLayerOverrides: input.promptLayerOverrides } : {}),
    });
}

export async function refreshDiscoveredModesForScope(input: {
    profileId: string;
    scope: 'global' | 'workspace';
    workspaceFingerprint?: string;
}): Promise<OperationalResult<void>> {
    const paths = await resolveRegistryPaths({
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    const rootPath = input.scope === 'workspace' ? paths.workspaceAssetsRoot : paths.globalAssetsRoot;
    if (!rootPath) {
        return errOp('invalid_input', 'Workspace mode import requires a selected workspace.');
    }

    const discoveredAssets = await buildDiscoveredAssets({
        rootPath,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    await replaceDiscoveredModes({
        profileId: input.profileId,
        scope: input.scope,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        modes: discoveredAssets.modes,
    });
    return okOp(undefined);
}
