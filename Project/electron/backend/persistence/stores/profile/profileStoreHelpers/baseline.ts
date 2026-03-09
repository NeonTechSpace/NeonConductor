import { copyProfileParityRows } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/parity';
import { initializeProfileProviderBaseline } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/providers';
import { copyProfileSettings } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/settings';
import type { ProfileStoreDb } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/types';

async function copyProfileContextSettings(input: {
    tx: ProfileStoreDb;
    sourceProfileId: string;
    targetProfileId: string;
    timestamp: string;
}): Promise<void> {
    const row = await input.tx
        .selectFrom('profile_context_settings')
        .select(['override_mode', 'percent', 'fixed_input_tokens'])
        .where('profile_id', '=', input.sourceProfileId)
        .executeTakeFirst();

    if (!row) {
        return;
    }

    await input.tx
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

export async function initializeProfileBaseline(
    tx: ProfileStoreDb,
    targetProfileId: string,
    templateProfileId: string,
    options: {
        copyAllSettings: boolean;
        timestamp: string;
    }
): Promise<void> {
    await copyProfileParityRows({
        tx,
        sourceProfileId: templateProfileId,
        targetProfileId,
        timestamp: options.timestamp,
    });
    await initializeProfileProviderBaseline({
        tx,
        sourceProfileId: templateProfileId,
        targetProfileId,
        timestamp: options.timestamp,
    });
    await copyProfileSettings({
        tx,
        sourceProfileId: templateProfileId,
        targetProfileId,
        timestamp: options.timestamp,
        copyAllSettings: options.copyAllSettings,
    });
    if (options.copyAllSettings) {
        await copyProfileContextSettings({
            tx,
            sourceProfileId: templateProfileId,
            targetProfileId,
            timestamp: options.timestamp,
        });
    }
}
