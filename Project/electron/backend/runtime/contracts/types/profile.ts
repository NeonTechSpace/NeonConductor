import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

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
