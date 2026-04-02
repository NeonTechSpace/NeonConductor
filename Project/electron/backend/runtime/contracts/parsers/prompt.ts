import {
    behaviorFlags as knownBehaviorFlags,
    toolCapabilities as knownToolCapabilities,
    runtimeRequirementProfiles as knownRuntimeRequirementProfiles,
    workflowCapabilities as knownWorkflowCapabilities,
    topLevelTabs,
    type ToolCapability,
    type RuntimeRequirementProfile,
} from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readBoolean,
    readEnumValue,
    readObject,
    readOptionalString,
    readProfileId,
    readString,
    readStringArray,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    PromptLayerCreateCustomModeInput,
    PromptLayerDeleteCustomModeInput,
    PromptLayerEditableCustomModePayload,
    PromptLayerExportCustomModeInput,
    PromptLayerGetCustomModeInput,
    PromptLayerGetSettingsInput,
    PromptLayerImportCustomModeInput,
    PromptLayerResetBuiltInModePromptInput,
    PromptLayerResetAppGlobalInstructionsInput,
    PromptLayerResetProfileGlobalInstructionsInput,
    PromptLayerResetTopLevelInstructionsInput,
    PromptLayerCustomModePayload,
    PromptLayerSetBuiltInModePromptInput,
    PromptLayerSetAppGlobalInstructionsInput,
    PromptLayerSetProfileGlobalInstructionsInput,
    PromptLayerSetTopLevelInstructionsInput,
    PromptLayerUpdateCustomModeInput,
    ProfileInput,
} from '@/app/backend/runtime/contracts/types';

function readInstructionValue(value: unknown, field: string): string {
    if (typeof value !== 'string') {
        throw new Error(`Invalid "${field}": expected string.`);
    }

    return value.trim();
}

function parseProfileInput(input: unknown): ProfileInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
    };
}

function readCustomModeScope(value: unknown, field: string): 'global' | 'workspace' {
    return readEnumValue(value, field, ['global', 'workspace'] as const);
}

function readWorkspaceFingerprintForScope(
    source: Record<string, unknown>,
    scope: 'global' | 'workspace'
): string | undefined {
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    if (scope === 'workspace' && !workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": required when scope is "workspace".');
    }
    if (scope === 'global' && workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": not allowed when scope is "global".');
    }

    return workspaceFingerprint;
}

