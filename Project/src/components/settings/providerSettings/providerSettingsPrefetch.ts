import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderSettingsPrefetchInput {
    profileId: string;
    providerId: RuntimeProviderId;
    trpcUtils: {
        provider: {
            listModels: {
                prefetch: (input: { profileId: string; providerId: RuntimeProviderId }) => Promise<void>;
            };
            getAuthState: {
                prefetch: (input: { profileId: string; providerId: RuntimeProviderId }) => Promise<void>;
            };
            getConnectionProfile: {
                prefetch: (input: { profileId: string; providerId: RuntimeProviderId }) => Promise<void>;
            };
            getUsageSummary: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
            getAccountContext: {
                prefetch: (input: { profileId: string; providerId: 'kilo' }) => Promise<void>;
            };
            getOpenAISubscriptionUsage: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
            getOpenAISubscriptionRateLimits: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
        };
    };
}

export function prefetchProviderSettingsData(input: ProviderSettingsPrefetchInput): void {
    const tasks: Array<Promise<void>> = [
        input.trpcUtils.provider.listModels.prefetch({
            profileId: input.profileId,
            providerId: input.providerId,
        }),
        input.trpcUtils.provider.getAuthState.prefetch({
            profileId: input.profileId,
            providerId: input.providerId,
        }),
        input.trpcUtils.provider.getConnectionProfile.prefetch({
            profileId: input.profileId,
            providerId: input.providerId,
        }),
        input.trpcUtils.provider.getUsageSummary.prefetch({
            profileId: input.profileId,
        }),
    ];

    if (input.providerId === 'kilo') {
        tasks.push(
            input.trpcUtils.provider.getAccountContext.prefetch({
                profileId: input.profileId,
                providerId: 'kilo',
            })
        );
    }

    if (input.providerId === 'openai') {
        tasks.push(
            input.trpcUtils.provider.getOpenAISubscriptionUsage.prefetch({
                profileId: input.profileId,
            })
        );
        tasks.push(
            input.trpcUtils.provider.getOpenAISubscriptionRateLimits.prefetch({
                profileId: input.profileId,
            })
        );
    }

    void Promise.all(tasks);
}

