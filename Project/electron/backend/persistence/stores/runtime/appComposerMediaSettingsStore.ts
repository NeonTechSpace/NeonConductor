import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import {
    DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
    type ComposerMediaSettings,
} from '@/app/backend/runtime/contracts';

const APP_COMPOSER_MEDIA_SETTINGS_ID = 'global';

function mapComposerMediaSettings(row: {
    id: string;
    max_image_attachments_per_message: number;
    image_compression_concurrency: number;
    updated_at: string;
}): ComposerMediaSettings {
    return {
        maxImageAttachmentsPerMessage: row.max_image_attachments_per_message,
        imageCompressionConcurrency: row.image_compression_concurrency,
        updatedAt: row.updated_at,
    };
}

export class AppComposerMediaSettingsStore {
    async get(): Promise<ComposerMediaSettings> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('app_composer_media_settings')
            .select(['id', 'max_image_attachments_per_message', 'image_compression_concurrency', 'updated_at'])
            .where('id', '=', APP_COMPOSER_MEDIA_SETTINGS_ID)
            .executeTakeFirst();

        if (row) {
            return mapComposerMediaSettings(row);
        }

        const updatedAt = nowIso();
        await db
            .insertInto('app_composer_media_settings')
            .values({
                id: APP_COMPOSER_MEDIA_SETTINGS_ID,
                max_image_attachments_per_message: DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
                image_compression_concurrency: DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
                updated_at: updatedAt,
            })
            .execute();

        return {
            maxImageAttachmentsPerMessage: DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
            imageCompressionConcurrency: DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
            updatedAt,
        };
    }

    async set(input: {
        maxImageAttachmentsPerMessage: number;
        imageCompressionConcurrency: number;
    }): Promise<ComposerMediaSettings> {
        const { db } = getPersistence();
        const updatedAt = nowIso();

        await db
            .insertInto('app_composer_media_settings')
            .values({
                id: APP_COMPOSER_MEDIA_SETTINGS_ID,
                max_image_attachments_per_message: input.maxImageAttachmentsPerMessage,
                image_compression_concurrency: input.imageCompressionConcurrency,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.column('id').doUpdateSet({
                    max_image_attachments_per_message: input.maxImageAttachmentsPerMessage,
                    image_compression_concurrency: input.imageCompressionConcurrency,
                    updated_at: updatedAt,
                })
            )
            .execute();

        return {
            maxImageAttachmentsPerMessage: input.maxImageAttachmentsPerMessage,
            imageCompressionConcurrency: input.imageCompressionConcurrency,
            updatedAt,
        };
    }
}

export const appComposerMediaSettingsStore = new AppComposerMediaSettingsStore();
