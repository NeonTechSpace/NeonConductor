import { describe, expect, it, vi } from 'vitest';

import { prefetchSettingsRouteData } from '@/web/components/settings/settingsRoutePrefetch';

describe('settingsRoutePrefetch', () => {
    it('resolves the active profile first, then warms the default settings surfaces', async () => {
        const ensureProfileList = vi.fn().mockResolvedValue({
            profiles: [{ id: 'profile_default', isActive: true }],
        });
        const ensureActiveProfile = vi.fn().mockResolvedValue({
            activeProfileId: 'profile_default',
        });
        const listProvidersPrefetch = vi.fn().mockResolvedValue(undefined);
        const defaultsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listModelsPrefetch = vi.fn().mockResolvedValue(undefined);
        const authStatePrefetch = vi.fn().mockResolvedValue(undefined);
        const accountContextPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileListPrefetch = vi.fn().mockResolvedValue(undefined);
        const globalSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const composerSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listWorkspaceRootsPrefetch = vi.fn().mockResolvedValue(undefined);
        const registryPrefetch = vi.fn().mockResolvedValue(undefined);

        await prefetchSettingsRouteData({
            trpcUtils: {
                provider: {
                    listProviders: { prefetch: listProvidersPrefetch },
                    getDefaults: { prefetch: defaultsPrefetch },
                    listModels: { prefetch: listModelsPrefetch },
                    getAuthState: { prefetch: authStatePrefetch },
                    getAccountContext: { prefetch: accountContextPrefetch },
                },
                profile: {
                    list: {
                        ensureData: ensureProfileList,
                        prefetch: profileListPrefetch,
                    },
                    getActive: {
                        ensureData: ensureActiveProfile,
                    },
                },
                context: {
                    getGlobalSettings: { prefetch: globalSettingsPrefetch },
                    getProfileSettings: { prefetch: profileSettingsPrefetch },
                },
                composer: {
                    getSettings: { prefetch: composerSettingsPrefetch },
                },
                runtime: {
                    listWorkspaceRoots: { prefetch: listWorkspaceRootsPrefetch },
                },
                registry: {
                    listResolved: { prefetch: registryPrefetch },
                },
            },
        });

        expect(ensureProfileList).toHaveBeenCalledOnce();
        expect(ensureActiveProfile).toHaveBeenCalledOnce();
        expect(listProvidersPrefetch).toHaveBeenCalledOnce();
        expect(defaultsPrefetch).toHaveBeenCalledOnce();
        expect(listModelsPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
        });
        expect(authStatePrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
        });
        expect(accountContextPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            providerId: 'kilo',
        });
        expect(profileSettingsPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
    });
});
