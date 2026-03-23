import {
    isWarmActiveProfilePayload,
    isWarmProfileListPayload,
    resolveWarmProfileId,
} from '@/web/components/runtime/profileWarmData';

interface WorkspaceBootLoaderInput {
    trpcClient: {
        profile: {
            list: {
                query: () => Promise<{ profiles: Array<{ id: string; isActive: boolean }> }>;
            };
            getActive: {
                query: () => Promise<{ activeProfileId: string | undefined }>;
            };
        };
    };
    trpcUtils: {
        mode: {
            list: {
                prefetch: (input: { profileId: string; topLevelTab: 'chat' }) => Promise<void>;
            };
            getActive: {
                prefetch: (input: { profileId: string; topLevelTab: 'chat' }) => Promise<void>;
            };
        };
        runtime: {
            getShellBootstrap: {
                prefetch: (input: { profileId: string }) => Promise<void>;
            };
        };
    };
}

let workspaceBootPrefetchPromise: Promise<void> | null = null;

export async function prefetchWorkspaceBootData(input: WorkspaceBootLoaderInput): Promise<void> {
    const [profileListResult, activeProfileResult] = await Promise.allSettled([
        input.trpcClient.profile.list.query(),
        input.trpcClient.profile.getActive.query(),
    ]);

    if (profileListResult.status !== 'fulfilled' || activeProfileResult.status !== 'fulfilled') {
        return;
    }

    if (!isWarmProfileListPayload(profileListResult.value) || !isWarmActiveProfilePayload(activeProfileResult.value)) {
        return;
    }

    const resolvedProfileId = resolveWarmProfileId({
        profileListPayload: profileListResult.value,
        activeProfilePayload: activeProfileResult.value,
    });
    if (!resolvedProfileId) {
        return;
    }

    await Promise.all([
        input.trpcUtils.mode.list.prefetch({
            profileId: resolvedProfileId,
            topLevelTab: 'chat',
        }),
        input.trpcUtils.mode.getActive.prefetch({
            profileId: resolvedProfileId,
            topLevelTab: 'chat',
        }),
        input.trpcUtils.runtime.getShellBootstrap.prefetch({
            profileId: resolvedProfileId,
        }),
    ]);
}

export function startWorkspaceBootPrefetch(input: WorkspaceBootLoaderInput): Promise<void> {
    if (workspaceBootPrefetchPromise) {
        return workspaceBootPrefetchPromise;
    }

    workspaceBootPrefetchPromise = prefetchWorkspaceBootData(input).catch((error: unknown) => {
        workspaceBootPrefetchPromise = null;
        throw error;
    });

    return workspaceBootPrefetchPromise;
}

export function resetWorkspaceBootPrefetchForTests(): void {
    workspaceBootPrefetchPromise = null;
}
