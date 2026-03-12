import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import {
    patchThreadListRecord,
    replaceThreadTagRelations,
    toThreadListRecord,
    upsertBucketRecord,
    upsertTagRecord,
    upsertThreadListRecord,
} from '@/web/components/conversation/sidebar/sidebarCache';
import { patchProviderCache } from '@/web/components/settings/providerSettings/providerSettingsCache';
import { queryClient } from '@/web/lib/providers/trpcCore';
import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type {
    CheckpointRecord,
    ConversationRecord,
    DiffRecord,
    MessagePartRecord,
    MessageRecord,
    ProviderAuthStateRecord,
    ProviderModelRecord,
    RuntimeEventRecordV1,
    SessionSummaryRecord,
    TagRecord,
    ThreadRecord,
    ThreadTagRecord,
} from '@/app/backend/persistence/types';
import type { KiloModelProviderOption, ProviderEndpointProfileResult, ProviderListItem } from '@/app/backend/providers/service/types';

import {
    executionEnvironmentModes,
    kiloDynamicSorts,
    kiloRoutingModes,
    providerAuthMethods,
    providerAuthStates,
    providerIds,
    topLevelTabs,
} from '@/shared/contracts';
import type { KiloModelRoutingPreference } from '@/shared/contracts';

const conversationScopes = ['detached', 'workspace'] as const;
const providerCatalogStrategies = ['dynamic', 'static'] as const;
type SessionMessagesQueryData = { messages: MessageRecord[]; messageParts: MessagePartRecord[] };

function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readLiteral<TValue extends string>(value: unknown, allowedValues: readonly TValue[]): TValue | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    for (const allowedValue of allowedValues) {
        if (allowedValue === value) {
            return allowedValue;
        }
    }

    return undefined;
}

function readStringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

function hasRequiredStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
    return fields.every((field) => readString(value[field]));
}

function queryKeyContainsSegments(value: unknown, segments: readonly string[]): boolean {
    if (segments.length === 0) {
        return true;
    }

    if (Array.isArray(value)) {
        return segments.every((segment) => value.some((entry) => queryKeyContainsSegments(entry, [segment])));
    }

    if (isRecord(value)) {
        return Object.values(value).some((entry) => queryKeyContainsSegments(entry, segments));
    }

    return typeof value === 'string' && segments.includes(value);
}

function updateMatchingQueryData<TData>(
    pathSegments: readonly string[],
    updater: (current: TData | undefined) => TData | undefined
): void {
    queryClient.setQueriesData<TData>(
        {
            predicate: (query) => queryKeyContainsSegments(query.queryKey, pathSegments),
        },
        updater
    );
}

function readThreadRecord(value: unknown): ThreadRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const conversationId = readString(value['conversationId']);
    const title = readString(value['title']);
    const topLevelTab = readLiteral(value['topLevelTab'], topLevelTabs);
    const rootThreadId = readString(value['rootThreadId']);
    const isFavorite = readBoolean(value['isFavorite']);
    const executionEnvironmentMode = readLiteral(value['executionEnvironmentMode'], executionEnvironmentModes);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (
        !id ||
        !profileId ||
        !conversationId ||
        !title ||
        !topLevelTab ||
        !rootThreadId ||
        isFavorite === undefined ||
        !executionEnvironmentMode ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    const parentThreadId = readString(value['parentThreadId']);
    const executionBranch = readString(value['executionBranch']);
    const baseBranch = readString(value['baseBranch']);
    const worktreeId = readString(value['worktreeId']);
    const lastAssistantAt = readString(value['lastAssistantAt']);

    return {
        id,
        profileId,
        conversationId,
        title,
        topLevelTab,
        ...(parentThreadId ? { parentThreadId } : {}),
        rootThreadId,
        isFavorite,
        executionEnvironmentMode,
        ...(executionBranch ? { executionBranch } : {}),
        ...(baseBranch ? { baseBranch } : {}),
        ...(worktreeId && isEntityId(worktreeId, 'wt') ? { worktreeId } : {}),
        ...(lastAssistantAt ? { lastAssistantAt } : {}),
        createdAt,
        updatedAt,
    };
}

