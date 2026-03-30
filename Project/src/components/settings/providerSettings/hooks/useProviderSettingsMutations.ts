import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';
import { useProviderSettingsMutationCoordinator } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsMutationCoordinator';

import type { RuntimeProviderId } from '@/shared/contracts';

interface UseProviderSettingsMutationsInput {
    profileId: string;
    selectedProviderId: RuntimeProviderId | undefined;
    setStatusMessage: (value: string | undefined) => void;
    setActiveAuthFlow: (value: ActiveAuthFlow | undefined) => void;
}

export function useProviderSettingsMutations(input: UseProviderSettingsMutationsInput) {
    return useProviderSettingsMutationCoordinator(input);
}
