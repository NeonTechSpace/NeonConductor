import {
    DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/shared/contracts';

export interface ComposerMediaSettingsDraft {
    maxImageAttachmentsPerMessage: string;
    imageCompressionConcurrency: string;
}

export function resolveComposerMediaSettingsDraft(input: {
    settings:
        | {
              maxImageAttachmentsPerMessage: number;
              imageCompressionConcurrency: number;
          }
        | undefined;
    draft: ComposerMediaSettingsDraft | undefined;
}): ComposerMediaSettingsDraft {
    if (input.draft) {
        return input.draft;
    }

    return {
        maxImageAttachmentsPerMessage: String(
            input.settings?.maxImageAttachmentsPerMessage ?? DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE
        ),
        imageCompressionConcurrency: String(
            input.settings?.imageCompressionConcurrency ?? DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY
        ),
    };
}