function readConversationRecord(value: unknown): ConversationRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const scope = readLiteral(value['scope'], conversationScopes);
    const title = readString(value['title']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    const workspaceFingerprint = readString(value['workspaceFingerprint']);
    if (!id || !profileId || !scope || !title || !createdAt || !updatedAt) {
        return undefined;
    }

    return {
        id,
        profileId,
        scope,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        title,
        createdAt,
        updatedAt,
    };
}

function readTagRecord(value: unknown): TagRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const label = readString(value['label']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (!id || !profileId || !label || !createdAt || !updatedAt) {
        return undefined;
    }

    return {
        id,
        profileId,
        label,
        createdAt,
        updatedAt,
    };
}

function readCheckpointRecord(value: unknown): CheckpointRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const sessionId = readString(value['sessionId']);
    const runId = readString(value['runId']);
    const diffId = readString(value['diffId']);
    const workspaceFingerprint = readString(value['workspaceFingerprint']);
    const topLevelTab = readLiteral(value['topLevelTab'], topLevelTabs);
    const modeKey = readString(value['modeKey']);
    const summary = readString(value['summary']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    const worktreeId = readString(value['worktreeId']);
    if (
        !id ||
        !isEntityId(id, 'ckpt') ||
        !profileId ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !runId ||
        !isEntityId(runId, 'run') ||
        !diffId ||
        !workspaceFingerprint ||
        !topLevelTab ||
        !modeKey ||
        !summary ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    return {
        id,
        profileId,
        sessionId,
        runId,
        diffId,
        workspaceFingerprint,
        ...(worktreeId && isEntityId(worktreeId, 'wt') ? { worktreeId } : {}),
        topLevelTab,
        modeKey,
        summary,
        createdAt,
        updatedAt,
    };
}

function readDiffRecord(value: unknown): DiffRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const sessionId = readString(value['sessionId']);
    const runId = value['runId'] === null ? null : readString(value['runId']);
    const summary = readString(value['summary']);
    const artifact = readDiffArtifact(value['artifact']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (!id || !profileId || !sessionId || summary === undefined || !artifact || !createdAt || !updatedAt) {
        return undefined;
    }

    return {
        id,
        profileId,
        sessionId,
        runId: runId ?? null,
        summary,
        artifact,
        createdAt,
        updatedAt,
    };
}

function readProviderListItem(value: unknown): ProviderListItem | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readLiteral(value['id'], providerIds);
    const label = readString(value['label']);
    const supportsByok = readBoolean(value['supportsByok']);
    const isDefault = readBoolean(value['isDefault']);
    const authMethod = readLiteral(value['authMethod'], [...providerAuthMethods, 'none'] as const);
    const authState = readLiteral(value['authState'], providerAuthStates);
    const availableAuthMethods = Array.isArray(value['availableAuthMethods'])
        ? value['availableAuthMethods']
              .map((entry) => readLiteral(entry, providerAuthMethods))
              .filter((entry): entry is (typeof providerAuthMethods)[number] => entry !== undefined)
        : undefined;
    const endpointProfileValue = value['endpointProfile'];
    const endpointProfilesValue = value['endpointProfiles'];
    const apiKeyCtaValue = value['apiKeyCta'];
    const featuresValue = value['features'];
    if (
        !id ||
        !label ||
        supportsByok === undefined ||
        isDefault === undefined ||
        !authMethod ||
        !authState ||
        !availableAuthMethods ||
        !isRecord(endpointProfileValue) ||
        !isRecord(apiKeyCtaValue) ||
        !isRecord(featuresValue) ||
        !Array.isArray(endpointProfilesValue)
    ) {
        return undefined;
    }

    const endpointProfileLabel = readString(endpointProfileValue['label']);
    const endpointProfileOptionValue = readString(endpointProfileValue['value']);
    const endpointProfiles = endpointProfilesValue
        .map((entry) => {
            if (!isRecord(entry)) {
                return undefined;
            }

            const optionValue = readString(entry['value']);
            const optionLabel = readString(entry['label']);
            return optionValue && optionLabel
                ? {
                      value: optionValue,
                      label: optionLabel,
                  }
                : undefined;
        })
        .filter((entry): entry is { value: string; label: string } => entry !== undefined);
    const apiKeyCtaLabel = readString(apiKeyCtaValue['label']);
    const apiKeyCtaUrl = readString(apiKeyCtaValue['url']);
    const catalogStrategy = readLiteral(featuresValue['catalogStrategy'], providerCatalogStrategies);
    const supportsKiloRouting = readBoolean(featuresValue['supportsKiloRouting']);
    const supportsModelProviderListing = readBoolean(featuresValue['supportsModelProviderListing']);
    const supportsEndpointProfiles = readBoolean(featuresValue['supportsEndpointProfiles']);
    if (
        !endpointProfileOptionValue ||
        !endpointProfileLabel ||
        endpointProfiles.length !== endpointProfilesValue.length ||
        !apiKeyCtaLabel ||
        !apiKeyCtaUrl ||
        !catalogStrategy ||
        supportsKiloRouting === undefined ||
        supportsModelProviderListing === undefined ||
        supportsEndpointProfiles === undefined
    ) {
        return undefined;
    }

    return {
        id,
        label,
        supportsByok,
        isDefault,
        authMethod,
        authState,
        availableAuthMethods,
        endpointProfile: {
            value: endpointProfileOptionValue,
            label: endpointProfileLabel,
        },
        endpointProfiles,
        apiKeyCta: {
            label: apiKeyCtaLabel,
            url: apiKeyCtaUrl,
        },
        features: {
            catalogStrategy,
            supportsKiloRouting,
            supportsModelProviderListing,
            supportsEndpointProfiles,
        },
    };
}

