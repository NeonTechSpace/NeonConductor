import { topLevelTabs } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readEnumValue,
    readEntityId,
    readOptionalBoolean,
    readOptionalNumber,
    readObject,
    readOptionalString,
    readProfileId,
    readString,
    readStringArray,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    RegistryApplyPromotionInput,
    RegistryListResolvedInput,
    RegistryPreparePromotionInput,
    RegistryReadSkillBodyInput,
    RegistryRefreshInput,
    RegistrySearchRulesInput,
    RegistrySearchSkillsInput,
    RegistryPromotionSource,
    RegistryPromotionTargeting,
} from '@/app/backend/runtime/contracts/types';

import { registryPresetKeys, ruleActivationModes } from '@/shared/contracts/registryAssets';

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

function parsePromotionSource(value: unknown): RegistryPromotionSource {
    const source = readObject(value, 'source');
    const kind = readEnumValue(source.kind, 'source.kind', ['message', 'tool_result_artifact_window'] as const);
    const sessionId = readEntityId(source.sessionId, 'source.sessionId', 'sess');

    if (kind === 'message') {
        return {
            kind,
            sessionId,
            messageId: readEntityId(source.messageId, 'source.messageId', 'msg'),
        };
    }

    return {
        kind,
        sessionId,
        messagePartId: readEntityId(source.messagePartId, 'source.messagePartId', 'part'),
        startLine: Math.max(1, Math.floor(readOptionalNumber(source.startLine, 'source.startLine') ?? 1)),
        lineCount: Math.min(400, Math.max(1, Math.floor(readOptionalNumber(source.lineCount, 'source.lineCount') ?? 1))),
    };
}

function parsePromotionTargeting(value: unknown, field: string): RegistryPromotionTargeting {
    const source = readObject(value, field);
    const targetKind = readEnumValue(source.targetKind, `${field}.targetKind`, ['shared', 'preset', 'exact_mode'] as const);

    if (targetKind === 'shared') {
        return { targetKind };
    }

    if (targetKind === 'preset') {
        return {
            targetKind,
            presetKey: readEnumValue(source.presetKey, `${field}.presetKey`, registryPresetKeys),
        };
    }

    const targetMode = readObject(source.targetMode, `${field}.targetMode`);
    return {
        targetKind,
        targetMode: {
            topLevelTab: readEnumValue(targetMode.topLevelTab, `${field}.targetMode.topLevelTab`, topLevelTabs),
            modeKey: readString(targetMode.modeKey, `${field}.targetMode.modeKey`),
        },
    };
}

function readOptionalTags(value: unknown): string[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const tags = readStringArray(value, 'draft.tags').map((tag) => tag.trim()).filter((tag) => tag.length > 0);
    return tags.length > 0 ? Array.from(new Set(tags)) : undefined;
}

export function parseRegistryPreparePromotionInput(input: unknown): RegistryPreparePromotionInput {
    const source = readObject(input, 'input');
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    return {
        profileId: readProfileId(source),
        source: parsePromotionSource(source.source),
        target: readEnumValue(source.target, 'target', ['rule', 'skill_snippet'] as const),
        scope: readEnumValue(source.scope, 'scope', ['global', 'workspace'] as const),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        targeting: parsePromotionTargeting(source.targeting, 'targeting'),
    };
}

export function parseRegistryApplyPromotionInput(input: unknown): RegistryApplyPromotionInput {
    const source = readObject(input, 'input');
    const draftSource = readObject(source.draft, 'draft');
    const workspaceFingerprint = readOptionalString(draftSource.workspaceFingerprint, 'draft.workspaceFingerprint');
    const tags = readOptionalTags(draftSource.tags);
    const description = readOptionalString(draftSource.description, 'draft.description');
    const activationMode =
        draftSource.activationMode !== undefined
            ? readEnumValue(draftSource.activationMode, 'draft.activationMode', ruleActivationModes)
            : undefined;

    return {
        profileId: readProfileId(source),
        source: parsePromotionSource(source.source),
        sourceDigest: readString(source.sourceDigest, 'sourceDigest'),
        draft: {
            target: readEnumValue(draftSource.target, 'draft.target', ['rule', 'skill_snippet'] as const),
            scope: readEnumValue(draftSource.scope, 'draft.scope', ['global', 'workspace'] as const),
            ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
            targeting: parsePromotionTargeting(draftSource.targeting, 'draft.targeting'),
            key: readString(draftSource.key, 'draft.key'),
            name: readString(draftSource.name, 'draft.name'),
            ...(description ? { description } : {}),
            ...(tags ? { tags } : {}),
            bodyMarkdown: readString(draftSource.bodyMarkdown, 'draft.bodyMarkdown'),
            ...(activationMode ? { activationMode } : {}),
        },
        overwrite: readOptionalBoolean(source.overwrite, 'overwrite') ?? false,
    };
}

export const registryRefreshInputSchema = createParser(parseRegistryRefreshInput);
export const registryListResolvedInputSchema = createParser(parseRegistryListResolvedInput);
export const registrySearchSkillsInputSchema = createParser(parseRegistrySearchSkillsInput);
export const registrySearchRulesInputSchema = createParser(parseRegistrySearchRulesInput);
export const registryReadSkillBodyInputSchema = createParser(parseRegistryReadSkillBodyInput);
export const registryPreparePromotionInputSchema = createParser(parseRegistryPreparePromotionInput);
export const registryApplyPromotionInputSchema = createParser(parseRegistryApplyPromotionInput);
