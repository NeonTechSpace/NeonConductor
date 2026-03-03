export const firstPartyProviderIds = ['kilo', 'openai'] as const;

export type FirstPartyProviderId = (typeof firstPartyProviderIds)[number];

export function isSupportedProviderId(providerId: string): providerId is FirstPartyProviderId {
    return (firstPartyProviderIds as readonly string[]).includes(providerId);
}

export function assertSupportedProviderId(providerId: string): FirstPartyProviderId {
    if (!isSupportedProviderId(providerId)) {
        throw new Error(`Unsupported provider: "${providerId}".`);
    }

    return providerId;
}
