import { kiloRoutingPreferenceStore, providerStore } from '@/app/backend/persistence/stores';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';
import type {
    KiloModelRoutingPreference,
    ProviderGetModelRoutingPreferenceInput,
    ProviderSetModelRoutingPreferenceInput,
} from '@/app/backend/runtime/contracts';

function toContractPreference(input: {
    profileId: string;
    modelId: string;
    routingMode: 'dynamic' | 'pinned';
    sort?: 'default' | 'price' | 'throughput' | 'latency';
    pinnedProviderId?: string;
}): KiloModelRoutingPreference {
    if (input.routingMode === 'dynamic') {
        return {
            profileId: input.profileId,
            providerId: 'kilo',
            modelId: input.modelId,
            routingMode: 'dynamic',
            sort: input.sort ?? 'default',
        };
    }

    return {
        profileId: input.profileId,
        providerId: 'kilo',
        modelId: input.modelId,
        routingMode: 'pinned',
        pinnedProviderId: input.pinnedProviderId ?? '',
    };
}

export function validateKiloRoutingPreferenceInput(
    input: ProviderSetModelRoutingPreferenceInput
): ProviderServiceResult<void> {
    if (input.routingMode === 'dynamic') {
        if (!input.sort) {
            return errProviderService(
                'invalid_payload',
                'Invalid routing preference: "sort" is required when routingMode is "dynamic".'
            );
        }

        if (input.pinnedProviderId !== undefined) {
            return errProviderService(
                'invalid_payload',
                'Invalid routing preference: "pinnedProviderId" is not allowed when routingMode is "dynamic".'
            );
        }

        return okProviderService(undefined);
    }

    if (!input.pinnedProviderId) {
        return errProviderService(
            'invalid_payload',
            'Invalid routing preference: "pinnedProviderId" is required when routingMode is "pinned".'
        );
    }

    if (input.sort !== undefined) {
        return errProviderService(
            'invalid_payload',
            'Invalid routing preference: "sort" is not allowed when routingMode is "pinned".'
        );
    }

    return okProviderService(undefined);
}

async function assertKiloModelExists(profileId: string, modelId: string): Promise<ProviderServiceResult<void>> {
    const exists = await providerStore.modelExists(profileId, 'kilo', modelId);
    if (!exists) {
        return errProviderService('provider_model_missing', `Model "${modelId}" is not available for provider "kilo".`);
    }

    return okProviderService(undefined);
}

export async function getKiloModelRoutingPreference(
    input: ProviderGetModelRoutingPreferenceInput
): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
    const modelResult = await assertKiloModelExists(input.profileId, input.modelId);
    if (modelResult.isErr()) {
        return errProviderService(modelResult.error.code, modelResult.error.message);
    }

    const existing = await kiloRoutingPreferenceStore.getPreference(input.profileId, input.modelId);
    if (!existing) {
        return okProviderService({
            profileId: input.profileId,
            providerId: 'kilo',
            modelId: input.modelId,
            routingMode: 'dynamic',
            sort: 'default',
        });
    }

    return okProviderService(toContractPreference(existing));
}

export async function setKiloModelRoutingPreference(
    input: ProviderSetModelRoutingPreferenceInput
): Promise<ProviderServiceResult<KiloModelRoutingPreference>> {
    const validationResult = validateKiloRoutingPreferenceInput(input);
    if (validationResult.isErr()) {
        return errProviderService(validationResult.error.code, validationResult.error.message);
    }

    const modelResult = await assertKiloModelExists(input.profileId, input.modelId);
    if (modelResult.isErr()) {
        return errProviderService(modelResult.error.code, modelResult.error.message);
    }

    const saved = await kiloRoutingPreferenceStore.setPreference({
        profileId: input.profileId,
        providerId: 'kilo',
        modelId: input.modelId,
        routingMode: input.routingMode,
        ...(input.sort ? { sort: input.sort } : {}),
        ...(input.pinnedProviderId ? { pinnedProviderId: input.pinnedProviderId } : {}),
    });
    if (saved.isErr()) {
        return errProviderService('invalid_payload', saved.error.message);
    }

    return okProviderService(toContractPreference(saved.value));
}
