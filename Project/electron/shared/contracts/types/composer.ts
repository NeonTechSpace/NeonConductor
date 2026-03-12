export const DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE = 10;
export const DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY = 2;
export const MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE = 50;
export const MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY = 10;

export interface ComposerMediaSettings {
    maxImageAttachmentsPerMessage: number;
    imageCompressionConcurrency: number;
    updatedAt: string;
}

export interface SetComposerMediaSettingsInput {
    maxImageAttachmentsPerMessage: number;
    imageCompressionConcurrency: number;
}
