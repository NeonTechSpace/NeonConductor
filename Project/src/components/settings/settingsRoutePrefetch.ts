import { BOOT_CRITICAL_QUERY_OPTIONS } from '@/web/components/runtime/startupQueryOptions';
import { resolveActiveWorkspaceProfileId } from '@/web/components/runtime/workspaceSurfaceModel';
import { prefetchSettingsData } from '@/web/components/settings/settingsPrefetch';

interface SettingsRoutePrefetchInput {
    trpcUtils: Parameters<typeof prefetchSettingsData>[0]['trpcUtils'] & {
        profile: Parameters<typeof prefetchSettingsData>[0]['trpcUtils']['profile'] & {
            list: Parameters<typeof prefetchSettingsData>[0]['trpcUtils']['profile']['list'] & {
                ensureData: (
                    input: undefined,
                    options: typeof BOOT_CRITICAL_QUERY_OPTIONS
                ) => Promise<{ profiles: Array<{ id: string; isActive: boolean }> }>;
            };
            getActive: {
                ensureData: (
                    input: undefined,
                    options: typeof BOOT_CRITICAL_QUERY_OPTIONS
                ) => Promise<{ activeProfileId: string | undefined }>;
            };
        };
    };
}

export async function prefetchSettingsRouteData(input: SettingsRoutePrefetchInput): Promise<void> {
    const [profileList, activeProfile] = await Promise.all([
        input.trpcUtils.profile.list.ensureData(undefined, BOOT_CRITICAL_QUERY_OPTIONS),
        input.trpcUtils.profile.getActive.ensureData(undefined, BOOT_CRITICAL_QUERY_OPTIONS),
    ]);

    const resolvedProfileId = resolveActiveWorkspaceProfileId({
        activeProfileId: undefined,
        serverActiveProfileId: activeProfile.activeProfileId,
        profiles: profileList.profiles,
    });
    if (!resolvedProfileId) {
        return;
    }

    prefetchSettingsData({
        profileId: resolvedProfileId,
        trpcUtils: input.trpcUtils,
    });
}
