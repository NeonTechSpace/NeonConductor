interface SettingsPrefetchInput {
    profileId: string;
    trpcUtils: {
        provider: {
            listProviders: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
            getDefaults: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
            listModels: {
                prefetch: (input: { profileId: string; providerId: 'kilo' }) => Promise<void>;
            };
            getAuthState: {
                prefetch: (input: { profileId: string; providerId: 'kilo' }) => Promise<void>;
            };
            getAccountContext: {
                prefetch: (input: { profileId: string; providerId: 'kilo' }) => Promise<void>;
            };
        };
        profile: {
            list: {
                prefetch: (input: undefined) => Promise<void>;
            };
        };
        context: {
            getGlobalSettings: {
                prefetch: (input: undefined) => Promise<void>;
            };
            getProfileSettings: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
        };
        composer: {
            getSettings: {
                prefetch: (input: undefined) => Promise<void>;
            };
        };
        runtime: {
            listWorkspaceRoots: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
        };
        registry: {
            listResolved: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
        };
    };
}

export function prefetchSettingsData(input: SettingsPrefetchInput): void {
    void Promise.all([
        input.trpcUtils.provider.listProviders.prefetch({ profileId: input.profileId }),
        input.trpcUtils.provider.getDefaults.prefetch({ profileId: input.profileId }),
        input.trpcUtils.provider.listModels.prefetch({ profileId: input.profileId, providerId: 'kilo' }),
        input.trpcUtils.provider.getAuthState.prefetch({ profileId: input.profileId, providerId: 'kilo' }),
        input.trpcUtils.provider.getAccountContext.prefetch({ profileId: input.profileId, providerId: 'kilo' }),
        input.trpcUtils.profile.list.prefetch(undefined),
        input.trpcUtils.context.getGlobalSettings.prefetch(undefined),
        input.trpcUtils.context.getProfileSettings.prefetch({ profileId: input.profileId }),
        input.trpcUtils.composer.getSettings.prefetch(undefined),
        input.trpcUtils.runtime.listWorkspaceRoots.prefetch({ profileId: input.profileId }),
        input.trpcUtils.registry.listResolved.prefetch({ profileId: input.profileId }),
    ]);
}
