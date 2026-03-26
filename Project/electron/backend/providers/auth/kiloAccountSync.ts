import { accountSnapshotStore, providerStore } from '@/app/backend/persistence/stores';
import { errAuthExecution, okAuthExecution, type AuthExecutionResult } from '@/app/backend/providers/auth/errors';
import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';

export async function syncKiloAccountContext(input: {
    profileId: string;
    accessToken: string;
    organizationId?: string;
    tokenExpiresAt?: string;
}): Promise<AuthExecutionResult<void>> {
    const headers = {
        accessToken: input.accessToken,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    };

    const profileResultPromise = kiloGatewayClient.getProfile(headers);
    const defaultsResultPromise = input.organizationId
        ? kiloGatewayClient.getOrganizationDefaults(input.organizationId, headers)
        : kiloGatewayClient.getDefaults(headers);
    const balanceResultPromise = kiloGatewayClient.getProfileBalance(headers);

    const profileResult = await profileResultPromise;
    if (profileResult.isErr()) {
        return errAuthExecution(
            profileResult.error.code === 'timeout' || profileResult.error.code === 'network_error'
                ? 'provider_request_unavailable'
                : 'provider_request_failed',
            profileResult.error.message
        );
    }

    const [defaultsResult, balanceResult] = await Promise.all([defaultsResultPromise, balanceResultPromise]);
    const profile = profileResult.value;
    const balance = balanceResult.isOk() ? balanceResult.value : undefined;

    await accountSnapshotStore.upsertAccount({
        profileId: input.profileId,
        ...(profile.accountId ? { accountId: profile.accountId } : {}),
        displayName: profile.displayName,
        emailMasked: profile.emailMasked,
        authState: 'authenticated',
        ...(input.tokenExpiresAt ? { tokenExpiresAt: input.tokenExpiresAt } : {}),
        ...(balance
            ? {
                  balance: {
                      amount: balance.balance,
                      currency: balance.currency,
                      updatedAt: new Date().toISOString(),
                  },
              }
            : {}),
    });
    await accountSnapshotStore.replaceOrganizations({
        profileId: input.profileId,
        organizations: profile.organizations,
    });

    if (defaultsResult.isOk() && defaultsResult.value.defaultModelId) {
        const modelExists = await providerStore.modelExists(
            input.profileId,
            'kilo',
            defaultsResult.value.defaultModelId
        );
        if (modelExists) {
            await providerStore.setDefaults(input.profileId, 'kilo', defaultsResult.value.defaultModelId);
        }
    }

    return okAuthExecution(undefined);
}
