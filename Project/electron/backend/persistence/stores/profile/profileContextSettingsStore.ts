import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ProfileContextSettingsRecord } from '@/app/backend/persistence/types';

function mapProfileContextSettings(row: {
    profile_id: string;
    override_mode: 'inherit' | 'percent' | 'fixed_tokens';
    percent: number | null;
    fixed_input_tokens: number | null;
    updated_at: string;
}): ProfileContextSettingsRecord {
    return {
        profileId: row.profile_id,
        overrideMode: row.override_mode,
        ...(row.percent !== null ? { percent: row.percent } : {}),
        ...(row.fixed_input_tokens !== null ? { fixedInputTokens: row.fixed_input_tokens } : {}),
        updatedAt: row.updated_at,
    };
}

export class ProfileContextSettingsStore {
    async get(profileId: string): Promise<ProfileContextSettingsRecord> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('profile_context_settings')
            .select(['profile_id', 'override_mode', 'percent', 'fixed_input_tokens', 'updated_at'])
            .where('profile_id', '=', profileId)
            .executeTakeFirst();

        if (row) {
            return mapProfileContextSettings(row);
        }

        return {
            profileId,
            overrideMode: 'inherit',
            updatedAt: nowIso(),
        };
    }

    async set(input: {
        profileId: string;
        overrideMode: 'inherit' | 'percent' | 'fixed_tokens';
        percent?: number;
        fixedInputTokens?: number;
    }): Promise<ProfileContextSettingsRecord> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        await db
            .insertInto('profile_context_settings')
            .values({
                profile_id: input.profileId,
                override_mode: input.overrideMode,
                percent: input.overrideMode === 'percent' ? (input.percent ?? null) : null,
                fixed_input_tokens:
                    input.overrideMode === 'fixed_tokens' ? (input.fixedInputTokens ?? null) : null,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.column('profile_id').doUpdateSet({
                    override_mode: input.overrideMode,
                    percent: input.overrideMode === 'percent' ? (input.percent ?? null) : null,
                    fixed_input_tokens:
                        input.overrideMode === 'fixed_tokens' ? (input.fixedInputTokens ?? null) : null,
                    updated_at: updatedAt,
                })
            )
            .execute();

        return {
            profileId: input.profileId,
            overrideMode: input.overrideMode,
            ...(input.overrideMode === 'percent' && input.percent !== undefined ? { percent: input.percent } : {}),
            ...(input.overrideMode === 'fixed_tokens' && input.fixedInputTokens !== undefined
                ? { fixedInputTokens: input.fixedInputTokens }
                : {}),
            updatedAt,
        };
    }

    async copyByProfile(input: {
        sourceProfileId: string;
        targetProfileId: string;
        timestamp: string;
    }): Promise<void> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('profile_context_settings')
            .select(['override_mode', 'percent', 'fixed_input_tokens'])
            .where('profile_id', '=', input.sourceProfileId)
            .executeTakeFirst();

        if (!row) {
            return;
        }

        await db
            .insertInto('profile_context_settings')
            .values({
                profile_id: input.targetProfileId,
                override_mode: row.override_mode,
                percent: row.percent,
                fixed_input_tokens: row.fixed_input_tokens,
                updated_at: input.timestamp,
            })
            .execute();
    }
}

export const profileContextSettingsStore = new ProfileContextSettingsStore();
