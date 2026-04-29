import type { ExecutionPreset, InternalModelRole } from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type {
    ProfileFileReadGuardSettings,
    ProfileGetFileReadGuardSettingsInput,
    ProfileSetFileReadGuardSettingsInput,
} from '@/app/backend/runtime/contracts/types/fileReadGuard';
import type { WorkflowRoutingTargetKey } from '@/app/backend/runtime/contracts/workflowRouting';

import type { RuntimeProviderId, UtilityModelConsumerId } from '@/shared/contracts';

export interface ProfileCreateInput {
    name?: string;
}

export interface ProfileRenameInput extends ProfileInput {
    name: string;
}

export interface ProfileDuplicateInput extends ProfileInput {
    name?: string;
}

export type ProfileDeleteInput = ProfileInput;

export type ProfileSetActiveInput = ProfileInput;

export type ProfileGetExecutionPresetInput = ProfileInput;

export interface ProfileSetExecutionPresetInput extends ProfileInput {
    preset: ExecutionPreset;
}

export type ProfileGetUtilityModelInput = ProfileInput;

export interface ProfileSetUtilityModelInput extends ProfileInput {
    providerId?: RuntimeProviderId;
    modelId?: string;
}

export type ProfileGetUtilityModelConsumerPreferencesInput = ProfileInput;

export interface UtilityModelConsumerPreference {
    consumerId: UtilityModelConsumerId;
    useUtilityModel: boolean;
}

export interface UtilityModelConsumerPreferences {
    preferences: UtilityModelConsumerPreference[];
}

export interface ProfileSetUtilityModelConsumerPreferenceInput extends ProfileInput {
    consumerId: UtilityModelConsumerId;
    useUtilityModel: boolean;
}

export type ProfileGetMemoryRetrievalModelInput = ProfileInput;

export interface MemoryRetrievalModelSelection {
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface MemoryRetrievalModelPreference {
    selection: MemoryRetrievalModelSelection | null;
}

export interface ProfileSetMemoryRetrievalModelInput extends ProfileInput {
    providerId?: RuntimeProviderId;
    modelId?: string;
}

export type ProfileGetFileReadGuardInput = ProfileGetFileReadGuardSettingsInput;
export type ProfileSetFileReadGuardInput = ProfileSetFileReadGuardSettingsInput;
export type ProfileFileReadGuardPreference = ProfileFileReadGuardSettings;

export type InternalModelRoleDiagnosticStatus = 'configured' | 'fallback' | 'unconfigured';

export interface InternalModelRoleDiagnosticRecord {
    role: InternalModelRole;
    label: string;
    status: InternalModelRoleDiagnosticStatus;
    providerId?: RuntimeProviderId;
    modelId?: string;
    sourceLabel: string;
    detail?: string;
}

export interface PlannerTargetDiagnosticRecord {
    targetKey: WorkflowRoutingTargetKey;
    label: string;
    status: InternalModelRoleDiagnosticStatus;
    providerId?: RuntimeProviderId;
    modelId?: string;
    sourceLabel: string;
    resolvedTargetKey: WorkflowRoutingTargetKey;
    fellBackToPlanning: boolean;
}

export interface InternalModelRoleDiagnostics {
    roles: InternalModelRoleDiagnosticRecord[];
    plannerTargets: PlannerTargetDiagnosticRecord[];
    updatedAt: string;
}
