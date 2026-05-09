import { buildProviderSettingsFeedback } from '@/web/components/settings/providerSettings/hooks/providerSettingsFeedback';
import { useProviderSettingsMutations } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutations';
import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsMutationModelInput {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    statusMessage: string | undefined;
    setStatusMessage: (value: string | undefined) => void;
    setActiveAuthFlow: (value: ActiveAuthFlow | undefined) => void;
}

export function useProviderSettingsMutationModel(input: UseProviderSettingsMutationModelInput) {
    const mutations = useProviderSettingsMutations({
        profileId: input.profileId,
        selectedProviderId: input.selectedProviderId,
        setStatusMessage: input.setStatusMessage,
        setActiveAuthFlow: input.setActiveAuthFlow,
    });

    const feedback = buildProviderSettingsFeedback({
        statusMessage: input.statusMessage,
        mutationErrorSources: [
            mutations.setDefaultMutation,
            mutations.setModelFavoriteMutation,
            mutations.setApiKeyMutation,
            mutations.setConnectionProfileMutation,
            mutations.setExecutionPreferenceMutation,
            mutations.syncCatalogMutation,
            mutations.setModelRoutingPreferenceMutation,
            mutations.setOrganizationMutation,
            mutations.refreshAccountContextMutation,
            mutations.startAuthMutation,
            mutations.pollAuthMutation,
            mutations.cancelAuthMutation,
        ],
    });

    return {
        mutations,
        feedback,
    };
}