function readOptionalInstructionText(value: unknown, field: string): string | undefined {
    if (value === undefined) {
        return undefined;
    }
    if (typeof value !== 'string') {
        throw new Error(`Invalid "${field}": expected string.`);
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function readOptionalStringList(value: unknown, field: string): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    const values = readStringArray(value, field)
        .map((item) => item.trim())
        .filter((item) => item.length > 0);
    return values.length > 0 ? Array.from(new Set(values)) : undefined;
}

function readOptionalToolCapabilities(value: unknown, field: string): ToolCapability[] | undefined {
    if (value === undefined) {
        return undefined;
    }

    const capabilities = readStringArray(value, field).map((capability) => capability.trim());
    const invalidCapability = capabilities.find(
        (capability) => !knownToolCapabilities.includes(capability as ToolCapability)
    );
    if (invalidCapability) {
        throw new Error(`Invalid "${field}": expected only ${knownToolCapabilities.join(', ')}.`);
    }

    return capabilities.length > 0 ? Array.from(new Set(capabilities as ToolCapability[])) : undefined;
}

function readOptionalEnumList<const T extends readonly string[]>(
    value: unknown,
    field: string,
    allowedValues: T
): T[number][] | undefined {
    if (value === undefined) {
        return undefined;
    }

    const entries = readStringArray(value, field).map((entry) => entry.trim());
    const invalidEntry = entries.find((entry) => !allowedValues.includes(entry as T[number]));
    if (invalidEntry) {
        throw new Error(`Invalid "${field}": expected only ${allowedValues.join(', ')}.`);
    }

    return entries.length > 0 ? Array.from(new Set(entries as T[number][])) : undefined;
}

function readOptionalRuntimeRequirementProfile(
    value: unknown,
    field: string
): RuntimeRequirementProfile | undefined {
    if (value === undefined) {
        return undefined;
    }

    return readEnumValue(value, field, knownRuntimeRequirementProfiles);
}

function parsePromptLayerCustomModePayload(value: unknown, field: string): PromptLayerCustomModePayload {
    const source = readObject(value, field);
    const description = readOptionalInstructionText(source.description, `${field}.description`);
    const roleDefinition = readOptionalInstructionText(source.roleDefinition, `${field}.roleDefinition`);
    const customInstructions = readOptionalInstructionText(source.customInstructions, `${field}.customInstructions`);
    const whenToUse = readOptionalInstructionText(source.whenToUse, `${field}.whenToUse`);
    const tags = readOptionalStringList(source.tags, `${field}.tags`);
    const toolCapabilities = readOptionalToolCapabilities(source.toolCapabilities, `${field}.toolCapabilities`);
    const workflowCapabilities = readOptionalEnumList(
        source.workflowCapabilities,
        `${field}.workflowCapabilities`,
        knownWorkflowCapabilities
    );
    const behaviorFlags = readOptionalEnumList(
        source.behaviorFlags,
        `${field}.behaviorFlags`,
        knownBehaviorFlags
    );
    const runtimeProfile = readOptionalRuntimeRequirementProfile(source.runtimeProfile, `${field}.runtimeProfile`);

    return {
        slug: readString(source.slug, `${field}.slug`),
        name: readString(source.name, `${field}.name`),
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
        ...(toolCapabilities ? { toolCapabilities } : {}),
        ...(workflowCapabilities ? { workflowCapabilities } : {}),
        ...(behaviorFlags ? { behaviorFlags } : {}),
        ...(runtimeProfile ? { runtimeProfile } : {}),
    };
}

function parsePromptLayerEditableCustomModePayload(
    value: unknown,
    field: string
): PromptLayerEditableCustomModePayload {
    const source = readObject(value, field);
    const description = readOptionalInstructionText(source.description, `${field}.description`);
    const roleDefinition = readOptionalInstructionText(source.roleDefinition, `${field}.roleDefinition`);
    const customInstructions = readOptionalInstructionText(source.customInstructions, `${field}.customInstructions`);
    const whenToUse = readOptionalInstructionText(source.whenToUse, `${field}.whenToUse`);
    const tags = readOptionalStringList(source.tags, `${field}.tags`);
    const toolCapabilities = readOptionalToolCapabilities(source.toolCapabilities, `${field}.toolCapabilities`);
    const workflowCapabilities = readOptionalEnumList(
        source.workflowCapabilities,
        `${field}.workflowCapabilities`,
        knownWorkflowCapabilities
    );
    const behaviorFlags = readOptionalEnumList(
        source.behaviorFlags,
        `${field}.behaviorFlags`,
        knownBehaviorFlags
    );
    const runtimeProfile = readOptionalRuntimeRequirementProfile(source.runtimeProfile, `${field}.runtimeProfile`);

    return {
        name: readString(source.name, `${field}.name`),
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
        ...(toolCapabilities ? { toolCapabilities } : {}),
        ...(workflowCapabilities ? { workflowCapabilities } : {}),
        ...(behaviorFlags ? { behaviorFlags } : {}),
        ...(runtimeProfile ? { runtimeProfile } : {}),
    };
}

export function parsePromptLayerGetSettingsInput(input: unknown): PromptLayerGetSettingsInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    return {
        profileId: readProfileId(source),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePromptLayerSetAppGlobalInstructionsInput(
    input: unknown
): PromptLayerSetAppGlobalInstructionsInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        value: readInstructionValue(source.value, 'value'),
    };
}

export function parsePromptLayerResetAppGlobalInstructionsInput(
    input: unknown
): PromptLayerResetAppGlobalInstructionsInput {
    return parseProfileInput(input);
}

export function parsePromptLayerSetProfileGlobalInstructionsInput(
    input: unknown
): PromptLayerSetProfileGlobalInstructionsInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        value: readInstructionValue(source.value, 'value'),
    };
}

export function parsePromptLayerResetProfileGlobalInstructionsInput(
    input: unknown
): PromptLayerResetProfileGlobalInstructionsInput {
    return parseProfileInput(input);
}

export function parsePromptLayerSetTopLevelInstructionsInput(input: unknown): PromptLayerSetTopLevelInstructionsInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        value: readInstructionValue(source.value, 'value'),
    };
}

export function parsePromptLayerResetTopLevelInstructionsInput(
    input: unknown
): PromptLayerResetTopLevelInstructionsInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
    };
}

export function parsePromptLayerSetBuiltInModePromptInput(input: unknown): PromptLayerSetBuiltInModePromptInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        roleDefinition: readInstructionValue(source.roleDefinition, 'roleDefinition'),
        customInstructions: readInstructionValue(source.customInstructions, 'customInstructions'),
    };
}

