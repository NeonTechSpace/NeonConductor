import {
    isWarmActiveProfilePayload,
    isWarmProfileListPayload,
    resolveWarmProfileId,
} from '@/web/components/runtime/profileWarmData';
import { prefetchSettingsData } from '@/web/components/settings/settingsPrefetch';

interface SettingsRoutePrefetchInput {
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
    trpcUtils: Parameters<typeof prefetchSettingsData>[0]['trpcUtils'];
}

export async function prefetchSettingsRouteData(input: SettingsRoutePrefetchInput): Promise<void> {
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

    prefetchSettingsData({
        profileId: resolvedProfileId,
        trpcUtils: input.trpcUtils,
    });
}
