import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { nowIso } from '@/app/backend/persistence/stores/utils';
import type { ProviderAuthFlowRecord } from '@/app/backend/persistence/types';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import type {
    ProviderAuthFlowStatus,
    ProviderAuthFlowType,
    ProviderAuthMethod,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import { providerAuthFlowStatuses, providerAuthFlowTypes, providerAuthMethods } from '@/app/backend/runtime/contracts';

type FlowAuthMethod = Extract<ProviderAuthMethod, 'device_code' | 'oauth_pkce' | 'oauth_device'>;
const flowAuthMethods = ['device_code', 'oauth_pkce', 'oauth_device'] as const;

function isOneOf<T extends string>(value: string, allowed: readonly T[]): value is T {
    return allowed.some((candidate) => candidate === value);
}

function parseProviderId(value: string): RuntimeProviderId {
    return assertSupportedProviderId(value);
}

function parseFlowType(value: string): ProviderAuthFlowType {
    if (isOneOf(value, providerAuthFlowTypes)) {
        return value;
    }

    throw new Error(`Invalid provider auth flow type in persistence row: "${value}".`);
}

function parseFlowStatus(value: string): ProviderAuthFlowStatus {
    if (isOneOf(value, providerAuthFlowStatuses)) {
        return value;
    }

    throw new Error(`Invalid provider auth flow status in persistence row: "${value}".`);
}

function parseFlowAuthMethod(value: string): FlowAuthMethod {
    if (!isOneOf(value, providerAuthMethods)) {
        throw new Error(`Invalid provider auth method in persistence row: "${value}".`);
    }

    if (isOneOf(value, flowAuthMethods)) {
        return value;
    }

    throw new Error(`Invalid provider auth flow method in persistence row: "${value}".`);
}

function mapProviderAuthFlow(row: {
    id: string;
    profile_id: string;
    provider_id: string;
    flow_type: string;
    auth_method: string;
    nonce: string | null;
    state: string | null;
    code_verifier: string | null;
    redirect_uri: string | null;
    device_code: string | null;
    user_code: string | null;
    verification_uri: string | null;
    poll_interval_seconds: number | null;
    expires_at: string;
    status: string;
    last_error_code: string | null;
    last_error_message: string | null;
    created_at: string;
    updated_at: string;
    consumed_at: string | null;
}): ProviderAuthFlowRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        providerId: parseProviderId(row.provider_id),
        flowType: parseFlowType(row.flow_type),
        authMethod: parseFlowAuthMethod(row.auth_method),
        ...(row.nonce ? { nonce: row.nonce } : {}),
        ...(row.state ? { state: row.state } : {}),
        ...(row.code_verifier ? { codeVerifier: row.code_verifier } : {}),
        ...(row.redirect_uri ? { redirectUri: row.redirect_uri } : {}),
        ...(row.device_code ? { deviceCode: row.device_code } : {}),
        ...(row.user_code ? { userCode: row.user_code } : {}),
        ...(row.verification_uri ? { verificationUri: row.verification_uri } : {}),
        ...(row.poll_interval_seconds !== null ? { pollIntervalSeconds: row.poll_interval_seconds } : {}),
        expiresAt: row.expires_at,
        status: parseFlowStatus(row.status),
        ...(row.last_error_code ? { lastErrorCode: row.last_error_code } : {}),
        ...(row.last_error_message ? { lastErrorMessage: row.last_error_message } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        ...(row.consumed_at ? { consumedAt: row.consumed_at } : {}),
    };
}

export interface CreateProviderAuthFlowInput {
    profileId: string;
    providerId: RuntimeProviderId;
    flowType: ProviderAuthFlowType;
    authMethod: FlowAuthMethod;
    expiresAt: string;
    nonce?: string;
    state?: string;
    codeVerifier?: string;
    redirectUri?: string;
    deviceCode?: string;
    userCode?: string;
    verificationUri?: string;
    pollIntervalSeconds?: number;
}

