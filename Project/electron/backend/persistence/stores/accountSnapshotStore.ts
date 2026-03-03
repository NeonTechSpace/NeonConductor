import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso, parseJsonValue } from '@/app/backend/persistence/stores/utils';
import type { KiloAccountContextRecord } from '@/app/backend/persistence/types';

const EMPTY_SNAPSHOT_UPDATED_AT = '1970-01-01T00:00:00.000Z';

export interface UpsertKiloAccountSnapshotInput {
    profileId: string;
    accountId?: string;
    displayName: string;
    emailMasked: string;
    authState: string;
    tokenExpiresAt?: string;
}

export interface ReplaceKiloOrganizationsInput {
    profileId: string;
    organizations: Array<{
        organizationId: string;
        name: string;
        isActive: boolean;
        entitlement?: Record<string, unknown>;
    }>;
}

export class AccountSnapshotStore {
    async getByProfile(profileId: string): Promise<KiloAccountContextRecord> {
        const { db } = getPersistence();
        const [accountRow, organizationRows] = await Promise.all([
            db
                .selectFrom('kilo_account_snapshots')
                .select([
                    'profile_id',
                    'account_id',
                    'display_name',
                    'email_masked',
                    'auth_state',
                    'token_expires_at',
                    'updated_at',
                ])
                .where('profile_id', '=', profileId)
                .executeTakeFirst(),
            db
                .selectFrom('kilo_org_snapshots')
                .select(['id', 'profile_id', 'organization_id', 'name', 'is_active', 'entitlement_json', 'updated_at'])
                .where('profile_id', '=', profileId)
                .orderBy('is_active', 'desc')
                .orderBy('name', 'asc')
                .execute(),
        ]);

        if (!accountRow) {
            return {
                profileId,
                displayName: '',
                emailMasked: '',
                authState: 'logged_out',
                organizations: organizationRows.map((organizationRow) => ({
                    id: organizationRow.id,
                    organizationId: organizationRow.organization_id,
                    name: organizationRow.name,
                    isActive: organizationRow.is_active === 1,
                    entitlement: parseJsonValue(organizationRow.entitlement_json, {}),
                })),
                updatedAt: EMPTY_SNAPSHOT_UPDATED_AT,
            };
        }

        return {
            profileId: accountRow.profile_id,
            ...(accountRow.account_id ? { accountId: accountRow.account_id } : {}),
            displayName: accountRow.display_name,
            emailMasked: accountRow.email_masked,
            authState: accountRow.auth_state,
            ...(accountRow.token_expires_at ? { tokenExpiresAt: accountRow.token_expires_at } : {}),
            organizations: organizationRows.map((organizationRow) => ({
                id: organizationRow.id,
                organizationId: organizationRow.organization_id,
                name: organizationRow.name,
                isActive: organizationRow.is_active === 1,
                entitlement: parseJsonValue(organizationRow.entitlement_json, {}),
            })),
            updatedAt: accountRow.updated_at,
        };
    }

    async upsertAccount(input: UpsertKiloAccountSnapshotInput): Promise<void> {
        const { db } = getPersistence();
        const updatedAt = nowIso();

        await db
            .insertInto('kilo_account_snapshots')
            .values({
                profile_id: input.profileId,
                account_id: input.accountId ?? null,
                display_name: input.displayName,
                email_masked: input.emailMasked,
                auth_state: input.authState,
                token_expires_at: input.tokenExpiresAt ?? null,
                updated_at: updatedAt,
            })
            .onConflict((oc) =>
                oc.column('profile_id').doUpdateSet({
                    account_id: input.accountId ?? null,
                    display_name: input.displayName,
                    email_masked: input.emailMasked,
                    auth_state: input.authState,
                    token_expires_at: input.tokenExpiresAt ?? null,
                    updated_at: updatedAt,
                })
            )
            .execute();
    }

    async replaceOrganizations(input: ReplaceKiloOrganizationsInput): Promise<void> {
        const { db } = getPersistence();
        const updatedAt = nowIso();

        await db.deleteFrom('kilo_org_snapshots').where('profile_id', '=', input.profileId).execute();

        if (input.organizations.length === 0) {
            return;
        }

        await db
            .insertInto('kilo_org_snapshots')
            .values(
                input.organizations.map((organization) => ({
                    id: `kilo_org_${input.profileId}_${organization.organizationId}`,
                    profile_id: input.profileId,
                    organization_id: organization.organizationId,
                    name: organization.name,
                    is_active: organization.isActive ? 1 : 0,
                    entitlement_json: JSON.stringify(organization.entitlement ?? {}),
                    updated_at: updatedAt,
                }))
            )
            .execute();
    }
}

export const accountSnapshotStore = new AccountSnapshotStore();
