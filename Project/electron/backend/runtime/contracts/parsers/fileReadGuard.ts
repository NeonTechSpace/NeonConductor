import {
    createParser,
    readBoolean,
    readObject,
    readOptionalNumber,
    readProfileId,
    readStringArray,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    ProfileFileReadGuardSettings,
    ProfileGetFileReadGuardSettingsInput,
    ProfileSetFileReadGuardSettingsInput,
} from '@/app/backend/runtime/contracts/types';

import { normalizeProfileFileReadGuardSettings } from '@/shared/fileReadGuardPolicy';

function parseProfileFileReadGuardSettings(value: unknown): ProfileFileReadGuardSettings {
    const source = readObject(value, 'settings');
    const maxTextFileBytes = readOptionalNumber(source.maxTextFileBytes, 'settings.maxTextFileBytes');

    return normalizeProfileFileReadGuardSettings({
        additionalAllowedExtensions:
            source.additionalAllowedExtensions !== undefined
                ? readStringArray(source.additionalAllowedExtensions, 'settings.additionalAllowedExtensions')
                : [],
        additionalBlockedPatterns:
            source.additionalBlockedPatterns !== undefined
                ? readStringArray(source.additionalBlockedPatterns, 'settings.additionalBlockedPatterns')
                : [],
        allowSecretLikeTextFiles:
            source.allowSecretLikeTextFiles !== undefined
                ? readBoolean(source.allowSecretLikeTextFiles, 'settings.allowSecretLikeTextFiles')
                : false,
        allowUnknownUtf8Text:
            source.allowUnknownUtf8Text !== undefined
                ? readBoolean(source.allowUnknownUtf8Text, 'settings.allowUnknownUtf8Text')
                : false,
        ...(maxTextFileBytes !== undefined ? { maxTextFileBytes } : {}),
    });
}

export function parseProfileGetFileReadGuardSettingsInput(
    input: unknown
): ProfileGetFileReadGuardSettingsInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
    };
}

export function parseProfileSetFileReadGuardSettingsInput(
    input: unknown
): ProfileSetFileReadGuardSettingsInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        settings: parseProfileFileReadGuardSettings(source.settings),
    };
}

export const profileGetFileReadGuardSettingsInputSchema = createParser(
    parseProfileGetFileReadGuardSettingsInput
);
export const profileSetFileReadGuardSettingsInputSchema = createParser(
    parseProfileSetFileReadGuardSettingsInput
);
