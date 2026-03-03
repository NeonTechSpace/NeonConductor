import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import { providerAuthMethods, providerAuthStates } from '@/app/backend/runtime/contracts';
import type { ProviderAuthMethod, ProviderAuthState, RuntimeProviderId } from '@/app/backend/runtime/contracts';

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
    return allowed.some((candidate) => candidate === value);
}

function parseProviderId(value: string): RuntimeProviderId {
    return assertSupportedProviderId(value);
}

function parseAuthMethod(value: string): ProviderAuthMethod | 'none' {
    if (value === 'none') {
        return 'none';
    }

    if (isOneOf(value, providerAuthMethods)) {
        return value;
    }

    throw new Error(`Invalid provider auth method in persistence row: "${value}".`);
}

function parseAuthState(value: string): ProviderAuthState {
    if (isOneOf(value, providerAuthStates)) {
        return value;
    }

    throw new Error(`Invalid provider auth state in persistence row: "${value}".`);
}

function mapAuthState(row: {
    profile_id: string;
    provider_id: string;
    auth_method: string;
    auth_state: string;
    account_id: string | null;
    organization_id: string | null;
    token_expires_at: string | null;
    last_error_code: string | null;
    last_error_message: string | null;
    updated_at: string;
}): ProviderAuthStateRecord {
    return {
        profileId: row.profile_id,
        providerId: parseProviderId(row.provider_id),
        authMethod: parseAuthMethod(row.auth_method),
        authState: parseAuthState(row.auth_state),
        ...(row.account_id ? { accountId: row.account_id } : {}),
        ...(row.organization_id ? { organizationId: row.organization_id } : {}),
        ...(row.token_expires_at ? { tokenExpiresAt: row.token_expires_at } : {}),
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
        ...(row.last_error_message ? { lastErrorMessage: row.last_error_message } : {}),
        updatedAt: row.updated_at,
    };
}

export interface UpsertProviderAuthStateInput {
    profileId: string;
    providerId: RuntimeProviderId;
    authMethod: ProviderAuthMethod | 'none';
    authState: ProviderAuthState;
    accountId?: string;
    organizationId?: string;
    tokenExpiresAt?: string;
    lastErrorCode?: string;
    lastErrorMessage?: string;
}

export class ProviderAuthStore {
    async listByProfile(profileId: string): Promise<ProviderAuthStateRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('provider_auth_states')
            .select([
                'profile_id',
                'provider_id',
                'auth_method',
                'auth_state',
                'account_id',
                'organization_id',
                'token_expires_at',
                'last_error_code',
                'last_error_message',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .orderBy('provider_id', 'asc')
            .execute();

        return rows.map(mapAuthState);
    }

    async getByProfileAndProvider(
        profileId: string,
        providerId: RuntimeProviderId
    ): Promise<ProviderAuthStateRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('provider_auth_states')
            .select([
                'profile_id',
                'provider_id',
                'auth_method',
                'auth_state',
                'account_id',
                'organization_id',
                'token_expires_at',
                'last_error_code',
                'last_error_message',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .executeTakeFirst();

        return row ? mapAuthState(row) : null;
    }

    async upsert(input: UpsertProviderAuthStateInput): Promise<void> {
        const { db } = getPersistence();
        const updatedAt = nowIso();

        await db
            .insertInto('provider_auth_states')
            .values({
                profile_id: input.profileId,
                provider_id: input.providerId,
                auth_method: input.authMethod,
                auth_state: input.authState,
                account_id: input.accountId ?? null,
                organization_id: input.organizationId ?? null,
                token_expires_at: input.tokenExpiresAt ?? null,
                last_error_code: input.lastErrorCode ?? null,
                last_error_message: input.lastErrorMessage ?? null,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.columns(['profile_id', 'provider_id']).doUpdateSet({
                    auth_method: input.authMethod,
                    auth_state: input.authState,
                    account_id: input.accountId ?? null,
                    organization_id: input.organizationId ?? null,
                    token_expires_at: input.tokenExpiresAt ?? null,
                    last_error_code: input.lastErrorCode ?? null,
                    last_error_message: input.lastErrorMessage ?? null,
                    updated_at: updatedAt,
                })
            )
            .execute();
    }
}

export const providerAuthStore = new ProviderAuthStore();
