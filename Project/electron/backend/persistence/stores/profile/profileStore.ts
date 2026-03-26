import { getPersistence } from '@/app/backend/persistence/db';
import {
    errProfileStore,
    okProfileStore,
    type ProfileStoreResult,
} from '@/app/backend/persistence/stores/profile/profileStoreErrors';
import {
    createProfileId,
    createTimestamp,
    DEFAULT_DUPLICATE_SUFFIX,
    DEFAULT_PROFILE_NAME,
    initializeProfileBaseline,
    mapProfile,
    normalizeName,
    resolveTemplateProfileId,
} from '@/app/backend/persistence/stores/profile/profileStoreHelpers';
import type { ActiveProfileState, ProfileDeletionGuardResult, ProfileRecord } from '@/app/backend/persistence/types';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';

export class ProfileStore {
    async list(): Promise<ProfileRecord[]> {
        const { db } = getPersistence();

        const rows = await db
            .selectFrom('profiles')
            .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .execute();

        return rows.map(mapProfile);
    }

    async getById(profileId: string): Promise<ProfileRecord | null> {
        const { db } = getPersistence();

        const row = await db
            .selectFrom('profiles')
            .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .where('id', '=', profileId)
            .executeTakeFirst();

        return row ? mapProfile(row) : null;
    }

    async getActive(): Promise<ProfileStoreResult<ActiveProfileState>> {
        const { db } = getPersistence();

        const activeRow = await db
            .selectFrom('profiles')
            .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .where('is_active', '=', 1)
            .executeTakeFirst();

        if (activeRow) {
            const profile = mapProfile(activeRow);
            return okProfileStore({
                activeProfileId: profile.id,
                profile,
            });
        }

        const fallback = await db
            .selectFrom('profiles')
            .select(['id'])
            .orderBy('created_at', 'asc')
            .orderBy('id', 'asc')
            .executeTakeFirst();

        if (!fallback) {
            return errProfileStore('No profiles exist; unable to resolve active profile.');
        }

        const activatedResult = await this.setActive(fallback.id);
        if (activatedResult.isErr()) {
            return errProfileStore(activatedResult.error.message);
        }

        const activated = activatedResult.value;
        if (!activated) {
            throw new InvariantError(`Failed to activate fallback profile "${fallback.id}".`);
        }

        return okProfileStore({
            activeProfileId: activated.id,
            profile: activated,
        });
    }