function readProviderAuthState(value: unknown): ProviderAuthStateRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const profileId = readString(value['profileId']);
    const providerId = readLiteral(value['providerId'], providerIds);
    const authMethod = readLiteral(value['authMethod'], [...providerAuthMethods, 'none'] as const);
    const authState = readLiteral(value['authState'], providerAuthStates);
    const updatedAt = readString(value['updatedAt']);
    const accountId = readString(value['accountId']);
    const organizationId = readString(value['organizationId']);
    const tokenExpiresAt = readString(value['tokenExpiresAt']);
    const lastErrorCode = readString(value['lastErrorCode']);
    const lastErrorMessage = readString(value['lastErrorMessage']);
    if (!profileId || !providerId || !authMethod || !authState || !updatedAt) {
        return undefined;
    }

    return {
        profileId,
        providerId,
        authMethod,
        authState,
        ...(accountId ? { accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
        ...(lastErrorCode ? { lastErrorCode } : {}),
        ...(lastErrorMessage ? { lastErrorMessage } : {}),
        updatedAt,
    };
}

function readEndpointProfile(value: unknown): ProviderEndpointProfileResult | undefined {
    if (!isRecord(value) || !Array.isArray(value['options'])) {
        return undefined;
    }

    const providerId = readLiteral(value['providerId'], providerIds);
    const optionValue = readString(value['value']);
    const label = readString(value['label']);
    const options = value['options']
        .map((entry) => {
            if (!isRecord(entry)) {
                return undefined;
            }

            const value = readString(entry['value']);
            const label = readString(entry['label']);
            return value && label
                ? {
                      value,
                      label,
                  }
                : undefined;
        })
        .filter((entry): entry is { value: string; label: string } => entry !== undefined);
    if (!providerId || !optionValue || !label || options.length !== value['options'].length) {
        return undefined;
    }

    return {
        providerId,
        value: optionValue,
        label,
        options,
    };
}

function readDiffArtifact(value: unknown): DiffRecord['artifact'] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const kind = readLiteral(value['kind'], ['git', 'unsupported'] as const);
    const workspaceRootPath = readString(value['workspaceRootPath']);
    const workspaceLabel = readString(value['workspaceLabel']);
    if (!kind || !workspaceRootPath || !workspaceLabel) {
        return undefined;
    }

    if (kind === 'git') {
        const baseRef = readLiteral(value['baseRef'], ['HEAD'] as const);
        const fileCount = readNumber(value['fileCount']);
        const fullPatch = readString(value['fullPatch']);
        const filesValue = value['files'];
        const patchesByPathValue = value['patchesByPath'];
        if (!baseRef || fileCount === undefined || !fullPatch || !Array.isArray(filesValue) || !isRecord(patchesByPathValue)) {
            return undefined;
        }

        const files = filesValue
            .map((entry) => {
                if (!isRecord(entry)) {
                    return undefined;
                }

                const path = readString(entry['path']);
                const status = readLiteral(
                    entry['status'],
                    ['added', 'modified', 'deleted', 'renamed', 'copied', 'type_changed', 'untracked'] as const
                );
                const previousPath = readString(entry['previousPath']);
                const addedLines = readNumber(entry['addedLines']);
                const deletedLines = readNumber(entry['deletedLines']);
                if (!path || !status) {
                    return undefined;
                }

                return {
                    path,
                    status,
                    ...(previousPath ? { previousPath } : {}),
                    ...(addedLines !== undefined ? { addedLines } : {}),
                    ...(deletedLines !== undefined ? { deletedLines } : {}),
                };
            })
            .filter(
                (
                    entry
                ): entry is {
                    path: string;
                    status: 'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'type_changed' | 'untracked';
                    previousPath?: string;
                    addedLines?: number;
                    deletedLines?: number;
                } => entry !== undefined
            );
        const patchEntries = Object.entries(patchesByPathValue).filter(
            (entry): entry is [string, string] => typeof entry[0] === 'string' && typeof entry[1] === 'string'
        );
        if (files.length !== filesValue.length || patchEntries.length !== Object.keys(patchesByPathValue).length) {
            return undefined;
        }

        const totalAddedLines = readNumber(value['totalAddedLines']);
        const totalDeletedLines = readNumber(value['totalDeletedLines']);
        return {
            kind,
            workspaceRootPath,
            workspaceLabel,
            baseRef,
            fileCount,
            ...(totalAddedLines !== undefined ? { totalAddedLines } : {}),
            ...(totalDeletedLines !== undefined ? { totalDeletedLines } : {}),
            files,
            fullPatch,
            patchesByPath: Object.fromEntries(patchEntries),
        };
    }

    const reason = readLiteral(
        value['reason'],
        ['workspace_not_git', 'git_unavailable', 'workspace_unresolved', 'capture_failed'] as const
    );
    const detail = readString(value['detail']);
    if (!reason || !detail) {
        return undefined;
    }

    return {
        kind,
        workspaceRootPath,
        workspaceLabel,
        reason,
        detail,
    };
}

