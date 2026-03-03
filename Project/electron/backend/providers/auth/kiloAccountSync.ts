import { accountSnapshotStore, providerStore } from '@/app/backend/persistence/stores';
import { kiloGatewayClient } from '@/app/backend/providers/kiloGatewayClient';

export async function syncKiloAccountContext(input: {
    profileId: string;
    accessToken: string;
    organizationId?: string;
}): Promise<void> {
    const headers = {
        accessToken: input.accessToken,
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
    };

    const [profile, defaults] = await Promise.all([
        kiloGatewayClient.getProfile(headers),
        input.organizationId
            ? kiloGatewayClient.getOrganizationDefaults(input.organizationId, headers)
            : kiloGatewayClient.getDefaults(headers),
    ]);

    await accountSnapshotStore.upsertAccount({
        profileId: input.profileId,
        ...(profile.accountId ? { accountId: profile.accountId } : {}),
        displayName: profile.displayName,
        emailMasked: profile.emailMasked,
        authState: 'authenticated',
    });
    await accountSnapshotStore.replaceOrganizations({
        profileId: input.profileId,
        organizations: profile.organizations,
    });

    if (defaults.defaultModelId) {
        const modelExists = await providerStore.modelExists(input.profileId, 'kilo', defaults.defaultModelId);
        if (modelExists) {
            await providerStore.setDefaults(input.profileId, 'kilo', defaults.defaultModelId);
        }
    }
}
