import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
import type { ProviderAuthStateRecord } from '@/app/backend/persistence/types';
import type { ProviderCatalogInvalidationDecision } from '@/app/backend/providers/service/providerMutationLifecycle.types';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';

export type ProviderCatalogMutationKind = 'auth' | 'connection_profile' | 'organization';
export interface ProviderCatalogInvalidationActions {
    flushProviderScope(profileId: string, providerId: RuntimeProviderId): Promise<void>;
    invalidateProviderScope(profileId: string, providerId: RuntimeProviderId): Promise<void>;
}

function resolveDecision(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    mutationKind: ProviderCatalogMutationKind;
}): ProviderCatalogInvalidationDecision {
    if (input.mutationKind === 'connection_profile' || input.mutationKind === 'organization') {
        return {
            kind: 'invalidate',
            profileId: input.profileId,
            providerId: input.providerId,
        };
    }

    return {
        kind: input.providerId === 'kilo' ? 'invalidate' : 'flush',
        profileId: input.profileId,
        providerId: input.providerId,
    };
}

export function createProviderCatalogInvalidationPolicy() {
    return {
        resolveAuthMutation(profileId: string, providerId: RuntimeProviderId) {
            return resolveDecision({
                profileId,
                providerId,
                mutationKind: 'auth',
            });
        },
        resolveAuthPoll(authState: ProviderAuthStateRecord): ProviderCatalogInvalidationDecision {
            if (authState.authState === 'pending') {
                return {
                    kind: 'none',
                    profileId: authState.profileId,
                    providerId: authState.providerId,
                };
            }

            return resolveDecision({
                profileId: authState.profileId,
                providerId: authState.providerId,
                mutationKind: 'auth',
            });
        },
        resolveConnectionProfileMutation(profileId: string, providerId: RuntimeProviderId) {
            return resolveDecision({
                profileId,
                providerId,
                mutationKind: 'connection_profile',
            });
        },
        resolveOrganizationMutation(profileId: string, providerId: RuntimeProviderId) {
            return resolveDecision({
                profileId,
                providerId,
                mutationKind: 'organization',
            });
        },
        resolveCatalogSyncMutation(profileId: string, providerId: RuntimeProviderId): ProviderCatalogInvalidationDecision {
            return {
                kind: 'none',
                profileId,
                providerId,
            };
        },
    };
}

export const providerCatalogInvalidationPolicy = createProviderCatalogInvalidationPolicy();

export function resolveProviderCatalogInvalidationDecision(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    mutationKind: ProviderCatalogMutationKind;
}): ProviderCatalogInvalidationDecision {
    return resolveDecision(input);
}

export async function applyProviderCatalogInvalidationDecision(
    actions: ProviderCatalogInvalidationActions,
    decision: ProviderCatalogInvalidationDecision
): Promise<void> {
    if (decision.kind === 'none') {
        return;
    }

    if (decision.kind === 'invalidate') {
        await actions.invalidateProviderScope(decision.profileId, decision.providerId);
        return;
    }

    await actions.flushProviderScope(decision.profileId, decision.providerId);
}

export const providerCatalogInvalidationActions: ProviderCatalogInvalidationActions = {
    flushProviderScope(profileId, providerId) {
        return providerMetadataOrchestrator.flushProviderScope(profileId, providerId);
    },
    invalidateProviderScope(profileId, providerId) {
        return providerMetadataOrchestrator.invalidateProviderScope(profileId, providerId);
    },
};
