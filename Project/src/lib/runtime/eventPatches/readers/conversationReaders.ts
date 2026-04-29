import { isEntityId } from '@/web/components/conversation/shell/workspace/helpers';
import { isRecord, readBoolean, readLiteral, readNumber, readString } from '@/web/lib/runtime/eventPatches/readers/shared';

import type {
    CloudSessionSummaryRecord,
    ConversationRecord,
    SessionSummaryRecord,
    TagRecord,
    ThreadRecord,
} from '@/app/backend/persistence/types';

import { executionEnvironmentModes, resolveCloudSessionSyncBackExpectation, topLevelTabs } from '@/shared/contracts';

const conversationScopes = ['detached', 'workspace'] as const;

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
    const runStatus = readLiteral(value['runStatus'], ['idle', 'running', 'completed', 'aborted', 'error'] as const);
    const turnCount = readNumber(value['turnCount']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    const sandboxId = readString(value['sandboxId']);
    const delegatedFromOrchestratorRunId = readString(value['delegatedFromOrchestratorRunId']);
    const cloudSession = readCloudSessionSummaryRecord(value['cloudSession']);
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
        ...(cloudSession ? { cloudSession } : {}),
        createdAt,
        updatedAt,
    };
}

function readCloudSessionSummaryRecord(value: unknown): CloudSessionSummaryRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readString(value['id']);
    const profileId = readString(value['profileId']);
    const providerId = readLiteral(value['providerId'], ['kilo'] as const);
    const recordKind = readLiteral(value['recordKind'], ['remote_snapshot', 'local_binding'] as const);
    const authorityState = readLiteral(value['authorityState'], [
        'remote_only',
        'mirrored',
        'imported',
        'forked',
        'continued',
    ] as const);
    const syncState = readLiteral(value['syncState'], ['not_synced', 'synced', 'stale', 'failed'] as const);
    const remoteSessionId = readString(value['remoteSessionId']);
    const remoteScopeKey = readString(value['remoteScopeKey']);
    const createdAt = readString(value['createdAt']);
    const updatedAt = readString(value['updatedAt']);
    if (
        !id ||
        !isEntityId(id, 'csess') ||
        !profileId ||
        !providerId ||
        !recordKind ||
        !authorityState ||
        !syncState ||
        !remoteSessionId ||
        !remoteScopeKey ||
        !createdAt ||
        !updatedAt
    ) {
        return undefined;
    }

    const localSessionId = readString(value['localSessionId']);
    const accountId = readString(value['accountId']);
    const organizationId = readString(value['organizationId']);
    const title = readString(value['title']);
    const remoteCreatedAt = readString(value['remoteCreatedAt']);
    const remoteUpdatedAt = readString(value['remoteUpdatedAt']);
    const lastSyncedAt = readString(value['lastSyncedAt']);
    const lastSyncErrorCode = readString(value['lastSyncErrorCode']);
    const lastSyncErrorMessage = readString(value['lastSyncErrorMessage']);

    return {
        id,
        profileId,
        providerId,
        recordKind,
        authorityState,
        syncState,
        syncBackExpectation: resolveCloudSessionSyncBackExpectation({ recordKind, authorityState }),
        remoteSessionId,
        remoteScopeKey,
        ...(localSessionId && isEntityId(localSessionId, 'sess') ? { localSessionId } : {}),
        ...(accountId ? { accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(title ? { title } : {}),
        ...(remoteCreatedAt ? { remoteCreatedAt } : {}),
        ...(remoteUpdatedAt ? { remoteUpdatedAt } : {}),
        ...(lastSyncedAt ? { lastSyncedAt } : {}),
        ...(lastSyncErrorCode ? { lastSyncErrorCode } : {}),
        ...(lastSyncErrorMessage ? { lastSyncErrorMessage } : {}),
        metadata: {},
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

