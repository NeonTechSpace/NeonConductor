import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';

import type {
    CheckpointRecord,
    ConversationRecord,
    DiffRecord,
    MessagePartRecord,
    MessageRecord,
    ProviderAuthStateRecord,
    ProviderModelRecord,
    RunRecord,
    SessionSummaryRecord,
    TagRecord,
    ThreadRecord,
} from '@/app/backend/persistence/types';
import type { KiloModelProviderOption, ProviderConnectionProfileResult, ProviderListItem } from '@/app/backend/providers/service/types';

import {
    executionEnvironmentModes,
    kiloDynamicSorts,
    kiloRoutingModes,
    openAIExecutionModes,
    providerAuthMethods,
    providerAuthStates,
    providerIds,
    runStatuses,
    runtimeReasoningEfforts,
    runtimeReasoningSummaries,
    runtimeRequestedTransportFamilies,
    topLevelTabs,
} from '@/shared/contracts';
import type { KiloModelRoutingPreference } from '@/shared/contracts';

const conversationScopes = ['detached', 'workspace'] as const;
const providerCatalogStrategies = ['dynamic', 'static'] as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function readString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function readBoolean(value: unknown): boolean | undefined {
    return typeof value === 'boolean' ? value : undefined;
}

export function readNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function readLiteral<TValue extends string>(value: unknown, allowedValues: readonly TValue[]): TValue | undefined {
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

export function readStringArray(value: unknown): string[] | undefined {
    return Array.isArray(value) && value.every((entry) => typeof entry === 'string') ? value : undefined;
}

export function hasRequiredStringFields(value: Record<string, unknown>, fields: readonly string[]): boolean {
    return fields.every((field) => readString(value[field]));
}
export function readThreadRecord(value: unknown): ThreadRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const conversationId = readString(value['conversationId']);
    const title = readString(value['title']);
    const topLevelTab = readLiteral(value['topLevelTab'], topLevelTabs);
    const rootThreadId = readString(value['rootThreadId']);
    const delegatedFromOrchestratorRunId = readString(value['delegatedFromOrchestratorRunId']);
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
    const sandboxId = readString(value['sandboxId']);
    const lastAssistantAt = readString(value['lastAssistantAt']);

    return {
        id,
        profileId,
        conversationId,
        title,
        topLevelTab,
        ...(parentThreadId ? { parentThreadId } : {}),
        rootThreadId,
        ...(delegatedFromOrchestratorRunId && isEntityId(delegatedFromOrchestratorRunId, 'orch')
            ? { delegatedFromOrchestratorRunId }
            : {}),
        isFavorite,
        executionEnvironmentMode,
        ...(sandboxId && isEntityId(sandboxId, 'sb') ? { sandboxId } : {}),
        ...(lastAssistantAt ? { lastAssistantAt } : {}),
        createdAt,
        updatedAt,
    };
}