export interface UpdateProviderAuthFlowInput {
    status: ProviderAuthFlowStatus;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    consumedAt?: string | null;
}

export class ProviderAuthFlowStore {
    async create(input: CreateProviderAuthFlowInput): Promise<ProviderAuthFlowRecord> {
        const { db } = getPersistence();
        const id = `provider_auth_flow_${randomUUID()}`;
        const now = nowIso();

        await db
            .insertInto('provider_auth_flows')
            .values({
                id,
                profile_id: input.profileId,
                provider_id: input.providerId,
                flow_type: input.flowType,
                auth_method: input.authMethod,
                nonce: input.nonce ?? null,
                state: input.state ?? null,
                code_verifier: input.codeVerifier ?? null,
                redirect_uri: input.redirectUri ?? null,
                device_code: input.deviceCode ?? null,
                user_code: input.userCode ?? null,
                verification_uri: input.verificationUri ?? null,
                poll_interval_seconds: input.pollIntervalSeconds ?? null,
                expires_at: input.expiresAt,
                status: 'pending',
                last_error_code: null,
                last_error_message: null,
                created_at: now,
                updated_at: now,
                consumed_at: null,
            })
            .execute();

        const row = await db
            .selectFrom('provider_auth_flows')
            .selectAll()
            .where('id', '=', id)
            .executeTakeFirstOrThrow();

        return mapProviderAuthFlow(row);
    }

    async cancelPendingByProvider(profileId: string, providerId: RuntimeProviderId): Promise<number> {
        const { db } = getPersistence();
        const now = nowIso();
        const rows = await db
            .updateTable('provider_auth_flows')
            .set({
                status: 'cancelled',
                updated_at: now,
                consumed_at: now,
                last_error_code: 'superseded',
                last_error_message: 'Superseded by a newer auth flow.',
            })
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .where('status', '=', 'pending')
            .returning('id')
            .execute();

        return rows.length;
    }

    async getById(flowId: string): Promise<ProviderAuthFlowRecord | null> {
        const { db } = getPersistence();
        const row = await db.selectFrom('provider_auth_flows').selectAll().where('id', '=', flowId).executeTakeFirst();

        return row ? mapProviderAuthFlow(row) : null;
    }

    async getByProfileProviderAndId(
        profileId: string,
        providerId: RuntimeProviderId,
        flowId: string
    ): Promise<ProviderAuthFlowRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('provider_auth_flows')
            .selectAll()
            .where('id', '=', flowId)
            .where('profile_id', '=', profileId)
            .where('provider_id', '=', providerId)
            .executeTakeFirst();

        return row ? mapProviderAuthFlow(row) : null;
    }

    async listByProfile(profileId: string): Promise<ProviderAuthFlowRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('provider_auth_flows')
            .selectAll()
            .where('profile_id', '=', profileId)
            .orderBy('created_at', 'desc')
            .execute();

        return rows.map(mapProviderAuthFlow);
    }

    async updateStatus(flowId: string, input: UpdateProviderAuthFlowInput): Promise<ProviderAuthFlowRecord | null> {
        const { db } = getPersistence();
        const now = nowIso();
        const updateValues: {
            status: ProviderAuthFlowStatus;
            last_error_code: string | null;
            last_error_message: string | null;
            updated_at: string;
            consumed_at?: string | null;
        } = {
            status: input.status,
            last_error_code: input.lastErrorCode ?? null,
            last_error_message: input.lastErrorMessage ?? null,
            updated_at: now,
        };

        if (input.consumedAt !== undefined) {
            updateValues.consumed_at = input.consumedAt;
        }

        const rows = await db
            .updateTable('provider_auth_flows')
            .set(updateValues)
            .where('id', '=', flowId)
            .returningAll()
            .execute();

        const row = rows.at(0);
        return row ? mapProviderAuthFlow(row) : null;
    }
}

export const providerAuthFlowStore = new ProviderAuthFlowStore();
