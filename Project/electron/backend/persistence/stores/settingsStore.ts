import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';

export class SettingsStore {
    async getString(profileId: string, key: string, fallback: string): Promise<string> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('settings')
            .select(['value_json'])
            .where('profile_id', '=', profileId)
            .where('key', '=', key)
            .executeTakeFirst();

        if (!row) {
            return fallback;
        }

        return parseJsonValue(row.value_json, fallback);
    }

    async setString(profileId: string, key: string, value: string): Promise<void> {
        const { db } = getPersistence();

        await db
            .insertInto('settings')
            .values({
                id: `setting_${randomUUID()}`,
                profile_id: profileId,
                key,
                value_json: JSON.stringify(value),
                updated_at: nowIso(),
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'key']).doUpdateSet({
                    value_json: JSON.stringify(value),
                    updated_at: nowIso(),
                })
            )
            .execute();
    }

    async deleteByProfile(profileId: string): Promise<number> {
        const { db } = getPersistence();

        const rows = await db.deleteFrom('settings').where('profile_id', '=', profileId).returning('id').execute();
        return rows.length;
    }

    async deleteAll(): Promise<number> {
        const { db } = getPersistence();
        const rows = await db.deleteFrom('settings').returning('id').execute();
        return rows.length;
    }
}

export const settingsStore = new SettingsStore();
