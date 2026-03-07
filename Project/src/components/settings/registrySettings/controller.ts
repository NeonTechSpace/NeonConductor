import { useEffect, useState } from 'react';

import { trpc } from '@/web/trpc/client';

export function useRegistrySettingsController(profileId: string) {
    const utils = trpc.useUtils();
    const [selectedWorkspaceFingerprint, setSelectedWorkspaceFingerprint] = useState<string | undefined>(undefined);
    const [skillQuery, setSkillQuery] = useState('');

    const workspaceRootsQuery = trpc.runtime.listWorkspaceRoots.useQuery(
        { profileId },
        { refetchOnWindowFocus: false }
    );
    const registryQuery = trpc.registry.listResolved.useQuery(
        {
            profileId,
            ...(selectedWorkspaceFingerprint ? { workspaceFingerprint: selectedWorkspaceFingerprint } : {}),
        },
        { refetchOnWindowFocus: false }
    );
    const skillSearchQuery = trpc.registry.searchSkills.useQuery(
        {
            profileId,
            query: skillQuery.trim(),
            ...(selectedWorkspaceFingerprint ? { workspaceFingerprint: selectedWorkspaceFingerprint } : {}),
        },
        {
            enabled: skillQuery.trim().length > 0,
            refetchOnWindowFocus: false,
        }
    );
    const refreshMutation = trpc.registry.refresh.useMutation({
        onSuccess: async () => {
            await Promise.all([
                utils.registry.listResolved.invalidate(),
                utils.registry.searchSkills.invalidate(),
                utils.mode.list.invalidate(),
                utils.mode.getActive.invalidate(),
                utils.runtime.getShellBootstrap.invalidate({ profileId }),
            ]);
        },
    });

    const workspaceRoots = workspaceRootsQuery.data?.workspaceRoots ?? [];
    useEffect(() => {
        if (!selectedWorkspaceFingerprint) {
            return;
        }

        if (workspaceRoots.some((workspaceRoot) => workspaceRoot.fingerprint === selectedWorkspaceFingerprint)) {
            return;
        }

        setSelectedWorkspaceFingerprint(undefined);
    }, [selectedWorkspaceFingerprint, workspaceRoots]);

    const resolvedAgentModes =
        registryQuery.data?.resolved.modes.filter((mode) => mode.topLevelTab === 'agent') ?? [];
    const selectedWorkspaceRoot = selectedWorkspaceFingerprint
        ? workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === selectedWorkspaceFingerprint)
        : undefined;
    const skillMatches = skillSearchQuery.data?.skillfiles ?? [];

    return {
        selectedWorkspaceFingerprint,
        setSelectedWorkspaceFingerprint,
        skillQuery,
        setSkillQuery,
        workspaceRoots,
        registryQuery,
        skillSearchQuery,
        refreshMutation,
        resolvedAgentModes,
        selectedWorkspaceRoot,
        skillMatches,
    };
}