    async setActive(profileId: string): Promise<ProfileStoreResult<ProfileRecord | null>> {
        const { db } = getPersistence();
        const timestamp = createTimestamp();

        const updated = await db.transaction().execute(async (tx) => {
            const profile = await tx
                .selectFrom('profiles')
                .select(['id'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            if (!profile) {
                return null;
            }

            await tx
                .updateTable('profiles')
                .set({ is_active: 0, updated_at: timestamp })
                .where('is_active', '=', 1)
                .execute();

            await tx
                .updateTable('profiles')
                .set({ is_active: 1, updated_at: timestamp })
                .where('id', '=', profileId)
                .execute();

            const updated = await tx
                .selectFrom('profiles')
                .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            return updated ? mapProfile(updated) : null;
        });

        return okProfileStore(updated);
    }

    async create(name?: string): Promise<ProfileStoreResult<ProfileRecord>> {
        const { db } = getPersistence();
        const timestamp = createTimestamp();
        const profileId = createProfileId();

        const created = await db.transaction().execute<ProfileStoreResult<ProfileRecord>>(async (tx) => {
            const templateProfileIdResult = await resolveTemplateProfileId(tx);
            if (templateProfileIdResult.isErr()) {
                return errProfileStore(templateProfileIdResult.error.message);
            }

            const profileName = normalizeName(name, DEFAULT_PROFILE_NAME);

            await tx
                .insertInto('profiles')
                .values({
                    id: profileId,
                    name: profileName,
                    is_active: 0,
                    created_at: timestamp,
                    updated_at: timestamp,
                })
                .execute();

            await initializeProfileBaseline(tx, profileId, templateProfileIdResult.value, {
                copyAllSettings: false,
                timestamp,
            });

            const created = await tx
                .selectFrom('profiles')
                .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            if (!created) {
                throw new InvariantError(`Failed to create profile "${profileId}".`);
            }

            return okProfileStore(mapProfile(created));
        });

        return created;
    }

    async rename(profileId: string, name: string): Promise<ProfileRecord | null> {
        const { db } = getPersistence();
        const timestamp = createTimestamp();
        const nextName = normalizeName(name, DEFAULT_PROFILE_NAME);

        const updatedRows = await db
            .updateTable('profiles')
            .set({
                name: nextName,
                updated_at: timestamp,
            })
            .where('id', '=', profileId)
            .returning(['id', 'name', 'is_active', 'created_at', 'updated_at'])
            .execute();

        const updated = updatedRows[0];
        return updated ? mapProfile(updated) : null;
    }

    async duplicate(profileId: string, name?: string): Promise<ProfileStoreResult<ProfileRecord | null>> {
        const { db } = getPersistence();
        const timestamp = createTimestamp();
        const duplicateId = createProfileId();

        const duplicate = await db.transaction().execute(async (tx) => {
            const source = await tx
                .selectFrom('profiles')
                .select(['id', 'name'])
                .where('id', '=', profileId)
                .executeTakeFirst();

            if (!source) {
                return null;
            }

            const duplicateName = normalizeName(name, `${source.name} ${DEFAULT_DUPLICATE_SUFFIX}`);

            await tx
                .insertInto('profiles')
                .values({
                    id: duplicateId,
                    name: duplicateName,
                    is_active: 0,
                    created_at: timestamp,
                    updated_at: timestamp,
                })
                .execute();

            await initializeProfileBaseline(tx, duplicateId, source.id, {
                copyAllSettings: true,
                timestamp,
            });

            const duplicate = await tx
                .selectFrom('profiles')
                .select(['id', 'name', 'is_active', 'created_at', 'updated_at'])
                .where('id', '=', duplicateId)
                .executeTakeFirst();

            if (!duplicate) {
                throw new InvariantError(`Failed to duplicate profile "${source.id}".`);
            }

            return mapProfile(duplicate);
        });

        return okProfileStore(duplicate);
    }

    async delete(profileId: string): Promise<ProfileDeletionGuardResult> {
        const { db } = getPersistence();
        const timestamp = createTimestamp();

        return db.transaction().execute(async (tx) => {
            const profiles = await tx
                .selectFrom('profiles')
                .select(['id', 'is_active', 'created_at'])
                .orderBy('created_at', 'asc')
                .orderBy('id', 'asc')
                .execute();

            const target = profiles.find((profile) => profile.id === profileId);
            if (!target) {
                return {
                    deleted: false,
                    reason: 'profile_not_found',
                };
            }

            if (profiles.length === 1) {
                return {
                    deleted: false,
                    reason: 'last_profile',
                };
            }

            const nextActiveCandidate = profiles.find((profile) => profile.id !== profileId);
            if (!nextActiveCandidate) {
                return {
                    deleted: false,
                    reason: 'last_profile',
                };
            }

            if (target.is_active === 1) {
                await tx
                    .updateTable('profiles')
                    .set({ is_active: 0, updated_at: timestamp })
                    .where('is_active', '=', 1)
                    .execute();

                await tx
                    .updateTable('profiles')
                    .set({ is_active: 1, updated_at: timestamp })
                    .where('id', '=', nextActiveCandidate.id)
                    .execute();
            }

            await tx.deleteFrom('profiles').where('id', '=', profileId).execute();

            const activeProfileRow = await tx
                .selectFrom('profiles')
                .select(['id'])
                .where('is_active', '=', 1)
                .executeTakeFirst();

            const activeProfileId = activeProfileRow?.id ?? nextActiveCandidate.id;

            return {
                deleted: true,
                activeProfileId,
                ...(target.is_active === 1 ? { promotedProfileId: nextActiveCandidate.id } : {}),
            };
        });
    }
}

export const profileStore = new ProfileStore();
