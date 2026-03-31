import { executionPresets } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readEnumValue,
    readObject,
    readOptionalString,
    readProfileId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    ProfileCreateInput,
    ProfileDeleteInput,
    ProfileDuplicateInput,
    ProfileGetExecutionPresetInput,
    ProfileGetUtilityModelInput,
    ProfileInput,
    ProfileRenameInput,
    ProfileSetActiveInput,
    ProfileSetExecutionPresetInput,
    ProfileSetUtilityModelInput,
} from '@/app/backend/runtime/contracts/types';
import { providerIds } from '@/shared/contracts';

export function parseProfileInput(input: unknown): ProfileInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
    };
}

export function parseProfileCreateInput(input: unknown): ProfileCreateInput {
    const source = readObject(input, 'input');
    const name = readOptionalString(source.name, 'name');

    return {
        ...(name ? { name } : {}),
    };
}

export function parseProfileRenameInput(input: unknown): ProfileRenameInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        name: readString(source.name, 'name'),
    };
}

export function parseProfileDuplicateInput(input: unknown): ProfileDuplicateInput {
    const source = readObject(input, 'input');
    const name = readOptionalString(source.name, 'name');

    return {
        profileId: readProfileId(source),
        ...(name ? { name } : {}),
    };
}

export function parseProfileDeleteInput(input: unknown): ProfileDeleteInput {
    return parseProfileInput(input);
}

export function parseProfileSetActiveInput(input: unknown): ProfileSetActiveInput {
    return parseProfileInput(input);
}

export function parseProfileGetExecutionPresetInput(input: unknown): ProfileGetExecutionPresetInput {
    return parseProfileInput(input);
}

export function parseProfileSetExecutionPresetInput(input: unknown): ProfileSetExecutionPresetInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        preset: readEnumValue(source.preset, 'preset', executionPresets),
    };
}

export function parseProfileGetUtilityModelInput(input: unknown): ProfileGetUtilityModelInput {
    return parseProfileInput(input);
}

export function parseProfileSetUtilityModelInput(input: unknown): ProfileSetUtilityModelInput {
    const source = readObject(input, 'input');
    const providerId =
        source.providerId !== undefined ? readEnumValue(source.providerId, 'providerId', providerIds) : undefined;
    const modelId = readOptionalString(source.modelId, 'modelId');

    if ((providerId && !modelId) || (!providerId && modelId)) {
        throw new Error('Invalid Utility AI selection: providerId and modelId must be set together or both omitted.');
    }

    return {
        profileId: readProfileId(source),
        ...(providerId ? { providerId } : {}),
        ...(modelId ? { modelId } : {}),
    };
}

export const profileInputSchema = createParser(parseProfileInput);
export const profileCreateInputSchema = createParser(parseProfileCreateInput);
export const profileRenameInputSchema = createParser(parseProfileRenameInput);
export const profileDuplicateInputSchema = createParser(parseProfileDuplicateInput);
export const profileDeleteInputSchema = createParser(parseProfileDeleteInput);
export const profileSetActiveInputSchema = createParser(parseProfileSetActiveInput);
export const profileGetExecutionPresetInputSchema = createParser(parseProfileGetExecutionPresetInput);
export const profileSetExecutionPresetInputSchema = createParser(parseProfileSetExecutionPresetInput);
export const profileGetUtilityModelInputSchema = createParser(parseProfileGetUtilityModelInput);
export const profileSetUtilityModelInputSchema = createParser(parseProfileSetUtilityModelInput);
