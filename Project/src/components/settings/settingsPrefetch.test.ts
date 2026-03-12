import { describe, expect, it, vi } from 'vitest';

import { prefetchSettingsData } from '@/web/components/settings/settingsPrefetch';

describe('settingsPrefetch', () => {
    it('warms the default settings surfaces without blocking on the result', async () => {
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

        prefetchSettingsData({
            profileId: 'profile_default',
            trpcUtils: {
                provider: {
                    listProviders: {
                        prefetch: listProvidersPrefetch,
                    },
                    getDefaults: {
                        prefetch: defaultsPrefetch,
                    },
                    listModels: {
                        prefetch: listModelsPrefetch,
                    },
                    getAuthState: {
                        prefetch: authStatePrefetch,
                    },
                    getAccountContext: {
                        prefetch: accountContextPrefetch,
                    },
                },
                profile: {
                    list: {
                        prefetch: profileListPrefetch,
                    },
                },
                context: {
                    getGlobalSettings: {
                        prefetch: globalSettingsPrefetch,
                    },
                    getProfileSettings: {
                        prefetch: profileSettingsPrefetch,
                    },
                },
                composer: {
                    getSettings: {
                        prefetch: composerSettingsPrefetch,
                    },
                },
                runtime: {
                    listWorkspaceRoots: {
                        prefetch: listWorkspaceRootsPrefetch,
                    },
                },
                registry: {
                    listResolved: {
                        prefetch: registryPrefetch,
                    },
                },
            },
        });

        await Promise.resolve();

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
        expect(profileListPrefetch).toHaveBeenCalledOnce();
        expect(globalSettingsPrefetch).toHaveBeenCalledOnce();
        expect(profileSettingsPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(composerSettingsPrefetch).toHaveBeenCalledOnce();
        expect(listWorkspaceRootsPrefetch).toHaveBeenCalledOnce();
        expect(registryPrefetch).toHaveBeenCalledOnce();
    });
});
