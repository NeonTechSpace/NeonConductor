import { err, ok, type Result } from 'neverthrow';

import { settingsStore } from '@/app/backend/persistence/stores/profile/settingsStore';
import type {
    ComposerAttachmentInput,
    FileReadGuardDecision,
    ProfileFileReadGuardSettings,
    ResolvedFileReadGuardPolicy,
} from '@/app/backend/runtime/contracts';

import {
    evaluateFileReadGuard,
    formatFileReadGuardDecisionMessage,
    normalizeProfileFileReadGuardSettings,
    resolveFileReadGuardPolicy,
} from '@/shared/fileReadGuardPolicy';

const FILE_READ_GUARD_SETTINGS_KEY = 'profile.fileReadGuard';

function isStringArray(value: unknown): value is string[] {
    return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isProfileFileReadGuardSettings(value: unknown): value is ProfileFileReadGuardSettings {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
        return false;
    }
    const source = value as Record<string, unknown>;
    return (
        isStringArray(source['additionalAllowedExtensions']) &&
        isStringArray(source['additionalBlockedPatterns']) &&
        typeof source['allowSecretLikeTextFiles'] === 'boolean' &&
        typeof source['allowUnknownUtf8Text'] === 'boolean' &&
        typeof source['maxTextFileBytes'] === 'number' &&
        Number.isFinite(source['maxTextFileBytes'])
    );
}

export interface FileReadGuardFailure {
    code: 'file_read_guard_blocked';
    message: string;
    decision: FileReadGuardDecision;
}

export class FileReadGuardService {
    async getSettings(profileId: string): Promise<ProfileFileReadGuardSettings> {
        const stored = await settingsStore.getJsonOptional(
            profileId,
            FILE_READ_GUARD_SETTINGS_KEY,
            isProfileFileReadGuardSettings
        );
        return normalizeProfileFileReadGuardSettings(stored);
    }

    async setSettings(input: {
        profileId: string;
        settings: ProfileFileReadGuardSettings;
    }): Promise<ProfileFileReadGuardSettings> {
        const settings = normalizeProfileFileReadGuardSettings(input.settings);
        await settingsStore.setJson(input.profileId, FILE_READ_GUARD_SETTINGS_KEY, { ...settings });
        return settings;
    }

    async getPolicy(profileId: string): Promise<ResolvedFileReadGuardPolicy> {
        return resolveFileReadGuardPolicy(await this.getSettings(profileId));
    }

    async evaluateFile(input: {
        profileId: string;
        fileNameOrPath: string;
        mimeType?: string;
        byteSize?: number;
        utf8Valid?: boolean;
    }): Promise<FileReadGuardDecision> {
        const policy = await this.getPolicy(input.profileId);
        return evaluateFileReadGuard({ ...input, policy });
    }

    async enforceFile(input: {
        profileId: string;
        fileNameOrPath: string;
        displayName?: string;
        mimeType?: string;
        byteSize?: number;
        utf8Valid?: boolean;
    }): Promise<Result<FileReadGuardDecision, FileReadGuardFailure>> {
        const decision = await this.evaluateFile(input);
        if (decision.allowed) {
            return ok(decision);
        }
        return err({
            code: 'file_read_guard_blocked',
            message: formatFileReadGuardDecisionMessage(input.displayName ?? input.fileNameOrPath, decision),
            decision,
        });
    }

    async enforceComposerAttachments(input: {
        profileId: string;
        attachments?: ComposerAttachmentInput[];
    }): Promise<Result<FileReadGuardDecision[], FileReadGuardFailure>> {
        const decisions: FileReadGuardDecision[] = [];
        for (const attachment of input.attachments ?? []) {
            const fileName =
                attachment.kind === 'text_file_attachment'
                    ? attachment.fileName
                    : (attachment.fileName ?? `${attachment.clientId}${imageExtensionForMime(attachment.mimeType)}`);
            const byteSize =
                attachment.kind === 'text_file_attachment'
                    ? attachment.byteSize
                    : (attachment.byteSize ?? 0);
            const fileInput = {
                profileId: input.profileId,
                fileNameOrPath: fileName,
                displayName: fileName,
                mimeType: attachment.mimeType,
                byteSize,
                ...(attachment.kind === 'text_file_attachment' ? { utf8Valid: true } : {}),
            };
            const result = await this.enforceFile(fileInput);
            if (result.isErr()) {
                return err(result.error);
            }
            decisions.push(result.value);
        }
        return ok(decisions);
    }
}

export const fileReadGuardService = new FileReadGuardService();

function imageExtensionForMime(mimeType: string): string {
    switch (mimeType) {
        case 'image/jpeg':
            return '.jpg';
        case 'image/png':
            return '.png';
        case 'image/webp':
            return '.webp';
        default:
            return '';
    }
}
