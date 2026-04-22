import { topLevelTabs } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readEnumValue,
    readEntityId,
    readObject,
    readOptionalString,
    readProfileId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    RegistryListResolvedInput,
    RegistryReadSkillBodyInput,
    RegistryRefreshInput,
    RegistrySearchRulesInput,
    RegistrySearchSkillsInput,
} from '@/app/backend/runtime/contracts/types';

export function parseRegistryRefreshInput(input: unknown): RegistryRefreshInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sandboxId = source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;

    return {
        profileId: readProfileId(source),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
    };
}

export function parseRegistryListResolvedInput(input: unknown): RegistryListResolvedInput {
    return parseRegistryRefreshInput(input);
}

export function parseRegistrySearchSkillsInput(input: unknown): RegistrySearchSkillsInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');
    const sandboxId = source.sandboxId !== undefined ? readEntityId(source.sandboxId, 'sandboxId', 'sb') : undefined;
    const query = readOptionalString(source.query, 'query');
    const topLevelTab =
        source.topLevelTab !== undefined ? readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs) : undefined;
    const modeKey = readOptionalString(source.modeKey, 'modeKey');

    return {
        profileId: readProfileId(source),
        ...(query ? { query } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(sandboxId ? { sandboxId } : {}),
        ...(topLevelTab ? { topLevelTab } : {}),
        ...(modeKey ? { modeKey } : {}),
    };
}

export function parseRegistrySearchRulesInput(input: unknown): RegistrySearchRulesInput {
    return parseRegistrySearchSkillsInput(input);
}

export function parseRegistryReadSkillBodyInput(input: unknown): RegistryReadSkillBodyInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        skillId: readString(source.skillId, 'skillId'),
    };
}

export const registryRefreshInputSchema = createParser(parseRegistryRefreshInput);
export const registryListResolvedInputSchema = createParser(parseRegistryListResolvedInput);
export const registrySearchSkillsInputSchema = createParser(parseRegistrySearchSkillsInput);
export const registrySearchRulesInputSchema = createParser(parseRegistrySearchRulesInput);
export const registryReadSkillBodyInputSchema = createParser(parseRegistryReadSkillBodyInput);
