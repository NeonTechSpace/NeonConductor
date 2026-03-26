import {
    accountSnapshotStore,
    providerSecretStore,
    providerAuthFlowStore,
    providerAuthStore,
    providerStore,
} from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { getAuthMethodsForProvider } from '@/app/backend/providers/auth/constants';
import { errAuthExecution, okAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import { writeProviderSecretValue } from '@/app/backend/providers/auth/providerSecrets';
import type { FlowAuthMethod } from '@/app/backend/providers/auth/types';
import { assertSupportedProviderId } from '@/app/backend/providers/registry';
import { providerSecretKinds, type RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { getSecretStore } from '@/app/backend/secrets/store';

function nowIso(): string {
    return new Date().toISOString();
}

export function defaultAuthState(profileId: string, providerId: RuntimeProviderId): ProviderAuthStateRecord {
    return {
        profileId,
        providerId,
        authMethod: 'none',
        authState: 'logged_out',
        updatedAt: nowIso(),
    };
}

export async function ensureProviderExists(providerId: RuntimeProviderId): Promise<AuthExecutionResult<void>> {
    try {
        assertSupportedProviderId(providerId);
    } catch (error) {
        return errAuthExecution(
            'method_not_supported',
            error instanceof Error ? error.message : `Unsupported provider "${providerId}".`
        );
    }

    const exists = await providerStore.providerExists(providerId);
    if (!exists) {
        return errAuthExecution('method_not_supported', `Provider "${providerId}" is not registered.`);
    }

    return okAuthExecution(undefined);
}

export async function getAuthState(profileId: string, providerId: RuntimeProviderId): Promise<ProviderAuthStateRecord> {
    return (
        (await providerAuthStore.getByProfileAndProvider(profileId, providerId)) ??
        defaultAuthState(profileId, providerId)
    );
}

export async function setApiKey(
    profileId: string,
    providerId: RuntimeProviderId,
    apiKey: string
): Promise<AuthExecutionResult<ProviderAuthStateRecord>> {
    const providerCheck = await ensureProviderExists(providerId);
    if (providerCheck.isErr()) {
        return errAuthExecution(providerCheck.error.code, providerCheck.error.message);
    }

    const normalized = apiKey.trim();
    if (normalized.length === 0) {
        return errAuthExecution('invalid_payload', 'Invalid "apiKey": expected non-empty string.');
    }

    if (!getAuthMethodsForProvider(providerId).includes('api_key')) {
        return errAuthExecution(
            'method_not_supported',
            `Provider "${providerId}" does not support API-key authentication.`
        );
    }

    await writeProviderSecretValue({
        profileId,
        providerId,
        secretKind: 'api_key',
        value: normalized,
    });
    await providerAuthStore.upsert({
        profileId,
        providerId,
        authMethod: 'api_key',
        authState: 'configured',
    });

    return okAuthExecution(await getAuthState(profileId, providerId));
}

export async function clearAuth(
    profileId: string,
    providerId: RuntimeProviderId
): Promise<AuthExecutionResult<{ cleared: boolean; authState: ProviderAuthStateRecord }>> {
    const providerCheck = await ensureProviderExists(providerId);
    if (providerCheck.isErr()) {
        return errAuthExecution(providerCheck.error.code, providerCheck.error.message);
    }

    const existingProviderSecrets = await providerSecretStore.listByProfileAndProvider(profileId, providerId);
    const store = getSecretStore();
    await Promise.allSettled(
        providerSecretKinds.map((secretKind) => store.deleteValue(profileId, providerId, secretKind))
    );
    await providerAuthFlowStore.cancelPendingByProvider(profileId, providerId);

    await providerAuthStore.upsert({
        profileId,
        providerId,
        authMethod: 'none',
        authState: 'logged_out',
    });

    if (providerId === 'kilo') {
        await accountSnapshotStore.upsertAccount({
            profileId,
            displayName: '',
            emailMasked: '',
            authState: 'logged_out',
        });
        await accountSnapshotStore.replaceOrganizations({
            profileId,
            organizations: [],
        });
    }

    return okAuthExecution({
        cleared: existingProviderSecrets.length > 0,
        authState: await getAuthState(profileId, providerId),
    });
}

export async function persistAuthenticatedState(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    authMethod: FlowAuthMethod;
    accessToken: string;
    refreshToken?: string;
    tokenExpiresAt?: string;
    accountId?: string;
    organizationId?: string;
}): Promise<ProviderAuthStateRecord> {
    await writeProviderSecretValue({
        profileId: input.profileId,
        providerId: input.providerId,
        secretKind: 'access_token',
        value: input.accessToken,
    });
    if (input.refreshToken) {
        await writeProviderSecretValue({
            profileId: input.profileId,
            providerId: input.providerId,
            secretKind: 'refresh_token',
            value: input.refreshToken,
        });
    }

    await providerAuthStore.upsert({
        profileId: input.profileId,
        providerId: input.providerId,
        authMethod: input.authMethod,
        authState: 'authenticated',
        ...(input.accountId ? { accountId: input.accountId } : {}),
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        ...(input.tokenExpiresAt ? { tokenExpiresAt: input.tokenExpiresAt } : {}),
    });

    return getAuthState(input.profileId, input.providerId);
}