export function parsePromptLayerResetBuiltInModePromptInput(input: unknown): PromptLayerResetBuiltInModePromptInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
    };
}

export function parsePromptLayerExportCustomModeInput(input: unknown): PromptLayerExportCustomModeInput {
    const source = readObject(input, 'input');
    const scope = readCustomModeScope(source.scope, 'scope');
    const workspaceFingerprint = readWorkspaceFingerprintForScope(source, scope);

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePromptLayerGetCustomModeInput(input: unknown): PromptLayerGetCustomModeInput {
    const source = readObject(input, 'input');
    const scope = readCustomModeScope(source.scope, 'scope');
    const workspaceFingerprint = readWorkspaceFingerprintForScope(source, scope);

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
    };
}

export function parsePromptLayerCreateCustomModeInput(input: unknown): PromptLayerCreateCustomModeInput {
    const source = readObject(input, 'input');
    const scope = readCustomModeScope(source.scope, 'scope');
    const workspaceFingerprint = readWorkspaceFingerprintForScope(source, scope);

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        mode: parsePromptLayerCustomModePayload(source.mode, 'mode'),
    };
}

export function parsePromptLayerUpdateCustomModeInput(input: unknown): PromptLayerUpdateCustomModeInput {
    const source = readObject(input, 'input');
    const scope = readCustomModeScope(source.scope, 'scope');
    const workspaceFingerprint = readWorkspaceFingerprintForScope(source, scope);

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        mode: parsePromptLayerEditableCustomModePayload(source.mode, 'mode'),
    };
}

export function parsePromptLayerDeleteCustomModeInput(input: unknown): PromptLayerDeleteCustomModeInput {
    const source = readObject(input, 'input');
    const scope = readCustomModeScope(source.scope, 'scope');
    const workspaceFingerprint = readWorkspaceFingerprintForScope(source, scope);

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        modeKey: readString(source.modeKey, 'modeKey'),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export function parsePromptLayerImportCustomModeInput(input: unknown): PromptLayerImportCustomModeInput {
    const source = readObject(input, 'input');
    const scope = readCustomModeScope(source.scope, 'scope');
    const workspaceFingerprint = readWorkspaceFingerprintForScope(source, scope);

    return {
        profileId: readProfileId(source),
        topLevelTab: readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        jsonText: readString(source.jsonText, 'jsonText'),
        overwrite: readBoolean(source.overwrite, 'overwrite'),
    };
}

export const promptLayerGetSettingsInputSchema = createParser(parsePromptLayerGetSettingsInput);
export const promptLayerSetAppGlobalInstructionsInputSchema = createParser(
    parsePromptLayerSetAppGlobalInstructionsInput
);
export const promptLayerResetAppGlobalInstructionsInputSchema = createParser(
    parsePromptLayerResetAppGlobalInstructionsInput
);
export const promptLayerSetProfileGlobalInstructionsInputSchema = createParser(
    parsePromptLayerSetProfileGlobalInstructionsInput
);
export const promptLayerResetProfileGlobalInstructionsInputSchema = createParser(
    parsePromptLayerResetProfileGlobalInstructionsInput
);
export const promptLayerSetTopLevelInstructionsInputSchema = createParser(parsePromptLayerSetTopLevelInstructionsInput);
export const promptLayerResetTopLevelInstructionsInputSchema = createParser(
    parsePromptLayerResetTopLevelInstructionsInput
);
export const promptLayerSetBuiltInModePromptInputSchema = createParser(parsePromptLayerSetBuiltInModePromptInput);
export const promptLayerResetBuiltInModePromptInputSchema = createParser(parsePromptLayerResetBuiltInModePromptInput);
export const promptLayerExportCustomModeInputSchema = createParser(parsePromptLayerExportCustomModeInput);
export const promptLayerGetCustomModeInputSchema = createParser(parsePromptLayerGetCustomModeInput);
export const promptLayerCreateCustomModeInputSchema = createParser(parsePromptLayerCreateCustomModeInput);
export const promptLayerUpdateCustomModeInputSchema = createParser(parsePromptLayerUpdateCustomModeInput);
export const promptLayerDeleteCustomModeInputSchema = createParser(parsePromptLayerDeleteCustomModeInput);
export const promptLayerImportCustomModeInputSchema = createParser(parsePromptLayerImportCustomModeInput);
