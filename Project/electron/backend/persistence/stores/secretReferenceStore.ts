import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { SecretReferenceRecord } from '@/app/backend/persistence/types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

function mapSecretReference(row: {
    id: string;
    profile_id: string;
    provider_id: string;
    secret_key_ref: string;
    secret_kind: string;
    status: string;
    updated_at: string;
}): SecretReferenceRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        providerId: row.provider_id as RuntimeProviderId,
        secretKeyRef: row.secret_key_ref,
        secretKind: row.secret_kind,
        status: row.status,
        updatedAt: row.updated_at,
    };
}

export class SecretReferenceStore {
    async listByProfile(profileId: string): Promise<SecretReferenceRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('secret_references')
            .select(['id', 'profile_id', 'provider_id', 'secret_key_ref', 'secret_kind', 'status', 'updated_at'])
            .where('profile_id', '=', profileId)
            .orderBy('provider_id', 'asc')
            .orderBy('secret_kind', 'asc')
            .execute();

        return rows.map(mapSecretReference);
    }

    async listAll(): Promise<SecretReferenceRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('secret_references')
            .select(['id', 'profile_id', 'provider_id', 'secret_key_ref', 'secret_kind', 'status', 'updated_at'])
            .orderBy('profile_id', 'asc')
            .orderBy('provider_id', 'asc')
            .orderBy('secret_kind', 'asc')
            .execute();

        return rows.map(mapSecretReference);
    }

    async listByProfileAndProvider(profileId: string, providerId: RuntimeProviderId): Promise<SecretReferenceRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('secret_references')
            .select(['id', 'profile_id', 'provider_id', 'secret_key_ref', 'secret_kind', 'status', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .orderBy('secret_kind', 'asc')
            .execute();

        return rows.map(mapSecretReference);
    }

    async getByProfileProviderAndKind(
        profileId: string,
        providerId: RuntimeProviderId,
        secretKind: string
    ): Promise<SecretReferenceRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('secret_references')
            .select(['id', 'profile_id', 'provider_id', 'secret_key_ref', 'secret_kind', 'status', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('secret_kind', '=', secretKind)
            .executeTakeFirst();

        return row ? mapSecretReference(row) : null;
    }

    async upsert(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        secretKind: string;
        secretKeyRef: string;
        status: string;
    }): Promise<SecretReferenceRecord> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        const id = `secret_ref_${randomUUID()}`;

        await db
            .insertInto('secret_references')
            .values({
                id,
                profile_id: input.profileId,
                provider_id: input.providerId,
                secret_key_ref: input.secretKeyRef,
                secret_kind: input.secretKind,
                status: input.status,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'provider_id', 'secret_kind']).doUpdateSet({
                    secret_key_ref: input.secretKeyRef,
                    status: input.status,
                    updated_at: updatedAt,
                })
            )
            .execute();

        const row = await db
            .selectFrom('secret_references')
            .select(['id', 'profile_id', 'provider_id', 'secret_key_ref', 'secret_kind', 'status', 'updated_at'])
            .where('profile_id', '=', input.profileId)
            .where('provider_id', '=', input.providerId)
            .where('secret_kind', '=', input.secretKind)
            .executeTakeFirstOrThrow();

        return mapSecretReference(row);
    }

    async deleteByProfileAndProvider(profileId: string, providerId: RuntimeProviderId): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('secret_references')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .returning('id')
            .execute();

        return rows.length;
    }

    async deleteByProfileProviderAndKind(
        profileId: string,
        providerId: RuntimeProviderId,
        secretKind: string
    ): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('secret_references')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('secret_kind', '=', secretKind)
            .returning('id')
            .execute();

        return rows.length;
    }
}

export const secretReferenceStore = new SecretReferenceStore();
