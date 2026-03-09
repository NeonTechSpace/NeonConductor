import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { AppContextSettingsRecord } from '@/app/backend/persistence/types';

const GLOBAL_CONTEXT_SETTINGS_ID = 'global';

function mapAppContextSettings(row: {
    id: string;
    enabled: 0 | 1;
    mode: 'percent';
    percent: number;
    updated_at: string;
}): AppContextSettingsRecord {
    return {
        enabled: row.enabled === 1,
        mode: row.mode,
        percent: row.percent,
        updatedAt: row.updated_at,
    };
}

export class AppContextSettingsStore {
    async get(): Promise<AppContextSettingsRecord> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('app_context_settings')
            .select(['id', 'enabled', 'mode', 'percent', 'updated_at'])
            .where('id', '=', GLOBAL_CONTEXT_SETTINGS_ID)
            .executeTakeFirst();

        if (row) {
            return mapAppContextSettings(row);
        }

        const updatedAt = nowIso();
        await db
            .insertInto('app_context_settings')
            .values({
                id: GLOBAL_CONTEXT_SETTINGS_ID,
                enabled: 1,
                mode: 'percent',
                percent: 90,
                updated_at: updatedAt,
            })
            .execute();

        return {
            enabled: true,
            mode: 'percent',
            percent: 90,
            updatedAt: updatedAt,
        };
    }

    async set(input: {
        enabled: boolean;
        mode: 'percent';
        percent: number;
    }): Promise<AppContextSettingsRecord> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        await db
            .insertInto('app_context_settings')
            .values({
                id: GLOBAL_CONTEXT_SETTINGS_ID,
                enabled: input.enabled ? 1 : 0,
                mode: input.mode,
                percent: input.percent,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.column('id').doUpdateSet({
                    enabled: input.enabled ? 1 : 0,
                    mode: input.mode,
                    percent: input.percent,
                    updated_at: updatedAt,
                })
            )
            .execute();

        return {
            enabled: input.enabled,
            mode: input.mode,
            percent: input.percent,
            updatedAt,
        };
    }
}

export const appContextSettingsStore = new AppContextSettingsStore();
