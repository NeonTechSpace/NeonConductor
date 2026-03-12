import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import {
    isJsonString,
    nowIso,
    parseJsonValue,
    type JsonValueGuard,
} from '@/app/backend/persistence/stores/shared/utils';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';

export class SettingsStore {
    private async getValueJsonOptional(profileId: string, key: string): Promise<string | undefined> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('settings')
            .select(['value_json'])
            .where('profile_id', '=', profileId)
            .where('key', '=', key)
            .executeTakeFirst();

        return row?.value_json;
    }

    async getStringOptional(profileId: string, key: string): Promise<string | undefined> {
        const valueJson = await this.getValueJsonOptional(profileId, key);
        if (!valueJson) {
            return undefined;
        }

        return parseJsonValue(valueJson, undefined, isJsonString);
    }

    async getJsonOptional<T>(profileId: string, key: string, isValid: JsonValueGuard<T>): Promise<T | undefined> {
        const valueJson = await this.getValueJsonOptional(profileId, key);
        if (!valueJson) {
            return undefined;
        }

        return parseJsonValue(valueJson, undefined, isValid);
    }

    async getString(profileId: string, key: string, fallback: string): Promise<string> {
        const value = await this.getStringOptional(profileId, key);
        return value ?? fallback;
    }

    async getStringRequired(profileId: string, key: string): Promise<string> {
        const value = await this.getStringOptional(profileId, key);
        if (!value) {
            throw new InvariantError(`Missing required setting "${key}" for profile "${profileId}".`);
        }

        return value;
    }

    async setString(profileId: string, key: string, value: string): Promise<void> {
        await this.setJson(profileId, key, value);
    }

    async setJson(profileId: string, key: string, value: string | number | boolean | Record<string, unknown>): Promise<void> {
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
