import type { ActiveAuthFlow } from '@/web/components/settings/providerSettings/types';

import type { RuntimeProviderId } from '@/shared/contracts';

export function resetProviderSettingsState(input: {
    setActiveAuthFlow: (value: ActiveAuthFlow | undefined) => void;
    setStatusMessage: (value: string | undefined) => void;
}): void {
    input.setActiveAuthFlow(undefined);
    input.setStatusMessage(undefined);
}

export function selectProviderWithReset(input: {
    providerId: RuntimeProviderId;
    setSelectedProviderId: (value: RuntimeProviderId) => void;
    setStatusMessage: (value: string | undefined) => void;
}): void {
    input.setStatusMessage(undefined);
    input.setSelectedProviderId(input.providerId);
}

export function resolvePinnedProviderId(input: {
    pinnedProviderId?: string;
    availableProviderIds: string[];
}): string | undefined {
    return input.pinnedProviderId?.trim() || input.availableProviderIds[0];
}

