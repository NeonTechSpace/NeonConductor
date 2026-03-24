import type { RuntimeProviderId } from '@/shared/contracts';

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

