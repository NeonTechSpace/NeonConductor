import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { ProviderSecretKindRecord, ProviderSecretRecord } from '@/app/backend/persistence/types';
import { providerIds, providerSecretKinds, type RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { decryptSecretPayload, encryptSecretPayload } from '@/app/backend/secrets/secretPayloadCodec';

function mapProviderSecret(row: {
    id: string;
    profile_id: string;
    provider_id: string;
    secret_kind: string;
    updated_at: string;
}): ProviderSecretRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        providerId: parseEnumValue(row.provider_id, 'provider_secrets.provider_id', providerIds),
        secretKind: parseEnumValue(row.secret_kind, 'provider_secrets.secret_kind', providerSecretKinds),
        updatedAt: row.updated_at,
    };
}

export class ProviderSecretStore {
    async listByProfile(profileId: string): Promise<ProviderSecretRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('provider_secrets')
            .select(['id', 'profile_id', 'provider_id', 'secret_kind', 'updated_at'])
            .where('profile_id', '=', profileId)
            .orderBy('provider_id', 'asc')
            .orderBy('secret_kind', 'asc')
            .execute();

        return rows.map(mapProviderSecret);
    }

    async listByProfileAndProvider(profileId: string, providerId: RuntimeProviderId): Promise<ProviderSecretRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('provider_secrets')
            .select(['id', 'profile_id', 'provider_id', 'secret_kind', 'updated_at'])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .orderBy('secret_kind', 'asc')
            .execute();

        return rows.map(mapProviderSecret);
    }

    async getValue(
        profileId: string,
        providerId: RuntimeProviderId,
        secretKind: ProviderSecretKindRecord
    ): Promise<string | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('provider_secrets')
            .select('secret_payload')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('secret_kind', '=', secretKind)
            .executeTakeFirst();

        return row ? decryptSecretPayload(row.secret_payload) : null;
    }

    async upsertValue(input: {
        profileId: string;
        providerId: RuntimeProviderId;
        secretKind: ProviderSecretKindRecord;
        secretValue: string;
    }): Promise<ProviderSecretRecord> {
        const { db } = getPersistence();
        const updatedAt = nowIso();
        const id = `provider_secret_${randomUUID()}`;
        const secretPayload = await encryptSecretPayload(input.secretValue);

        await db
            .insertInto('provider_secrets')
            .values({
                id,
                profile_id: input.profileId,
                provider_id: input.providerId,
                secret_kind: input.secretKind,
                secret_payload: secretPayload,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'provider_id', 'secret_kind']).doUpdateSet({
                    secret_payload: secretPayload,
                    updated_at: updatedAt,
                })
            )
            .execute();

        const row = await db
            .selectFrom('provider_secrets')
            .select(['id', 'profile_id', 'provider_id', 'secret_kind', 'updated_at'])
            .where('profile_id', '=', input.profileId)
            .where('provider_id', '=', input.providerId)
            .where('secret_kind', '=', input.secretKind)
            .executeTakeFirstOrThrow();

        return mapProviderSecret(row);
    }

    async deleteByProfileAndProvider(profileId: string, providerId: RuntimeProviderId): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('provider_secrets')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .returning('id')
            .execute();

        return rows.length;
    }

    async deleteByProfileProviderAndKind(
        profileId: string,
        providerId: RuntimeProviderId,
        secretKind: ProviderSecretKindRecord
    ): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('provider_secrets')
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('secret_kind', '=', secretKind)
            .returning('id')
            .execute();

        return rows.length;
    }

    async deleteAll(): Promise<number> {
        const { db } = getPersistence();
        const rows = await db.deleteFrom('provider_secrets').returning('id').execute();
        return rows.length;
    }
}

export const providerSecretStore = new ProviderSecretStore();
