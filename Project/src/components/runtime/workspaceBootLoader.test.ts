import { describe, expect, it, vi } from 'vitest';

import {
    prefetchWorkspaceBootData,
    resetWorkspaceBootPrefetchForTests,
    startWorkspaceBootPrefetch,
} from '@/web/components/runtime/workspaceBootLoader';

describe('workspaceBootLoader', () => {
    it('starts boot prefetch only once while an app boot prefetch is already in flight', async () => {
        resetWorkspaceBootPrefetchForTests();

        let resolveProfileList: ((value: { profiles: Array<{ id: string; isActive: boolean }> }) => void) | undefined;
        const profileListFetch = vi.fn().mockImplementation(
            () =>
                new Promise<{ profiles: Array<{ id: string; isActive: boolean }> }>((resolve) => {
                    resolveProfileList = resolve;
                })
        );
        const activeProfileFetch = vi.fn().mockResolvedValue({
            activeProfileId: 'profile_default',
        });
        const modeListPrefetch = vi.fn().mockResolvedValue(undefined);
        const modeActivePrefetch = vi.fn().mockResolvedValue(undefined);
        const shellBootstrapPrefetch = vi.fn().mockResolvedValue(undefined);

        const firstPrefetchPromise = startWorkspaceBootPrefetch({
            trpcClient: {
                profile: {
                    list: {
                        query: profileListFetch,
                    },
                    getActive: {
                        query: activeProfileFetch,
                    },
                },
            },
            trpcUtils: {
                mode: {
                    list: {
                        prefetch: modeListPrefetch,
                    },
                    getActive: {
                        prefetch: modeActivePrefetch,
                    },
                },
                runtime: {
                    getShellBootstrap: {
                        prefetch: shellBootstrapPrefetch,
                    },
                },
            },
        });
        const secondPrefetchPromise = startWorkspaceBootPrefetch({
            trpcClient: {
                profile: {
                    list: {
                        query: profileListFetch,
                    },
                    getActive: {
                        query: activeProfileFetch,
                    },
                },
            },
            trpcUtils: {
                mode: {
                    list: {
                        prefetch: modeListPrefetch,
                    },
                    getActive: {
                        prefetch: modeActivePrefetch,
                    },
                },
                runtime: {
                    getShellBootstrap: {
                        prefetch: shellBootstrapPrefetch,
                    },
                },
            },
        });

        expect(firstPrefetchPromise).toBe(secondPrefetchPromise);
        expect(profileListFetch).toHaveBeenCalledTimes(1);
        expect(activeProfileFetch).toHaveBeenCalledTimes(1);

        resolveProfileList?.({
            profiles: [
                {
                    id: 'profile_default',
                    isActive: true,
                },
            ],
        });
        await Promise.all([firstPrefetchPromise, secondPrefetchPromise]);
        expect(modeListPrefetch).toHaveBeenCalledTimes(1);
        expect(modeActivePrefetch).toHaveBeenCalledTimes(1);
        expect(shellBootstrapPrefetch).toHaveBeenCalledTimes(1);
    });

    it('prefetches chat boot data for the resolved active profile', async () => {
        resetWorkspaceBootPrefetchForTests();

        const profileListFetch = vi.fn().mockResolvedValue({
            profiles: [
                {
                    id: 'profile_default',
                    isActive: true,
                },
            ],
        });
        const activeProfileFetch = vi.fn().mockResolvedValue({
            activeProfileId: 'profile_default',
        });
        const modeListPrefetch = vi.fn().mockResolvedValue(undefined);
        const modeActivePrefetch = vi.fn().mockResolvedValue(undefined);
        const shellBootstrapPrefetch = vi.fn().mockResolvedValue(undefined);

        await prefetchWorkspaceBootData({
            trpcClient: {
                profile: {
                    list: {
                        query: profileListFetch,
                    },
                    getActive: {
                        query: activeProfileFetch,
                    },
                },
            },
            trpcUtils: {
                mode: {
                    list: {
                        prefetch: modeListPrefetch,
                    },
                    getActive: {
                        prefetch: modeActivePrefetch,
                    },
                },
                runtime: {
                    getShellBootstrap: {
                        prefetch: shellBootstrapPrefetch,
                    },
                },
            },
        });

        expect(profileListFetch).toHaveBeenCalledOnce();
        expect(activeProfileFetch).toHaveBeenCalledOnce();
        expect(modeListPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            topLevelTab: 'chat',
        });
        expect(modeActivePrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
            topLevelTab: 'chat',
        });
        expect(shellBootstrapPrefetch).toHaveBeenCalledWith({
            profileId: 'profile_default',
        });
    });

    it('stops after ensuring profile state when no profile can be resolved', async () => {
        resetWorkspaceBootPrefetchForTests();

        const modeListPrefetch = vi.fn().mockResolvedValue(undefined);
        const modeActivePrefetch = vi.fn().mockResolvedValue(undefined);
        const shellBootstrapPrefetch = vi.fn().mockResolvedValue(undefined);

        await prefetchWorkspaceBootData({
            trpcClient: {
                profile: {
                    list: {
                        query: vi.fn().mockResolvedValue({
                            profiles: [],
                        }),
                    },
                    getActive: {
                        query: vi.fn().mockResolvedValue({
                            activeProfileId: undefined,
                        }),
                    },
                },
            },
            trpcUtils: {
                mode: {
                    list: {
                        prefetch: modeListPrefetch,
                    },
                    getActive: {
                        prefetch: modeActivePrefetch,
                    },
                },
                runtime: {
                    getShellBootstrap: {
                        prefetch: shellBootstrapPrefetch,
                    },
                },
            },
        });

        expect(modeListPrefetch).not.toHaveBeenCalled();
        expect(modeActivePrefetch).not.toHaveBeenCalled();
        expect(shellBootstrapPrefetch).not.toHaveBeenCalled();
    });

    it('returns without throwing when warm profile queries reject', async () => {
        resetWorkspaceBootPrefetchForTests();

        const modeListPrefetch = vi.fn().mockResolvedValue(undefined);
        const modeActivePrefetch = vi.fn().mockResolvedValue(undefined);
        const shellBootstrapPrefetch = vi.fn().mockResolvedValue(undefined);

        await expect(
            prefetchWorkspaceBootData({
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
                    mode: {
                        list: {
                            prefetch: modeListPrefetch,
                        },
                        getActive: {
                            prefetch: modeActivePrefetch,
                        },
                    },
                    runtime: {
                        getShellBootstrap: {
                            prefetch: shellBootstrapPrefetch,
                        },
                    },
                },
            })
        ).resolves.toBeUndefined();

        expect(modeListPrefetch).not.toHaveBeenCalled();
        expect(modeActivePrefetch).not.toHaveBeenCalled();
        expect(shellBootstrapPrefetch).not.toHaveBeenCalled();
    });

    it('does not reject the shared boot prefetch promise when warmup work fails', async () => {
        resetWorkspaceBootPrefetchForTests();

        const bootPrefetchPromise = startWorkspaceBootPrefetch({
            trpcClient: {
                profile: {
                    list: {
                        query: vi.fn().mockResolvedValue({
                            profiles: [
                                {
                                    id: 'profile_default',
                                    isActive: true,
                                },
                            ],
                        }),
                    },
                    getActive: {
                        query: vi.fn().mockResolvedValue({
                            activeProfileId: 'profile_default',
                        }),
                    },
                },
            },
            trpcUtils: {
                mode: {
                    list: {
                        prefetch: vi.fn().mockRejectedValue(new Error('prefetch failed')),
                    },
                    getActive: {
                        prefetch: vi.fn().mockResolvedValue(undefined),
                    },
                },
                runtime: {
                    getShellBootstrap: {
                        prefetch: vi.fn().mockResolvedValue(undefined),
                    },
                },
            },
        });

        await expect(bootPrefetchPromise).resolves.toBeUndefined();
    });

    it('returns without throwing when warm profile payloads are invalid', async () => {
        resetWorkspaceBootPrefetchForTests();

        const modeListPrefetch = vi.fn().mockResolvedValue(undefined);
        const modeActivePrefetch = vi.fn().mockResolvedValue(undefined);
        const shellBootstrapPrefetch = vi.fn().mockResolvedValue(undefined);

        await expect(
            prefetchWorkspaceBootData({
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
                    mode: {
                        list: {
                            prefetch: modeListPrefetch,
                        },
                        getActive: {
                            prefetch: modeActivePrefetch,
                        },
                    },
                    runtime: {
                        getShellBootstrap: {
                            prefetch: shellBootstrapPrefetch,
                        },
                    },
                },
            })
        ).resolves.toBeUndefined();

        expect(modeListPrefetch).not.toHaveBeenCalled();
        expect(modeActivePrefetch).not.toHaveBeenCalled();
        expect(shellBootstrapPrefetch).not.toHaveBeenCalled();
    });
});