export function readSessionSummaryRecord(value: unknown): SessionSummaryRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const conversationId = readString(value['conversationId']);
    const threadId = readString(value['threadId']);
    const kind = readLiteral(value['kind'], ['local', 'sandbox', 'cloud'] as const);
    const runStatus = readLiteral(value['runStatus'], runStatuses);
    const turnCount = readNumber(value['turnCount']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    const sandboxId = readString(value['sandboxId']);
    const delegatedFromOrchestratorRunId = readString(value['delegatedFromOrchestratorRunId']);
    if (
        !id ||
        !isEntityId(id, 'sess') ||
        !profileId ||
        !conversationId ||
        !threadId ||
        !kind ||
        !runStatus ||
        turnCount === undefined ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    return {
        id,
        profileId,
        conversationId,
        threadId,
        kind,
        ...(sandboxId && isEntityId(sandboxId, 'sb') ? { sandboxId } : {}),
        ...(delegatedFromOrchestratorRunId && isEntityId(delegatedFromOrchestratorRunId, 'orch')
            ? { delegatedFromOrchestratorRunId }
            : {}),
        runStatus,
        turnCount,
        createdAt,
        updatedAt,
    };
}

export function readConversationRecord(value: unknown): ConversationRecord | undefined {
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

export function readTagRecord(value: unknown): TagRecord | undefined {
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

export function readCheckpointRecord(value: unknown): CheckpointRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const sessionId = readString(value['sessionId']);
    const threadId = readString(value['threadId']);
    const runId = value['runId'] === null ? null : readString(value['runId']);
    const diffId = value['diffId'] === null ? null : readString(value['diffId']);
    const workspaceFingerprint = readString(value['workspaceFingerprint']);
    const executionTargetKey = readString(value['executionTargetKey']);
    const executionTargetKind = readLiteral(value['executionTargetKind'], ['workspace', 'sandbox'] as const);
    const executionTargetLabel = readString(value['executionTargetLabel']);
    const createdByKind = readLiteral(value['createdByKind'], ['system', 'user'] as const);
    const checkpointKind = readLiteral(value['checkpointKind'], ['auto', 'safety', 'named'] as const);
    const snapshotFileCount = readNumber(value['snapshotFileCount']);
    const topLevelTab = readLiteral(value['topLevelTab'], topLevelTabs);
    const modeKey = readString(value['modeKey']);
    const summary = readString(value['summary']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    const sandboxId = readString(value['sandboxId']);
    const milestoneTitle = readString(value['milestoneTitle']);
    const retentionDisposition = readLiteral(value['retentionDisposition'], [
        'milestone',
        'protected_recent',
        'eligible_for_cleanup',
    ] as const);
    if (
        !id ||
        !isEntityId(id, 'ckpt') ||
        !profileId ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !threadId ||
        !isEntityId(threadId, 'thr') ||
        !workspaceFingerprint ||
        !executionTargetKey ||
        !executionTargetKind ||
        !executionTargetLabel ||
        !createdByKind ||
        !checkpointKind ||
        snapshotFileCount === undefined ||
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
        threadId,
        ...(runId && isEntityId(runId, 'run') ? { runId } : {}),
        ...(diffId ? { diffId } : {}),
        workspaceFingerprint,
        ...(sandboxId && isEntityId(sandboxId, 'sb') ? { sandboxId } : {}),
        executionTargetKey,
        executionTargetKind,
        executionTargetLabel,
        createdByKind,
        checkpointKind,
        ...(milestoneTitle ? { milestoneTitle } : {}),
        ...(retentionDisposition ? { retentionDisposition } : {}),
        snapshotFileCount,
        topLevelTab,
        modeKey,
        summary,
        createdAt,
        updatedAt,
    };
}

export function readDiffRecord(value: unknown): DiffRecord | undefined {
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

export function readProviderListItem(value: unknown): ProviderListItem | undefined {
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
    const connectionProfileValue = value['connectionProfile'];
    const apiKeyCtaValue = value['apiKeyCta'];
    const featuresValue = value['features'];
    const executionPreferenceValue = value['executionPreference'];
    if (
        !id ||
        !label ||
        supportsByok === undefined ||
        isDefault === undefined ||
        !authMethod ||
        !authState ||
        !availableAuthMethods ||
        !isRecord(connectionProfileValue) ||
        !isRecord(apiKeyCtaValue) ||
        !isRecord(featuresValue)
    ) {
        return undefined;
    }

    const connectionProfileLabel = readString(connectionProfileValue['label']);
    const connectionProfileOptionValue = readString(connectionProfileValue['optionProfileId']);
    const connectionProfileOptionsValue = connectionProfileValue['options'];
    if (!Array.isArray(connectionProfileOptionsValue)) {
        return undefined;
    }
    const connectionProfileOptions = connectionProfileOptionsValue
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
    const supportsConnectionOptions = readBoolean(featuresValue['supportsConnectionOptions']);
    const supportsCustomBaseUrl = readBoolean(featuresValue['supportsCustomBaseUrl']);
    const supportsOrganizationScope = readBoolean(featuresValue['supportsOrganizationScope']);
    const baseUrlOverride = readString(connectionProfileValue['baseUrlOverride']);
    const resolvedBaseUrl = readString(connectionProfileValue['resolvedBaseUrl']);
    const organizationId =
        connectionProfileValue['organizationId'] === null
            ? null
            : readString(connectionProfileValue['organizationId']);
    const executionPreference: ProviderListItem['executionPreference'] =
        isRecord(executionPreferenceValue) &&
        readLiteral(executionPreferenceValue['providerId'], ['openai'] as const) &&
        readLiteral(executionPreferenceValue['mode'], openAIExecutionModes) &&
        readBoolean(executionPreferenceValue['canUseRealtimeWebSocket']) !== undefined
            ? {
                  providerId: 'openai',
                  mode: readLiteral(executionPreferenceValue['mode'], openAIExecutionModes)!,
                  canUseRealtimeWebSocket: readBoolean(executionPreferenceValue['canUseRealtimeWebSocket'])!,
                  ...(readLiteral(executionPreferenceValue['disabledReason'], [
                      'provider_not_supported',
                      'api_key_required',
                      'base_url_not_supported',
                  ] as const)
                      ? {
                            disabledReason: readLiteral(executionPreferenceValue['disabledReason'], [
                                'provider_not_supported',
                                'api_key_required',
                                'base_url_not_supported',
                            ] as const)!,
                        }
                      : {}),
              }
            : undefined;
    if (
        !connectionProfileOptionValue ||
        !connectionProfileLabel ||
        connectionProfileOptions.length !== connectionProfileOptionsValue.length ||
        !apiKeyCtaLabel ||
        !apiKeyCtaUrl ||
        !catalogStrategy ||
        supportsKiloRouting === undefined ||
        supportsModelProviderListing === undefined ||
        supportsConnectionOptions === undefined ||
        supportsCustomBaseUrl === undefined ||
        supportsOrganizationScope === undefined
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
        connectionProfile: {
            providerId: id,
            optionProfileId: connectionProfileOptionValue,
            label: connectionProfileLabel,
            options: connectionProfileOptions,
            ...(baseUrlOverride ? { baseUrlOverride } : {}),
            resolvedBaseUrl: resolvedBaseUrl ?? null,
            ...(organizationId !== undefined ? { organizationId } : {}),
        },
        ...(executionPreference ? { executionPreference } : {}),
        apiKeyCta: {
            label: apiKeyCtaLabel,
            url: apiKeyCtaUrl,
        },
        features: {
            catalogStrategy,
            supportsKiloRouting,
            supportsModelProviderListing,
            supportsConnectionOptions,
            supportsCustomBaseUrl,
            supportsOrganizationScope,
        },
    };
}

export function readProviderAuthState(value: unknown): ProviderAuthStateRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const profileId = readString(value['profileId']);
    const providerId = readLiteral(value['providerId'], ['openai'] as const);
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

export function readConnectionProfile(value: unknown): ProviderConnectionProfileResult | undefined {
    if (!isRecord(value) || !Array.isArray(value['options'])) {
        return undefined;
    }

    const providerId = readLiteral(value['providerId'], providerIds);
    const optionValue = readString(value['optionProfileId']);
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

    const baseUrlOverride = readString(value['baseUrlOverride']);
    const resolvedBaseUrl = readString(value['resolvedBaseUrl']);
    const organizationId = value['organizationId'] === null ? null : readString(value['organizationId']);

    return {
        providerId,
        optionProfileId: optionValue,
        label,
        options,
        ...(baseUrlOverride ? { baseUrlOverride } : {}),
        resolvedBaseUrl: resolvedBaseUrl ?? null,
        ...(organizationId !== undefined ? { organizationId } : {}),
    };
}

export function readExecutionPreference(value: unknown): ProviderListItem['executionPreference'] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const providerId = readLiteral(value['providerId'], providerIds);
    const mode = readLiteral(value['mode'], openAIExecutionModes);
    const canUseRealtimeWebSocket = readBoolean(value['canUseRealtimeWebSocket']);
    const disabledReason = readLiteral(value['disabledReason'], [
        'provider_not_supported',
        'api_key_required',
        'base_url_not_supported',
    ] as const);
    if (!providerId || !mode || canUseRealtimeWebSocket === undefined) {
        return undefined;
    }

    return {
        providerId: 'openai',
        mode,
        canUseRealtimeWebSocket,
        ...(disabledReason ? { disabledReason } : {}),
    } satisfies NonNullable<ProviderListItem['executionPreference']>;
}

export function readDiffArtifact(value: unknown): DiffRecord['artifact'] | undefined {
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

export function readProviderDefaults(value: unknown): { providerId: string; modelId: string } | undefined {
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

export function readProviderModels(value: unknown): ProviderModelRecord[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter(
        (entry): entry is ProviderModelRecord =>
            isRecord(entry) && hasRequiredStringFields(entry, ['id', 'providerId'])
    );
}

export function readRoutingPreference(value: unknown): KiloModelRoutingPreference | undefined {
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

export function readModelProviderOptions(value: unknown): KiloModelProviderOption[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter(
        (entry): entry is KiloModelProviderOption =>
            isRecord(entry) && hasRequiredStringFields(entry, ['providerId'])
    );
}

export function replaceProviderModels(currentModels: ProviderModelRecord[], nextModels: ProviderModelRecord[]): ProviderModelRecord[] {
    if (nextModels.length === 0) {
        return currentModels;
    }

    const providerId = nextModels[0]?.providerId;
    return [...currentModels.filter((model) => model.providerId !== providerId), ...nextModels];
}

export function readMessagePartRecord(value: unknown): MessagePartRecord | undefined {
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

export function readMessageRecord(value: unknown): MessageRecord | undefined {
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

export function readRunRecord(value: unknown): RunRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const sessionId = readString(value['sessionId']);
    const profileId = readString(value['profileId']);
    const promptValue = value['prompt'];
    const prompt = typeof promptValue === 'string' ? promptValue : undefined;
    const status = readLiteral(value['status'], runStatuses);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (
        !id ||
        !isEntityId(id, 'run') ||
        !sessionId ||
        !isEntityId(sessionId, 'sess') ||
        !profileId ||
        prompt === undefined ||
        !status ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    const providerId = readLiteral(value['providerId'], providerIds);
    const modelId = readString(value['modelId']);
    const authMethod = readLiteral(value['authMethod'], [...providerAuthMethods, 'none'] as const);
    const startedAt = readString(value['startedAt']);
    const completedAt = readString(value['completedAt']);
    const abortedAt = readString(value['abortedAt']);
    const errorCode = readString(value['errorCode']);
    const errorMessage = readString(value['errorMessage']);
    const reasoningValue = value['reasoning'];
    const cacheValue = value['cache'];
    const transportValue = value['transport'];

    const reasoning =
        isRecord(reasoningValue) &&
        readLiteral(reasoningValue['effort'], runtimeReasoningEfforts) &&
        readLiteral(reasoningValue['summary'], runtimeReasoningSummaries) &&
        readBoolean(reasoningValue['includeEncrypted']) !== undefined
            ? {
                  effort: readLiteral(reasoningValue['effort'], runtimeReasoningEfforts)!,
                  summary: readLiteral(reasoningValue['summary'], runtimeReasoningSummaries)!,
                  includeEncrypted: readBoolean(reasoningValue['includeEncrypted'])!,
              }
            : undefined;

    const cache =
        isRecord(cacheValue) &&
        readLiteral(cacheValue['strategy'], ['auto', 'manual'] as const) &&
        readBoolean(cacheValue['applied']) !== undefined
            ? (() => {
                  const key = readString(cacheValue['key']);
                  const reason = readString(cacheValue['reason']);
                  return {
                      strategy: readLiteral(cacheValue['strategy'], ['auto', 'manual'] as const)!,
                      applied: readBoolean(cacheValue['applied'])!,
                      ...(key ? { key } : {}),
                      ...(reason ? { reason } : {}),
                  };
              })()
            : undefined;

    const transport =
        isRecord(transportValue) && readLiteral(transportValue['requestedFamily'], runtimeRequestedTransportFamilies)
            ? (() => {
                  const selected = readLiteral(
                      transportValue['selected'],
                      [
                          'openai_responses',
                          'openai_chat_completions',
                          'openai_realtime_websocket',
                          'kilo_gateway',
                          'provider_native',
                          'anthropic_messages',
                          'google_generativeai',
                      ] as const
                  );
                  const degradedReason = readString(transportValue['degradedReason']);
                  return {
                      requestedFamily: readLiteral(transportValue['requestedFamily'], runtimeRequestedTransportFamilies)!,
                      ...(selected ? { selected } : {}),
                      ...(degradedReason ? { degradedReason } : {}),
                  };
              })()
            : undefined;

    return {
        id,
        sessionId,
        profileId,
        prompt,
        status,
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
        ...(authMethod ? { authMethod } : {}),
        ...(reasoning ? { reasoning } : {}),
        ...(cache ? { cache } : {}),
        ...(transport ? { transport } : {}),
        ...(startedAt ? { startedAt } : {}),
        ...(completedAt ? { completedAt } : {}),
        ...(abortedAt ? { abortedAt } : {}),
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        createdAt,
        updatedAt,
    };
}

export function upsertMessagePartRecord(messageParts: MessagePartRecord[], nextPart: MessagePartRecord): MessagePartRecord[] {
    return [...messageParts.filter((candidate) => candidate.id !== nextPart.id), nextPart].sort((left, right) => {
        if (left.createdAt !== right.createdAt) {
            return left.createdAt.localeCompare(right.createdAt);
        }

        return left.sequence - right.sequence;
    });
}

export function upsertRunRecord(runs: RunRecord[], nextRun: RunRecord): RunRecord[] {
    return [nextRun, ...runs.filter((candidate) => candidate.id !== nextRun.id)].sort((left, right) =>
        right.createdAt.localeCompare(left.createdAt)
    );
}

export function resolveSessionActiveRunId(currentActiveRunId: RunRecord['id'] | null, run: RunRecord): RunRecord['id'] | null {
    if (run.status === 'running') {
        return run.id;
    }

    return currentActiveRunId === run.id ? null : currentActiveRunId;
}