function readProviderDefaults(value: unknown): { providerId: string; modelId: string } | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const providerId = readString(value['providerId']);
    const modelId = readString(value['modelId']);
    if (!providerId || !modelId) {
        return undefined;
    }

    return {
        providerId,
        modelId,
    };
}

function readProviderModels(value: unknown): ProviderModelRecord[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter(
        (entry): entry is ProviderModelRecord =>
            isRecord(entry) && hasRequiredStringFields(entry, ['id', 'providerId'])
    );
}

function readRoutingPreference(value: unknown): KiloModelRoutingPreference | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const profileId = readString(value['profileId']);
    const providerId = readLiteral(value['providerId'], ['kilo'] as const);
    const modelId = readString(value['modelId']);
    const routingMode = readLiteral(value['routingMode'], kiloRoutingModes);
    const sort = readLiteral(value['sort'], kiloDynamicSorts);
    const pinnedProviderId = readString(value['pinnedProviderId']);
    if (!profileId || !providerId || !modelId || !routingMode) {
        return undefined;
    }

    return {
        profileId,
        providerId,
        modelId,
        routingMode,
        ...(sort ? { sort } : {}),
        ...(pinnedProviderId ? { pinnedProviderId } : {}),
    };
}

function readModelProviderOptions(value: unknown): KiloModelProviderOption[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter(
        (entry): entry is KiloModelProviderOption =>
            isRecord(entry) && hasRequiredStringFields(entry, ['providerId'])
    );
}

