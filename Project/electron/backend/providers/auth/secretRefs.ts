import { secretReferenceStore } from '@/app/backend/persistence/stores';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { getSecretStore } from '@/app/backend/secrets/store';

function buildSecretKeyRef(profileId: string, providerId: RuntimeProviderId, secretKind: string): string {
    return `provider/${profileId}/${providerId}/${secretKind}`;
}

export async function persistSecretRef(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    secretKind: 'api_key' | 'access_token' | 'refresh_token';
    value: string;
}): Promise<void> {
    const secretKeyRef = buildSecretKeyRef(input.profileId, input.providerId, input.secretKind);
    await getSecretStore().set(secretKeyRef, input.value);
    await secretReferenceStore.upsert({
        profileId: input.profileId,
        providerId: input.providerId,
        secretKind: input.secretKind,
        secretKeyRef,
        status: 'active',
    });
}

export async function readSecretValue(
    profileId: string,
    providerId: RuntimeProviderId,
    secretKind: 'api_key' | 'access_token' | 'refresh_token'
): Promise<string | undefined> {
    const ref = await secretReferenceStore.getByProfileProviderAndKind(profileId, providerId, secretKind);
    if (!ref) {
        return undefined;
    }

    const value = await getSecretStore().get(ref.secretKeyRef);
    return value ?? undefined;
}
