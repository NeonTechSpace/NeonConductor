import {
    modeAuthoringRoles,
    modeRoleTemplateKeys,
    topLevelTabs,
} from '@/app/backend/runtime/contracts/enums';
import {
    createDefaultPreparedContextModeOverrides,
    normalizePreparedContextModeOverrides,
    normalizePreparedContextProfileDefaults,
} from '@/app/backend/runtime/contracts/types/prompt';
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
    ModeDraftSourceKind,
    PromptLayerCreateCustomModeInput,
    PromptLayerCreateModeDraftInput,
    PromptLayerDiscardModeDraftInput,
    PromptLayerDeleteCustomModeInput,
    PromptLayerEditableCustomModePayload,
    PromptLayerApplyModeDraftInput,
    PromptLayerExportCustomModeInput,
    PromptLayerGetCustomModeInput,
    PromptLayerGetSettingsInput,
    PromptLayerImportCustomModeInput,
    PromptLayerModeDraftPayload,
    PromptLayerResetBuiltInModePromptInput,
    PromptLayerResetAppGlobalInstructionsInput,
    PromptLayerResetPreparedContextProfileDefaultsInput,
    PromptLayerResetProfileGlobalInstructionsInput,
    PromptLayerResetTopLevelInstructionsInput,
    PromptLayerCustomModePayload,
    PromptLayerSetPreparedContextProfileDefaultsInput,
    PromptLayerSetBuiltInModePromptInput,
    PromptLayerSetAppGlobalInstructionsInput,
    PromptLayerSetProfileGlobalInstructionsInput,
    PromptLayerSetTopLevelInstructionsInput,
    PromptLayerUpdateCustomModeInput,
    PromptLayerUpdateModeDraftInput,
    PromptLayerValidateModeDraftInput,
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

function readOptionalModeAuthoringRole(value: unknown, field: string) {
    if (value === undefined) {
        return undefined;
    }

    return readEnumValue(value, field, modeAuthoringRoles);
}

function readOptionalModeRoleTemplate(value: unknown, field: string) {
    if (value === undefined) {
        return undefined;
    }

    return readEnumValue(value, field, modeRoleTemplateKeys);
}

function readModeDraftSourceKind(value: unknown, field: string): ModeDraftSourceKind {
    return readEnumValue(value, field, ['manual', 'portable_json_v1', 'portable_json_v2', 'pasted_source_material'] as const);
}

function readPreparedContextModeOverrides(value: unknown, field: string) {
    if (value === undefined) {
        return createDefaultPreparedContextModeOverrides();
    }

    const source = readObject(value, field);
    return normalizePreparedContextModeOverrides(source);
}

function readPreparedContextProfileDefaults(value: unknown, field: string) {
    const source = readObject(value, field);
    return normalizePreparedContextProfileDefaults(source);
}

