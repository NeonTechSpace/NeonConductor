import { describe, expect, it, vi } from 'vitest';

import { prefetchSettingsRouteData } from '@/web/components/settings/settingsRoutePrefetch';

describe('settingsRoutePrefetch', () => {
    it('resolves the active profile first, then warms the default settings surfaces', async () => {
        const fetchProfileList = vi.fn().mockResolvedValue({
            profiles: [{ id: 'profile_default', isActive: true }],
        });
        const fetchActiveProfile = vi.fn().mockResolvedValue({
            activeProfileId: 'profile_default',
        });
        const listProvidersPrefetch = vi.fn().mockResolvedValue(undefined);
        const defaultsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listModelsPrefetch = vi.fn().mockResolvedValue(undefined);
        const authStatePrefetch = vi.fn().mockResolvedValue(undefined);
        const accountContextPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileListPrefetch = vi.fn().mockResolvedValue(undefined);
        const promptSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const globalSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const composerSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listWorkspaceRootsPrefetch = vi.fn().mockResolvedValue(undefined);
        const registryPrefetch = vi.fn().mockResolvedValue(undefined);

        await prefetchSettingsRouteData({
            trpcClient: {
                profile: {
                    list: { query: fetchProfileList },
                    getActive: { query: fetchActiveProfile },
                },
            },
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
                        prefetch: profileListPrefetch,
                    },
                },
                prompt: {
                    getSettings: { prefetch: promptSettingsPrefetch },
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

        expect(fetchProfileList).toHaveBeenCalledOnce();
        expect(fetchActiveProfile).toHaveBeenCalledOnce();
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
        expect(promptSettingsPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
        expect(profileSettingsPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
    });

    it('returns without throwing when the warm profile queries reject', async () => {
        const listProvidersPrefetch = vi.fn().mockResolvedValue(undefined);
        const defaultsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listModelsPrefetch = vi.fn().mockResolvedValue(undefined);
        const authStatePrefetch = vi.fn().mockResolvedValue(undefined);
        const accountContextPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileListPrefetch = vi.fn().mockResolvedValue(undefined);
        const promptSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const globalSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const composerSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listWorkspaceRootsPrefetch = vi.fn().mockResolvedValue(undefined);
        const registryPrefetch = vi.fn().mockResolvedValue(undefined);

        await expect(
            prefetchSettingsRouteData({
                trpcClient: {
                    profile: {
                        list: {
                            query: vi.fn().mockRejectedValue(new Error('profile list failed')),
                        },
                        getActive: {
                            query: vi.fn().mockResolvedValue({
                                activeProfileId: 'profile_default',
                            }),
                        },
                    },
                },
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
                            prefetch: profileListPrefetch,
                        },
                    },
                    prompt: {
                        getSettings: { prefetch: promptSettingsPrefetch },
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
            })
        ).resolves.toBeUndefined();

        expect(listProvidersPrefetch).not.toHaveBeenCalled();
        expect(defaultsPrefetch).not.toHaveBeenCalled();
        expect(promptSettingsPrefetch).not.toHaveBeenCalled();
    });

    it('returns without throwing when the warm profile payloads are invalid', async () => {
        const listProvidersPrefetch = vi.fn().mockResolvedValue(undefined);
        const defaultsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listModelsPrefetch = vi.fn().mockResolvedValue(undefined);
        const authStatePrefetch = vi.fn().mockResolvedValue(undefined);
        const accountContextPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileListPrefetch = vi.fn().mockResolvedValue(undefined);
        const promptSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const globalSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const profileSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const composerSettingsPrefetch = vi.fn().mockResolvedValue(undefined);
        const listWorkspaceRootsPrefetch = vi.fn().mockResolvedValue(undefined);
        const registryPrefetch = vi.fn().mockResolvedValue(undefined);

        await expect(
            prefetchSettingsRouteData({
                trpcClient: {
                    profile: {
                        list: {
                            query: vi.fn().mockResolvedValue(undefined),
                        },
                        getActive: {
                            query: vi.fn().mockResolvedValue({
                                activeProfileId: 'profile_default',
                            }),
                        },
                    },
                },
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
                            prefetch: profileListPrefetch,
                        },
                    },
                    prompt: {
                        getSettings: { prefetch: promptSettingsPrefetch },
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
            })
        ).resolves.toBeUndefined();

        expect(listProvidersPrefetch).not.toHaveBeenCalled();
        expect(defaultsPrefetch).not.toHaveBeenCalled();
        expect(promptSettingsPrefetch).not.toHaveBeenCalled();
    });
});
