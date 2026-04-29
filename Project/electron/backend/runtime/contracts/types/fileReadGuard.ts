import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export const fileReadGuardDecisionReasons = [
    'allowed_default_extension',
    'allowed_profile_extension',
    'allowed_unknown_utf8_text',
    'blocked_secret_pattern',
    'blocked_disallowed_extension',
    'blocked_size_limit',
    'blocked_invalid_utf8',
    'blocked_unsupported_mime',
] as const;

export type FileReadGuardDecisionReason = (typeof fileReadGuardDecisionReasons)[number];

export type FileReadGuardFileKind = 'pdf' | 'image' | 'text' | 'unknown';

export interface ProfileFileReadGuardSettings {
    additionalAllowedExtensions: string[];
    additionalBlockedPatterns: string[];
    allowSecretLikeTextFiles: boolean;
    allowUnknownUtf8Text: boolean;
    maxTextFileBytes: number;
}

export interface ResolvedFileReadGuardPolicy extends ProfileFileReadGuardSettings {
    defaultAllowedExtensions: string[];
    defaultBlockedPatterns: string[];
}

export interface FileReadGuardDecision {
    allowed: boolean;
    reason: FileReadGuardDecisionReason;
    fileKind: FileReadGuardFileKind;
    extension: string;
    maxBytes?: number;
}

export type ProfileGetFileReadGuardSettingsInput = ProfileInput;

export interface ProfileSetFileReadGuardSettingsInput extends ProfileInput {
    settings: ProfileFileReadGuardSettings;
}

