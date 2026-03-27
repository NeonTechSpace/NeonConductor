import { buildRegistryReadModel } from '@/web/components/settings/registrySettings/registryReadModel';
import { useRegistryRefreshController } from '@/web/components/settings/registrySettings/useRegistryRefreshController';
import { useRegistryScopeSelectionState } from '@/web/components/settings/registrySettings/useRegistryScopeSelectionState';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

export function useRegistrySettingsController(profileId: string) {
    const workspaceRootsQuery = trpc.runtime.listWorkspaceRoots.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const workspaceRoots = workspaceRootsQuery.data?.workspaceRoots ?? [];
    const scopeSelection = useRegistryScopeSelectionState(workspaceRoots);
    const registryQuery = trpc.registry.listResolved.useQuery(
        {
            profileId,
            ...(scopeSelection.selectedWorkspaceFingerprint
                ? { workspaceFingerprint: scopeSelection.selectedWorkspaceFingerprint }
                : {}),
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const refreshController = useRegistryRefreshController(profileId);
    const readModel = buildRegistryReadModel({
        workspaceRoots,
        selectedWorkspaceFingerprint: scopeSelection.selectedWorkspaceFingerprint,
        registryData: registryQuery.data,
        deferredSkillQuery: scopeSelection.deferredSkillQuery,
    });

    return {
        ...scopeSelection,
        readModel,
        registryQuery,
        ...refreshController,
    };
}
