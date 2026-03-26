import { useState } from 'react';

import { BOOT_CRITICAL_QUERY_OPTIONS } from '@/web/components/runtime/startupQueryOptions';
import { resolveActiveWorkspaceProfileId } from '@/web/components/runtime/workspaceSurfaceModel';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';

export function createSelectProfileAction(input: {
    resolvedProfileId: string | undefined;
    mutateAsync: (value: { profileId: string }) => Promise<unknown>;
}) {
    return createFailClosedAsyncAction(async (profileId: string) => {
        if (!profileId || profileId === input.resolvedProfileId) {
            return;
        }

        await input.mutateAsync({
            profileId,
        });
    });
}

export function useWorkspaceProfileState(input: { setTopLevelTab: (value: TopLevelTab) => void }) {
    const [activeProfileId, setActiveProfileId] = useState<string | undefined>(undefined);
    const utils = trpc.useUtils();

    const profileListQuery = trpc.profile.list.useQuery(undefined, BOOT_CRITICAL_QUERY_OPTIONS);
    const activeProfileQuery = trpc.profile.getActive.useQuery(undefined, BOOT_CRITICAL_QUERY_OPTIONS);

    const profiles = profileListQuery.data?.profiles ?? [];
    const resolvedProfileId = resolveActiveWorkspaceProfileId({
        activeProfileId,
        serverActiveProfileId: activeProfileQuery.data?.activeProfileId,
        profiles,
    });

    const profileSetActiveMutation = trpc.profile.setActive.useMutation({
        onSuccess: (result) => {
            if (!result.updated) {
                return;
            }

            setActiveProfileId(result.profile.id);
            input.setTopLevelTab('chat');
            utils.profile.getActive.setData(undefined, {
                activeProfileId: result.profile.id,
                profile: result.profile,
            });
            utils.profile.list.setData(undefined, (current) => {
                if (!current) {
                    return current;
                }

                return {
                    profiles: current.profiles.map((profile) => ({
                        ...profile,
                        isActive: profile.id === result.profile.id,
                    })),
                };
            });
        },
    });
    const selectProfile = createSelectProfileAction({
        resolvedProfileId,
        mutateAsync: profileSetActiveMutation.mutateAsync,
    });

    return {
        profiles,
        resolvedProfileId,
        profilePending: profileListQuery.isPending || activeProfileQuery.isPending,
        profileErrorMessage: profileListQuery.error?.message ?? activeProfileQuery.error?.message,
        hasProfiles: profiles.length > 0,
        profileSetActiveMutation,
        setResolvedProfile: (profileId: string) => {
            setActiveProfileId(profileId);
            input.setTopLevelTab('chat');
        },
        selectProfile,
    };
}
