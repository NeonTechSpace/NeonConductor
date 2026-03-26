import { trpc } from '@/web/trpc/client';

import type { RegistryRefreshResult } from '@/shared/contracts';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;

export function patchRegistryRefreshCaches(input: {
    utils: TrpcUtils;
    profileId: string;
    workspaceFingerprint?: string;
    refreshResult: RegistryRefreshResult;
}) {
    const modeQueryInput = {
        profileId: input.profileId,
        topLevelTab: 'agent' as const,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    };
    const registryQueryInput = {
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    };

    input.utils.registry.listResolved.setData(registryQueryInput, input.refreshResult.resolvedRegistry);
    input.utils.mode.list.setData(modeQueryInput, {
        modes: input.refreshResult.agentModes,
    });
    input.utils.mode.getActive.setData(modeQueryInput, {
        activeMode: input.refreshResult.activeAgentMode,
        modes: input.refreshResult.agentModes,
    });
}
