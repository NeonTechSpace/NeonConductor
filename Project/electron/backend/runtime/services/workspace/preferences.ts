import { settingsStore, workspaceRootStore } from '@/app/backend/persistence/stores';
import { nowIso, isJsonRecord, isJsonString, isJsonUnknownArray } from '@/app/backend/persistence/stores/shared/utils';
import type { WorkspacePreferenceRecord } from '@/app/backend/runtime/contracts/types/runtime';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';
import { providerIds, topLevelTabs, type RuntimeProviderId, type TopLevelTab } from '@/shared/contracts';
import {
    workspacePreferredPackageManagerValues,
    workspacePreferredVcsValues,
    type WorkspacePreferredPackageManager,
    type WorkspacePreferredVcs,
} from '@/app/backend/runtime/contracts/types/runtime';

const WORKSPACE_PREFERENCES_SETTING_KEY = 'workspace_preferences';

interface PersistedWorkspacePreferenceRecord {
    workspaceFingerprint: string;
    defaultTopLevelTab?: TopLevelTab;
    defaultProviderId?: RuntimeProviderId;
    defaultModelId?: string;
    preferredVcs?: WorkspacePreferredVcs;
    preferredPackageManager?: WorkspacePreferredPackageManager;
    updatedAt: string;
}

function isRuntimeProviderId(value: unknown): value is RuntimeProviderId {
    return typeof value === 'string' && providerIds.includes(value as RuntimeProviderId);
}

function isTopLevelTab(value: unknown): value is TopLevelTab {
    return typeof value === 'string' && topLevelTabs.includes(value as TopLevelTab);
}

function isWorkspacePreferredVcs(value: unknown): value is WorkspacePreferredVcs {
    return typeof value === 'string' && workspacePreferredVcsValues.includes(value as WorkspacePreferredVcs);
}

function isWorkspacePreferredPackageManager(value: unknown): value is WorkspacePreferredPackageManager {
    return (
        typeof value === 'string' &&
        workspacePreferredPackageManagerValues.includes(value as WorkspacePreferredPackageManager)
    );
}

function isPersistedWorkspacePreferenceRecord(value: unknown): value is PersistedWorkspacePreferenceRecord {
    if (!isJsonRecord(value)) {
        return false;
    }

    if (!isJsonString(value.workspaceFingerprint) || !isJsonString(value.updatedAt)) {
        return false;
    }

    if (value.defaultTopLevelTab !== undefined && !isTopLevelTab(value.defaultTopLevelTab)) {
        return false;
    }

    if (value.defaultProviderId !== undefined && !isRuntimeProviderId(value.defaultProviderId)) {
        return false;
    }

    if (value.defaultModelId !== undefined && !isJsonString(value.defaultModelId)) {
        return false;
    }

    if (value.preferredVcs !== undefined && !isWorkspacePreferredVcs(value.preferredVcs)) {
        return false;
    }

    if (
        value.preferredPackageManager !== undefined &&
        !isWorkspacePreferredPackageManager(value.preferredPackageManager)
    ) {
        return false;
    }

    return true;
}

function isPersistedWorkspacePreferenceRecordArray(value: unknown): value is PersistedWorkspacePreferenceRecord[] {
    return isJsonUnknownArray(value) && value.every(isPersistedWorkspacePreferenceRecord);
}

function mapWorkspacePreferenceRecord(
    profileId: string,
    value: PersistedWorkspacePreferenceRecord
): WorkspacePreferenceRecord {
    return {
        profileId,
        workspaceFingerprint: value.workspaceFingerprint,
        ...(value.defaultTopLevelTab ? { defaultTopLevelTab: value.defaultTopLevelTab } : {}),
        ...(value.defaultProviderId ? { defaultProviderId: value.defaultProviderId } : {}),
        ...(value.defaultProviderId && value.defaultModelId
            ? {
                  defaultModelId: canonicalizeProviderModelId(value.defaultProviderId, value.defaultModelId),
              }
            : {}),
        ...(value.preferredVcs ? { preferredVcs: value.preferredVcs } : {}),
        ...(value.preferredPackageManager ? { preferredPackageManager: value.preferredPackageManager } : {}),
        updatedAt: value.updatedAt,
    };
}

