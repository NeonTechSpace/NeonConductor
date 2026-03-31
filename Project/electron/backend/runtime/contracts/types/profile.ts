import type { ExecutionPreset } from '@/app/backend/runtime/contracts/enums';
import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';
import type { RuntimeProviderId } from '@/shared/contracts';

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