function replaceProviderModels(currentModels: ProviderModelRecord[], nextModels: ProviderModelRecord[]): ProviderModelRecord[] {
    if (nextModels.length === 0) {
        return currentModels;
    }

    const providerId = nextModels[0]?.providerId;
    return [...currentModels.filter((model) => model.providerId !== providerId), ...nextModels];
}

function readMessagePartRecord(value: unknown): MessagePartRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const messageId = readString(value['messageId']);
    const sequence = readNumber(value['sequence']);
    const partType = readLiteral(
        value['partType'],
        ['text', 'image', 'reasoning', 'reasoning_summary', 'reasoning_encrypted', 'tool_call', 'tool_result', 'error', 'status'] as const
    );
    const payload = isRecord(value['payload']) ? value['payload'] : undefined;
    const createdAt = readString(value['createdAt']);

    if (!id || !isEntityId(id, 'part') || !messageId || !isEntityId(messageId, 'msg') || sequence === undefined || !partType || !payload || !createdAt) {
        return undefined;
    }

    return {
        id,
        messageId,
        sequence,
        partType,
        payload,
        createdAt,
    };
}

function readMessageRecord(value: unknown): MessageRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const sessionId = readString(value['sessionId']);
    const runId = readString(value['runId']);
    const role = readLiteral(value['role'], ['user', 'assistant', 'system', 'tool'] as const);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (
        !id ||
        !isEntityId(id, 'msg') ||
        !profileId ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !runId ||
        !isEntityId(runId, 'run') ||
        !role ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    return {
        id,
        profileId,
        sessionId,
        runId,
        role,
        createdAt,
        updatedAt,
    };
}

function upsertMessagePartRecord(messageParts: MessagePartRecord[], nextPart: MessagePartRecord): MessagePartRecord[] {
    return [...messageParts.filter((candidate) => candidate.id !== nextPart.id), nextPart].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return left.createdAt.localeCompare(right.createdAt);
        }

        return left.sequence - right.sequence;
    });
}