async function readWorkspacePreferenceRecords(profileId: string): Promise<PersistedWorkspacePreferenceRecord[]> {
    return (
        (await settingsStore.getJsonOptional(
            profileId,
            WORKSPACE_PREFERENCES_SETTING_KEY,
            isPersistedWorkspacePreferenceRecordArray
        )) ?? []
    );
}

export async function listWorkspacePreferences(profileId: string): Promise<WorkspacePreferenceRecord[]> {
    const workspaceRoots = await workspaceRootStore.listByProfile(profileId);
    const workspaceRootIds = new Set(workspaceRoots.map((workspaceRoot) => workspaceRoot.fingerprint));
    const persisted = await readWorkspacePreferenceRecords(profileId);

    return persisted
        .filter((record) => workspaceRootIds.has(record.workspaceFingerprint))
        .map((record) => mapWorkspacePreferenceRecord(profileId, record))
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

export async function getWorkspacePreference(
    profileId: string,
    workspaceFingerprint: string
): Promise<WorkspacePreferenceRecord | undefined> {
    const preferences = await listWorkspacePreferences(profileId);
    return preferences.find((preference) => preference.workspaceFingerprint === workspaceFingerprint);
}

export async function setWorkspacePreference(input: {
    profileId: string;
    workspaceFingerprint: string;
    defaultTopLevelTab?: TopLevelTab;
    defaultProviderId?: RuntimeProviderId;
    defaultModelId?: string;
    preferredVcs?: WorkspacePreferredVcs;
    preferredPackageManager?: WorkspacePreferredPackageManager;
}): Promise<OperationalResult<WorkspacePreferenceRecord>> {
    const workspaceRoot = await workspaceRootStore.getByFingerprint(input.profileId, input.workspaceFingerprint);
    if (!workspaceRoot) {
        return errOp('not_found', 'Workspace preference could not be saved because the workspace no longer exists.');
    }

    const persisted = await readWorkspacePreferenceRecords(input.profileId);
    const existingRecord = persisted.find((record) => record.workspaceFingerprint === input.workspaceFingerprint);
    const now = nowIso();
    const nextDefaultTopLevelTab = input.defaultTopLevelTab ?? existingRecord?.defaultTopLevelTab;
    const nextDefaultProviderId = input.defaultProviderId ?? existingRecord?.defaultProviderId;
    const nextDefaultModelId = input.defaultModelId ?? existingRecord?.defaultModelId;
    const nextPreferredVcs = input.preferredVcs ?? existingRecord?.preferredVcs;
    const nextPreferredPackageManager = input.preferredPackageManager ?? existingRecord?.preferredPackageManager;
    const nextRecord: PersistedWorkspacePreferenceRecord = {
        workspaceFingerprint: input.workspaceFingerprint,
        updatedAt: now,
    };

    if (nextDefaultTopLevelTab) {
        nextRecord.defaultTopLevelTab = nextDefaultTopLevelTab;
    }

    if (nextDefaultProviderId) {
        nextRecord.defaultProviderId = nextDefaultProviderId;
    }

    if (nextDefaultProviderId && nextDefaultModelId) {
        nextRecord.defaultModelId = canonicalizeProviderModelId(nextDefaultProviderId, nextDefaultModelId);
    }

    if (nextPreferredVcs) {
        nextRecord.preferredVcs = nextPreferredVcs;
    }

    if (nextPreferredPackageManager) {
        nextRecord.preferredPackageManager = nextPreferredPackageManager;
    }

    const nextRecords = [
        nextRecord,
        ...persisted.filter((record) => record.workspaceFingerprint !== input.workspaceFingerprint),
    ];

    await settingsStore.setJson(input.profileId, WORKSPACE_PREFERENCES_SETTING_KEY, nextRecords);
    return okOp(mapWorkspacePreferenceRecord(input.profileId, nextRecord));
}
