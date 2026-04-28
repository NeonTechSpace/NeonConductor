import { accountSnapshotStore } from '@/app/backend/persistence/stores';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import { getAuthState } from '@/app/backend/providers/auth/authStateService';
import { syncKiloAccountContext } from '@/app/backend/providers/auth/kiloAccountSync';
import { readProviderSecretValue } from '@/app/backend/providers/auth/providerSecrets';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import type {
    KiloAccountContext,
    KiloCloudSessionPrerequisiteBlocker,
    KiloCloudSessionPrerequisites,
    KiloCloudSessionScope,
} from '@/app/backend/runtime/contracts';

interface KiloCloudSessionAccessContext {
    profileId: string;
    providerId: 'kilo';
    accessToken: string;
    accountContext: KiloAccountContext;
    authState: ProviderAuthStateRecord;
    scope: KiloCloudSessionScope;
}

async function readKiloCredential(profileId: string): Promise<string | undefined> {
    return (
        (await readProviderSecretValue(profileId, 'kilo', 'access_token')) ??
        (await readProviderSecretValue(profileId, 'kilo', 'api_key'))
    );
}

function resolveSelectedOrganization(input: {
    accountContext: KiloAccountContext;
    configuredOrganizationId?: string;
}): KiloAccountContext['organizations'][number] | undefined {
    if (input.configuredOrganizationId) {
        return input.accountContext.organizations.find(
            (organization) => organization.organizationId === input.configuredOrganizationId
        );
    }

    return input.accountContext.organizations.find((organization) => organization.isActive);
}

function resolveCloudSessionScope(input: {
    accountContext: KiloAccountContext;
    authState: ProviderAuthStateRecord;
}): KiloCloudSessionScope | undefined {
    const selectedOrganization = resolveSelectedOrganization({
        accountContext: input.accountContext,
        ...(input.authState.organizationId ? { configuredOrganizationId: input.authState.organizationId } : {}),
    });
    if (selectedOrganization) {
        return {
            scopeKind: 'organization',
            remoteScopeKey: selectedOrganization.organizationId,
            ...(input.accountContext.accountId ? { accountId: input.accountContext.accountId } : {}),
            organizationId: selectedOrganization.organizationId,
            organizationName: selectedOrganization.name,
        };
    }

    if (!input.accountContext.accountId) {
        return undefined;
    }

    return {
        scopeKind: 'account',
        remoteScopeKey: input.accountContext.accountId,
        accountId: input.accountContext.accountId,
    };
}

function resolveBlockers(input: {
    authState: ProviderAuthStateRecord;
    hasStoredCredential: boolean;
    accountContext: KiloAccountContext;
    scope: KiloCloudSessionScope | undefined;
}): KiloCloudSessionPrerequisiteBlocker[] {
    const blockers: KiloCloudSessionPrerequisiteBlocker[] = [];

    if (input.authState.authState !== 'authenticated') {
        blockers.push('auth_required');
    }
    if (!input.hasStoredCredential) {
        blockers.push('credential_required');
    }
    if (!input.accountContext.accountId) {
        blockers.push('account_context_required');
    }
    if (
        input.authState.organizationId &&
        !input.accountContext.organizations.some(
            (organization) => organization.organizationId === input.authState.organizationId
        )
    ) {
        blockers.push('organization_unavailable');
    }
    if (!input.scope && !blockers.includes('account_context_required')) {
        blockers.push('account_context_required');
    }

    return blockers;
}

export async function getKiloCloudSessionPrerequisites(
    profileId: string
): Promise<ProviderServiceResult<KiloCloudSessionPrerequisites>> {
    const [authState, accountContext, credential] = await Promise.all([
        getAuthState(profileId, 'kilo'),
        accountSnapshotStore.getByProfile(profileId),
        readKiloCredential(profileId),
    ]);
    const scope = resolveCloudSessionScope({ accountContext, authState });
    const blockers = resolveBlockers({
        authState,
        accountContext,
        scope,
        hasStoredCredential: Boolean(credential),
    });

    return okProviderService({
        profileId,
        providerId: 'kilo',
        authState: authState.authState,
        hasStoredCredential: Boolean(credential),
        accountContext,
        ...(scope ? { scope } : {}),
        blockers,
        canBrowseRemoteSessions: blockers.length === 0,
        canContinueRemoteSessions: blockers.length === 0,
    });
}

export async function resolveKiloCloudSessionAccessContext(
    profileId: string
): Promise<ProviderServiceResult<KiloCloudSessionAccessContext>> {
    const prerequisites = await getKiloCloudSessionPrerequisites(profileId);
    if (prerequisites.isErr()) {
        return errProviderService(prerequisites.error.code, prerequisites.error.message);
    }
    const accessToken = await readKiloCredential(profileId);
    if (!accessToken || !prerequisites.value.scope || prerequisites.value.blockers.length > 0) {
        return errProviderService('invalid_payload', 'Kilo cloud sessions require authenticated account context.');
    }

    return okProviderService({
        profileId,
        providerId: 'kilo',
        accessToken,
        accountContext: prerequisites.value.accountContext,
        authState: await getAuthState(profileId, 'kilo'),
        scope: prerequisites.value.scope,
    });
}

export async function refreshKiloAccountContext(
    profileId: string
): Promise<ProviderServiceResult<KiloCloudSessionPrerequisites>> {
    const authState = await getAuthState(profileId, 'kilo');
    const accessToken = await readKiloCredential(profileId);
    if (!accessToken) {
        return errProviderService('invalid_payload', 'Kilo account refresh requires a stored credential.');
    }

    const syncResult = await syncKiloAccountContext({
        profileId,
        accessToken,
        ...(authState.organizationId ? { organizationId: authState.organizationId } : {}),
        ...(authState.tokenExpiresAt ? { tokenExpiresAt: authState.tokenExpiresAt } : {}),
    });
    if (syncResult.isErr()) {
        return errProviderService(
            syncResult.error.code === 'provider_request_unavailable' ? 'request_unavailable' : 'request_failed',
            syncResult.error.message
        );
    }

    return getKiloCloudSessionPrerequisites(profileId);
}
