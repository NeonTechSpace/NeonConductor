import type { ProviderListItem } from '@/web/components/settings/providerSettings/types';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';

import type { RuntimeProviderId } from '@/shared/contracts';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';


export function resolveSelectedProviderId(
    providers: ProviderListItem[],
    selectedProviderId: RuntimeProviderId | undefined
): RuntimeProviderId | undefined {
    if (selectedProviderId && providers.some((provider) => provider.id === selectedProviderId)) {
        return selectedProviderId;
    }

    return providers.find((provider) => provider.isDefault)?.id ?? providers[0]?.id;
}

export function resolveSelectedModelId(input: {
    selectedProviderId: string | undefined;
    selectedModelId: string;
    models: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
}): string {
    if (!input.selectedProviderId) {
        return input.selectedModelId;
    }

    const canonicalSelectedModelId = input.selectedModelId
        ? canonicalizeProviderModelId(input.selectedProviderId, input.selectedModelId)
        : input.selectedModelId;
    if (canonicalSelectedModelId && input.models.some((model) => model.id === canonicalSelectedModelId)) {
        return canonicalSelectedModelId;
    }

    const canonicalDefaultModelId =
        input.defaults?.providerId === input.selectedProviderId
            ? canonicalizeProviderModelId(input.selectedProviderId, input.defaults.modelId)
            : undefined;
    if (
        input.defaults?.providerId === input.selectedProviderId &&
        canonicalDefaultModelId &&
        input.models.some((model) => model.id === canonicalDefaultModelId)
    ) {
        return canonicalDefaultModelId;
    }

    return input.models[0]?.id ?? '';
}