export function applyRuntimeEventPatches(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): boolean {
    if (!context.profileId) {
        return false;
    }

    if (event.domain === 'thread') {
        const bucket = readConversationRecord(event.payload['bucket']);
        const thread = readThreadRecord(event.payload['thread']);
        const tagIds = readStringArray(event.payload['tagIds']);
        const deletedThreadIds = readStringArray(event.payload['deletedThreadIds']);
        const deletedTagIds = readStringArray(event.payload['deletedTagIds']);
        const deletedConversationIds = readStringArray(event.payload['deletedConversationIds']);
        const sessionIds = readStringArray(event.payload['sessionIds']);
        const favoriteThreadId = readString(event.payload['threadId']);
        const nextFavorite = typeof event.payload['isFavorite'] === 'boolean' ? event.payload['isFavorite'] : undefined;

        if (bucket && thread) {
            updateMatchingQueryData<{ buckets: ConversationRecord[] }>(['conversation', 'listBuckets'], (current) =>
                current ? { buckets: upsertBucketRecord(current.buckets, bucket) } : current
            );
            updateMatchingQueryData<{
                sort: 'latest' | 'alphabetical';
                showAllModes: boolean;
                groupView: 'workspace' | 'branch';
                threads: ReturnType<typeof toThreadListRecord>[];
            }>(['conversation', 'listThreads'], (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    threads: upsertThreadListRecord(current.threads, toThreadListRecord({ bucket, thread }), current.sort),
                };
            });
            return true;
        }

        if (thread) {
            updateMatchingQueryData<{
                sort: 'latest' | 'alphabetical';
                showAllModes: boolean;
                groupView: 'workspace' | 'branch';
                threads: ReturnType<typeof toThreadListRecord>[];
            }>(['conversation', 'listThreads'], (current) =>
                current
                    ? {
                          ...current,
                          threads: patchThreadListRecord(current.threads, thread),
                      }
                    : current
            );
            return true;
        }

        if (favoriteThreadId && nextFavorite !== undefined) {
            updateMatchingQueryData<{
                sort: 'latest' | 'alphabetical';
                showAllModes: boolean;
                groupView: 'workspace' | 'branch';
                threads: ReturnType<typeof toThreadListRecord>[];
            }>(['conversation', 'listThreads'], (current) =>
                current
                    ? {
                          ...current,
                          threads: current.threads.map((candidate) =>
                              candidate.id === favoriteThreadId ? { ...candidate, isFavorite: nextFavorite } : candidate
                          ),
                      }
                    : current
            );
            return true;
        }

        const profileId = context.profileId;
        const threadId = context.threadId;
        if (profileId && threadId && tagIds) {
            utils.runtime.getShellBootstrap.setData({ profileId: context.profileId }, (current) => {
                if (!current) {
                    return current;
                }

                const nextThreadTags: ThreadTagRecord[] = tagIds
                    .filter((tagId): tagId is ThreadTagRecord['tagId'] => isEntityId(tagId, 'tag'))
                    .map((tagId) => ({
                        profileId,
                        threadId,
                        tagId,
                        createdAt: event.createdAt,
                    }));

                return {
                    ...current,
                    threadTags: replaceThreadTagRelations(current.threadTags, threadId, nextThreadTags),
                };
            });
            return true;
        }

        if (deletedThreadIds && deletedTagIds && deletedConversationIds) {
            updateMatchingQueryData<{ buckets: ConversationRecord[] }>(['conversation', 'listBuckets'], (current) =>
                current
                    ? {
                          buckets: current.buckets.filter(
                              (bucketRecord) => !new Set(deletedConversationIds).has(bucketRecord.id)
                          ),
                      }
                    : current
            );
            updateMatchingQueryData<{
                sort: 'latest' | 'alphabetical';
                showAllModes: boolean;
                groupView: 'workspace' | 'branch';
                threads: ReturnType<typeof toThreadListRecord>[];
            }>(['conversation', 'listThreads'], (current) =>
                current
                    ? {
                          ...current,
                          threads: current.threads.filter((threadRecord) => !new Set(deletedThreadIds).has(threadRecord.id)),
                      }
                    : current
            );
            updateMatchingQueryData<{ tags: TagRecord[] }>(['conversation', 'listTags'], (current) =>
                current
                    ? {
                          tags: current.tags.filter((tagRecord) => !new Set(deletedTagIds).has(tagRecord.id)),
                      }
                    : current
            );
            utils.runtime.getShellBootstrap.setData({ profileId: context.profileId }, (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    threadTags: current.threadTags.filter(
                        (threadTag) =>
                            !deletedThreadIds.includes(threadTag.threadId) && !deletedTagIds.includes(threadTag.tagId)
                    ),
                };
            });
            if (sessionIds) {
                updateMatchingQueryData<{ sessions: SessionSummaryRecord[] }>(['session', 'list'], (current) =>
                    current
                        ? {
                              sessions: current.sessions.filter((session) => !new Set(sessionIds).has(session.id)),
                          }
                        : current
                );
            }
            return true;
        }
    }

    if (event.domain === 'messagePart') {
        const messagePart = readMessagePartRecord(event.payload['part']);
        if (!messagePart || !context.profileId || !context.sessionId) {
            return false;
        }

        updateMatchingQueryData<SessionMessagesQueryData>(
            ['session', 'listMessages', context.profileId, context.sessionId],
            (current) => {
                if (!current || !current.messages.some((message) => message.id === messagePart.messageId)) {
                    return current;
                }

                return {
                    ...current,
                    messageParts: upsertMessagePartRecord(current.messageParts, messagePart),
                };
            }
        );
        return true;
    }

    if (event.domain === 'message') {
        const message = readMessageRecord(event.payload['message']);
        if (!message || !context.profileId || !context.sessionId) {
            return false;
        }

        updateMatchingQueryData<SessionMessagesQueryData>(
            ['session', 'listMessages', context.profileId, context.sessionId],
            (current) => {
                if (!current) {
                    return current;
                }

                return {
                    ...current,
                    messages: [...current.messages.filter((candidate) => candidate.id !== message.id), message].sort((left, right) =>
                        left.createdAt.localeCompare(right.createdAt)
                    ),
                };
            }
        );
        return true;
    }

    if (event.domain === 'tag') {
        const tag = readTagRecord(event.payload['tag']);
        if (!tag) {
            return false;
        }

        updateMatchingQueryData<{ tags: TagRecord[] }>(['conversation', 'listTags'], (current) =>
            current ? { tags: upsertTagRecord(current.tags, tag) } : current
        );
        return true;
    }

    if (event.domain === 'checkpoint') {
        const checkpoint = readCheckpointRecord(event.payload['checkpoint']);
        if (checkpoint) {
            utils.checkpoint.list.setData(
                {
                    profileId: context.profileId,
                    sessionId: checkpoint.sessionId,
                },
                (current) => ({
                    checkpoints: [checkpoint, ...(current?.checkpoints ?? []).filter((candidate) => candidate.id !== checkpoint.id)],
                })
            );
            const diff = readDiffRecord(event.payload['diff']);
            const runId = diff ? readString(diff.runId) : undefined;
            if (diff && isEntityId(runId, 'run')) {
                utils.diff.listByRun.setData(
                    {
                        profileId: context.profileId,
                        runId,
                    },
                    (current) => ({
                        diffs: [diff, ...(current?.diffs ?? []).filter((candidate) => candidate.id !== diff.id)],
                    })
                );
            }
            return true;
        }

        return event.eventType === 'checkpoint.rolled_back';
    }

    if (event.domain === 'provider') {
        const providerId = context.providerId;
        if (!providerId) {
            return false;
        }

        const profileId = context.profileId;
        const provider = readProviderListItem(event.payload['provider']);
        const defaults = readProviderDefaults(event.payload['defaults']);
        const models = readProviderModels(event.payload['models']);
        const state = readProviderAuthState(event.payload['state']);
        const endpointProfile = readEndpointProfile(event.payload['endpointProfile']);
        const preference = readRoutingPreference(event.payload['preference']);
        const providers = readModelProviderOptions(event.payload['providers']);
        const modelId = readString(event.payload['modelId']);

        if (!provider && !defaults && !models && !state && !endpointProfile && !preference && !providers) {
            return false;
        }

        patchProviderCache({
            utils,
            profileId,
            providerId,
            ...(provider ? { provider } : {}),
            ...(defaults ? { defaults } : {}),
            ...(models ? { models } : {}),
            ...(state ? { authState: state } : {}),
            ...(endpointProfile ? { endpointProfile } : {}),
            ...(preference ? { routingPreference: preference } : {}),
            ...(providers ? { routingProviders: providers } : {}),
            ...(modelId ? { routingModelId: modelId } : {}),
        });

        utils.runtime.getShellBootstrap.setData({ profileId }, (current) => {
            if (!current) {
                return current;
            }

            const nextProviders = current.providers.map((candidate) => {
                const providerValue = provider && candidate.id === provider.id ? provider : candidate;
                if (state && providerValue.id === providerId) {
                    return {
                        ...providerValue,
                        authState: state.authState,
                        authMethod: state.authMethod,
                    };
                }

                return providerValue;
            });

            return {
                ...current,
                providers: nextProviders,
                ...(defaults ? { defaults } : {}),
                ...(models ? { providerModels: replaceProviderModels(current.providerModels, models) } : {}),
            };
        });

        return true;
    }

    return false;
}