function parsePromptLayerCustomModePayload(value: unknown, field: string): PromptLayerCustomModePayload {
    const source = readObject(value, field);
    const description = readOptionalInstructionText(source.description, `${field}.description`);
    const roleDefinition = readOptionalInstructionText(source.roleDefinition, `${field}.roleDefinition`);
    const customInstructions = readOptionalInstructionText(source.customInstructions, `${field}.customInstructions`);
    const whenToUse = readOptionalInstructionText(source.whenToUse, `${field}.whenToUse`);
    const tags = readOptionalStringList(source.tags, `${field}.tags`);
    const promptLayerOverrides = source.promptLayerOverrides
        ? readPreparedContextModeOverrides(source.promptLayerOverrides, `${field}.promptLayerOverrides`)
        : undefined;
    const authoringRole = readEnumValue(source.authoringRole, `${field}.authoringRole`, modeAuthoringRoles);
    const roleTemplate = readEnumValue(source.roleTemplate, `${field}.roleTemplate`, modeRoleTemplateKeys);

    return {
        slug: readString(source.slug, `${field}.slug`),
        name: readString(source.name, `${field}.name`),
        authoringRole,
        roleTemplate,
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
        ...(promptLayerOverrides ? { promptLayerOverrides } : {}),
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
    const promptLayerOverrides = source.promptLayerOverrides
        ? readPreparedContextModeOverrides(source.promptLayerOverrides, `${field}.promptLayerOverrides`)
        : undefined;
    const authoringRole = readEnumValue(source.authoringRole, `${field}.authoringRole`, modeAuthoringRoles);
    const roleTemplate = readEnumValue(source.roleTemplate, `${field}.roleTemplate`, modeRoleTemplateKeys);

    return {
        name: readString(source.name, `${field}.name`),
        authoringRole,
        roleTemplate,
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
        ...(promptLayerOverrides ? { promptLayerOverrides } : {}),
    };
}

function parsePromptLayerModeDraftPayload(value: unknown, field: string): PromptLayerModeDraftPayload {
    const source = readObject(value, field);
    const topLevelTab =
        source.topLevelTab === undefined ? undefined : readEnumValue(source.topLevelTab, `${field}.topLevelTab`, topLevelTabs);
    const slug = readOptionalInstructionText(source.slug, `${field}.slug`);
    const name = readOptionalInstructionText(source.name, `${field}.name`);
    const description = readOptionalInstructionText(source.description, `${field}.description`);
    const authoringRole = readOptionalModeAuthoringRole(source.authoringRole, `${field}.authoringRole`);
    const roleTemplate = readOptionalModeRoleTemplate(source.roleTemplate, `${field}.roleTemplate`);
    const roleDefinition = readOptionalInstructionText(source.roleDefinition, `${field}.roleDefinition`);
    const customInstructions = readOptionalInstructionText(source.customInstructions, `${field}.customInstructions`);
    const whenToUse = readOptionalInstructionText(source.whenToUse, `${field}.whenToUse`);
    const tags = readOptionalStringList(source.tags, `${field}.tags`);
    const promptLayerOverrides = source.promptLayerOverrides
        ? readPreparedContextModeOverrides(source.promptLayerOverrides, `${field}.promptLayerOverrides`)
        : undefined;

    return {
        ...(topLevelTab ? { topLevelTab } : {}),
        ...(slug ? { slug } : {}),
        ...(name ? { name } : {}),
        ...(authoringRole ? { authoringRole } : {}),
        ...(roleTemplate ? { roleTemplate } : {}),
        ...(description ? { description } : {}),
        ...(roleDefinition ? { roleDefinition } : {}),
        ...(customInstructions ? { customInstructions } : {}),
        ...(whenToUse ? { whenToUse } : {}),
        ...(tags ? { tags } : {}),
        ...(promptLayerOverrides ? { promptLayerOverrides } : {}),
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
        promptLayerOverrides: readPreparedContextModeOverrides(source.promptLayerOverrides, 'promptLayerOverrides'),
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
    const topLevelTab =
        source.topLevelTab === undefined ? undefined : readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs);

    return {
        profileId: readProfileId(source),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        jsonText: readString(source.jsonText, 'jsonText'),
        ...(topLevelTab ? { topLevelTab } : {}),
    };
}

export function parsePromptLayerCreateModeDraftInput(input: unknown): PromptLayerCreateModeDraftInput {
    const source = readObject(input, 'input');
    const scope = readCustomModeScope(source.scope, 'scope');
    const workspaceFingerprint = readWorkspaceFingerprintForScope(source, scope);
    const sourceText = readOptionalInstructionText(source.sourceText, 'sourceText');

    return {
        profileId: readProfileId(source),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        sourceKind: readModeDraftSourceKind(source.sourceKind, 'sourceKind'),
        ...(sourceText ? { sourceText } : {}),
        mode: parsePromptLayerModeDraftPayload(source.mode, 'mode'),
    };
}

export function parsePromptLayerUpdateModeDraftInput(input: unknown): PromptLayerUpdateModeDraftInput {
    const source = readObject(input, 'input');
    const sourceText = readOptionalInstructionText(source.sourceText, 'sourceText');

    return {
        profileId: readProfileId(source),
        draftId: readString(source.draftId, 'draftId'),
        mode: parsePromptLayerModeDraftPayload(source.mode, 'mode'),
        ...(sourceText ? { sourceText } : {}),
    };
}

export function parsePromptLayerValidateModeDraftInput(input: unknown): PromptLayerValidateModeDraftInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        draftId: readString(source.draftId, 'draftId'),
    };
}

export function parsePromptLayerApplyModeDraftInput(input: unknown): PromptLayerApplyModeDraftInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        draftId: readString(source.draftId, 'draftId'),
        overwrite: readBoolean(source.overwrite, 'overwrite'),
    };
}

export function parsePromptLayerDiscardModeDraftInput(input: unknown): PromptLayerDiscardModeDraftInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        draftId: readString(source.draftId, 'draftId'),
    };
}

export function parsePromptLayerSetPreparedContextProfileDefaultsInput(
    input: unknown
): PromptLayerSetPreparedContextProfileDefaultsInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        defaults: readPreparedContextProfileDefaults(source.defaults, 'defaults'),
    };
}

export function parsePromptLayerResetPreparedContextProfileDefaultsInput(
    input: unknown
): PromptLayerResetPreparedContextProfileDefaultsInput {
    return parseProfileInput(input);
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
export const promptLayerSetPreparedContextProfileDefaultsInputSchema = createParser(
    parsePromptLayerSetPreparedContextProfileDefaultsInput
);
export const promptLayerResetPreparedContextProfileDefaultsInputSchema = createParser(
    parsePromptLayerResetPreparedContextProfileDefaultsInput
);
export const promptLayerResetBuiltInModePromptInputSchema = createParser(parsePromptLayerResetBuiltInModePromptInput);
export const promptLayerExportCustomModeInputSchema = createParser(parsePromptLayerExportCustomModeInput);
export const promptLayerGetCustomModeInputSchema = createParser(parsePromptLayerGetCustomModeInput);
export const promptLayerCreateCustomModeInputSchema = createParser(parsePromptLayerCreateCustomModeInput);
export const promptLayerUpdateCustomModeInputSchema = createParser(parsePromptLayerUpdateCustomModeInput);
export const promptLayerDeleteCustomModeInputSchema = createParser(parsePromptLayerDeleteCustomModeInput);
export const promptLayerImportCustomModeInputSchema = createParser(parsePromptLayerImportCustomModeInput);
export const promptLayerCreateModeDraftInputSchema = createParser(parsePromptLayerCreateModeDraftInput);
export const promptLayerUpdateModeDraftInputSchema = createParser(parsePromptLayerUpdateModeDraftInput);
export const promptLayerValidateModeDraftInputSchema = createParser(parsePromptLayerValidateModeDraftInput);
export const promptLayerApplyModeDraftInputSchema = createParser(parsePromptLayerApplyModeDraftInput);
export const promptLayerDiscardModeDraftInputSchema = createParser(parsePromptLayerDiscardModeDraftInput);
