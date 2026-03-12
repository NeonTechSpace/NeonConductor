import { describe, expect, it, vi } from 'vitest';

import { prefetchProviderSettingsData } from '@/web/components/settings/providerSettings/providerSettingsPrefetch';

describe('providerSettingsPrefetch', () => {
    it('warms provider-specific settings data for OpenAI without blocking render', async () => {
        const listModelsPrefetch = vi.fn().mockResolvedValue(undefined);
        const authStatePrefetch = vi.fn().mockResolvedValue(undefined);
        const connectionProfilePrefetch = vi.fn().mockResolvedValue(undefined);
        const usageSummaryPrefetch = vi.fn().mockResolvedValue(undefined);
        const kiloAccountContextPrefetch = vi.fn().mockResolvedValue(undefined);
        const openAiUsagePrefetch = vi.fn().mockResolvedValue(undefined);
        const openAiRateLimitsPrefetch = vi.fn().mockResolvedValue(undefined);

        prefetchProviderSettingsData({
            profileId: 'profile_default',
            providerId: 'openai',
            trpcUtils: {
                provider: {
                    listModels: { prefetch: listModelsPrefetch },
                    getAuthState: { prefetch: authStatePrefetch },
                    getConnectionProfile: { prefetch: connectionProfilePrefetch },
                    getUsageSummary: { prefetch: usageSummaryPrefetch },
                    getAccountContext: { prefetch: kiloAccountContextPrefetch },
                    getOpenAISubscriptionUsage: { prefetch: openAiUsagePrefetch },
                    getOpenAISubscriptionRateLimits: { prefetch: openAiRateLimitsPrefetch },
                },
            },
        });

        await Promise.resolve();

        expect(listModelsPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
        });
        expect(authStatePrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
        });
        expect(connectionProfilePrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'openai',
        });
        expect(usageSummaryPrefetch).toHaveBeenCalledOnce();
        expect(openAiUsagePrefetch).toHaveBeenCalledOnce();
        expect(openAiRateLimitsPrefetch).toHaveBeenCalledOnce();
        expect(kiloAccountContextPrefetch).not.toHaveBeenCalled();
    });
});
