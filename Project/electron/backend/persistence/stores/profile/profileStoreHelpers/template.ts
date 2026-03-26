import {
    errProfileStore,
    okProfileStore,
    type ProfileStoreResult,
} from '@/app/backend/persistence/stores/profile/profileStoreErrors';
import type { ProfileStoreDb } from '@/app/backend/persistence/stores/profile/profileStoreHelpers/types';

export async function resolveTemplateProfileId(
    tx: ProfileStoreDb,
    preferredProfileId?: string
): Promise<ProfileStoreResult<string>> {
    if (preferredProfileId) {
        const preferred = await tx
            .selectFrom('profiles')
            .select('id')
            .where('id', '=', preferredProfileId)
            .executeTakeFirst();
        if (preferred) {
            return okProfileStore(preferred.id);
        }
    }

    const defaultProfile = await tx
        .selectFrom('profiles')
        .select('id')
        .where('id', '=', 'profile_local_default')
        .executeTakeFirst();

    if (defaultProfile) {
        return okProfileStore(defaultProfile.id);
    }

    const oldest = await tx
        .selectFrom('profiles')
        .select('id')
        .orderBy('created_at', 'asc')
        .orderBy('id', 'asc')
        .executeTakeFirst();

    if (!oldest) {
        return errProfileStore('Cannot resolve template profile because no profiles exist.');
    }

    return okProfileStore(oldest.id);
}
