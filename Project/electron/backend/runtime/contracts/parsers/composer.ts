import {
    MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
    type SetComposerMediaSettingsInput,
} from '@/app/backend/runtime/contracts/types/composer';
import { createParser, readObject, readOptionalNumber } from '@/app/backend/runtime/contracts/parsers/helpers';

function readBoundedPositiveInteger(input: unknown, field: string, maximum: number): number {
    const value = readOptionalNumber(input, field);
    if (value === undefined || !Number.isInteger(value) || value < 1 || value > maximum) {
        throw new Error(`Invalid "${field}": expected integer between 1 and ${String(maximum)}.`);
    }

    return value;
}

export function parseSetComposerMediaSettingsInput(input: unknown): SetComposerMediaSettingsInput {
    const source = readObject(input, 'input');

    return {
        maxImageAttachmentsPerMessage: readBoundedPositiveInteger(
            source.maxImageAttachmentsPerMessage,
            'maxImageAttachmentsPerMessage',
            MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE
        ),
        imageCompressionConcurrency: readBoundedPositiveInteger(
            source.imageCompressionConcurrency,
            'imageCompressionConcurrency',
            MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY
        ),
    };
}

export const setComposerMediaSettingsInputSchema = createParser(parseSetComposerMediaSettingsInput);
