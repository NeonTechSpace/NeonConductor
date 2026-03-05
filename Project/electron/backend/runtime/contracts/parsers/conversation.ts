import {
    conversationEditResolutions,
    conversationScopes,
    conversationThreadGroupViews,
    conversationThreadSorts,
    threadTitleGenerationModes,
    topLevelTabs,
} from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readBoolean,
    readEntityId,
    readEnumValue,
    readObject,
    readOptionalString,
    readProfileId,
    readString,
    readStringArray,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import { parseProfileInput } from '@/app/backend/runtime/contracts/parsers/profile';
import type {
    ConversationCreateThreadInput,
    ConversationGetEditPreferenceInput,
    ConversationGetThreadTitlePreferenceInput,
    ConversationListBucketsInput,
    ConversationListTagsInput,
    ConversationListThreadsInput,
    ConversationRenameThreadInput,
    ConversationSetEditPreferenceInput,
    ConversationSetThreadTitlePreferenceInput,
    ConversationSetThreadTagsInput,
    ConversationUpsertTagInput,
} from '@/app/backend/runtime/contracts/types';

export function parseConversationListBucketsInput(input: unknown): ConversationListBucketsInput {
    return parseProfileInput(input);
}

export function parseConversationListThreadsInput(input: unknown): ConversationListThreadsInput {
    const source = readObject(input, 'input');
    const activeTab =
        source.activeTab !== undefined ? readEnumValue(source.activeTab, 'activeTab', topLevelTabs) : undefined;
    const showAllModes =
        source.showAllModes !== undefined ? readBoolean(source.showAllModes, 'showAllModes') : undefined;
    const groupView =
        source.groupView !== undefined
            ? readEnumValue(source.groupView, 'groupView', conversationThreadGroupViews)
            : undefined;
    const scope = source.scope !== undefined ? readEnumValue(source.scope, 'scope', conversationScopes) : undefined;
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    if (workspaceFingerprint && scope !== 'workspace') {
        throw new Error('Invalid "workspaceFingerprint": allowed only when scope is "workspace".');
    }

    return {
        profileId: readProfileId(source),
        ...(activeTab ? { activeTab } : {}),
        ...(showAllModes !== undefined ? { showAllModes } : {}),
        ...(groupView ? { groupView } : {}),
        ...(scope ? { scope } : {}),
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(source.sort !== undefined ? { sort: readEnumValue(source.sort, 'sort', conversationThreadSorts) } : {}),
    };
}

export function parseConversationCreateThreadInput(input: unknown): ConversationCreateThreadInput {
    const source = readObject(input, 'input');
    const topLevelTab =
        source.topLevelTab !== undefined ? readEnumValue(source.topLevelTab, 'topLevelTab', topLevelTabs) : undefined;
    const scope = readEnumValue(source.scope, 'scope', conversationScopes);
    const workspaceFingerprint = readOptionalString(source.workspaceFingerprint, 'workspaceFingerprint');

    if (scope === 'workspace' && !workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": required when scope is "workspace".');
    }

    if (scope !== 'workspace' && workspaceFingerprint) {
        throw new Error('Invalid "workspaceFingerprint": allowed only when scope is "workspace".');
    }

    return {
        profileId: readProfileId(source),
        ...(topLevelTab ? { topLevelTab } : {}),
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        title: readString(source.title, 'title'),
    };
}

export function parseConversationRenameThreadInput(input: unknown): ConversationRenameThreadInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        threadId: readEntityId(source.threadId, 'threadId', 'thr'),
        title: readString(source.title, 'title'),
    };
}

export function parseConversationListTagsInput(input: unknown): ConversationListTagsInput {
    return parseProfileInput(input);
}

export function parseConversationUpsertTagInput(input: unknown): ConversationUpsertTagInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        label: readString(source.label, 'label'),
    };
}

export function parseConversationSetThreadTagsInput(input: unknown): ConversationSetThreadTagsInput {
    const source = readObject(input, 'input');
    const tagIds = readStringArray(source.tagIds, 'tagIds');

    return {
        profileId: readProfileId(source),
        threadId: readEntityId(source.threadId, 'threadId', 'thr'),
        tagIds,
    };
}

export function parseConversationGetEditPreferenceInput(input: unknown): ConversationGetEditPreferenceInput {
    return parseProfileInput(input);
}

export function parseConversationSetEditPreferenceInput(input: unknown): ConversationSetEditPreferenceInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        value: readEnumValue(source.value, 'value', conversationEditResolutions),
    };
}

export function parseConversationGetThreadTitlePreferenceInput(
    input: unknown
): ConversationGetThreadTitlePreferenceInput {
    return parseProfileInput(input);
}

export function parseConversationSetThreadTitlePreferenceInput(
    input: unknown
): ConversationSetThreadTitlePreferenceInput {
    const source = readObject(input, 'input');
    const mode = readEnumValue(source.mode, 'mode', threadTitleGenerationModes);
    const aiModel = readOptionalString(source.aiModel, 'aiModel');

    if (mode === 'template' && aiModel) {
        throw new Error('Invalid "aiModel": allowed only when mode is "ai_optional".');
    }
    if (mode === 'ai_optional' && !aiModel) {
        throw new Error('Invalid "aiModel": required when mode is "ai_optional".');
    }

    return {
        profileId: readProfileId(source),
        mode,
        ...(aiModel ? { aiModel } : {}),
    };
}

export const conversationListBucketsInputSchema = createParser(parseConversationListBucketsInput);
export const conversationListThreadsInputSchema = createParser(parseConversationListThreadsInput);
export const conversationCreateThreadInputSchema = createParser(parseConversationCreateThreadInput);
export const conversationRenameThreadInputSchema = createParser(parseConversationRenameThreadInput);
export const conversationListTagsInputSchema = createParser(parseConversationListTagsInput);
export const conversationUpsertTagInputSchema = createParser(parseConversationUpsertTagInput);
export const conversationSetThreadTagsInputSchema = createParser(parseConversationSetThreadTagsInput);
export const conversationGetEditPreferenceInputSchema = createParser(parseConversationGetEditPreferenceInput);
export const conversationSetEditPreferenceInputSchema = createParser(parseConversationSetEditPreferenceInput);
export const conversationGetThreadTitlePreferenceInputSchema = createParser(
    parseConversationGetThreadTitlePreferenceInput
);
export const conversationSetThreadTitlePreferenceInputSchema = createParser(
    parseConversationSetThreadTitlePreferenceInput
);
