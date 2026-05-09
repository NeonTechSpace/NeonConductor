import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import {
    resolveSelectedModelId,
    resolveSelectedProviderId,
} from '@/web/components/settings/providerSettings/selection';
import {
    findProviderControlEntry,
    getProviderControlDefaults,
    getProviderControlModelFavorites,
    getProviderControlModelRoleDefaults,
    listProviderControlProviders,
} from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsReadModelInput {
    profileId: string;
    requestedProviderId: RuntimeProviderId | undefined;
    requestedModelId: string;
}

export function useProviderSettingsReadModel(input: UseProviderSettingsReadModelInput) {
    const controlPlaneQuery = trpc.provider.getControlPlane.useQuery(
        { profileId: input.profileId },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const providerControl = controlPlaneQuery.data?.providerControl;
    const providerItems = listProviderControlProviders(providerControl);
    const defaults = getProviderControlDefaults(providerControl);
    const modelFavorites = getProviderControlModelFavorites(providerControl);
    const modelRoleDefaults = getProviderControlModelRoleDefaults(providerControl);
    const selectedProviderId = resolveSelectedProviderId(providerItems, input.requestedProviderId);
    const selectedProviderEntry = findProviderControlEntry(providerControl, selectedProviderId);
    const selectedProvider = providerItems.find((provider) => provider.id === selectedProviderId);
    const models = selectedProviderEntry?.models ?? [];
    const selectedModelId = resolveSelectedModelId({
        selectedProviderId,
        selectedModelId: input.requestedModelId,
        models,
        defaults,
    });
    const modelOptions = models.map((model) =>
        buildModelPickerOption({
            model,
            ...(selectedProvider ? { provider: selectedProvider } : {}),
            compatibilityContext: {
                surface: 'settings',
            },
        })
    );
    const selectedIsDefaultProvider = defaults?.providerId === selectedProviderId;
    const selectedIsDefaultModel = selectedIsDefaultProvider && defaults?.modelId === selectedModelId;

    return {
        controlPlaneQuery,
        providerControl,
        providerItems,
        defaults,
        modelFavorites,
        modelRoleDefaults,
        selectedProviderId,
        selectedProviderEntry,
        selectedProvider,
        models,
        modelOptions,
        selectedModelId,
        selectedIsDefaultModel,
        catalogStateReason: selectedProviderEntry?.catalogState.reason ?? null,
        catalogStateDetail: selectedProviderEntry?.catalogState.detail,
    };
}
