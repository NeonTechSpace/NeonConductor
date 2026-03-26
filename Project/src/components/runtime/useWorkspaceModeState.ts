import { skipToken } from '@tanstack/react-query';

import { BOOT_CRITICAL_QUERY_OPTIONS } from '@/web/components/runtime/startupQueryOptions';
import { resolveWorkspaceActiveModeKey } from '@/web/components/runtime/workspaceSurfaceModel';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import { trpc } from '@/web/trpc/client';

import type { TopLevelTab } from '@/shared/contracts';

export function buildWorkspaceModeQueryInput(input: {
    resolvedProfileId: string | undefined;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
}) {
    return input.resolvedProfileId
        ? {
              profileId: input.resolvedProfileId,
              topLevelTab: input.topLevelTab,
              ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
          }
        : skipToken;
}

export function createSelectModeAction(input: {
    resolvedProfileId: string | undefined;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
    isPending: boolean;
    mutateAsync: (value: {
        profileId: string;
        topLevelTab: TopLevelTab;
        modeKey: string;
        workspaceFingerprint?: string;
    }) => Promise<unknown>;
}) {
    return createFailClosedAsyncAction(async (modeKey: string) => {
        if (!modeKey || input.isPending || !input.resolvedProfileId) {
            return;
        }

        await input.mutateAsync({
            profileId: input.resolvedProfileId,
            topLevelTab: input.topLevelTab,
            modeKey,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
    });
}

export function useWorkspaceModeState(input: {
    resolvedProfileId: string | undefined;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
}) {
    const utils = trpc.useUtils();
    const modeQueryInput = buildWorkspaceModeQueryInput(input);
    const modeListQuery = trpc.mode.list.useQuery(modeQueryInput, BOOT_CRITICAL_QUERY_OPTIONS);
    const modeActiveQuery = trpc.mode.getActive.useQuery(modeQueryInput, BOOT_CRITICAL_QUERY_OPTIONS);
    const setActiveModeMutation = trpc.mode.setActive.useMutation({
        onSuccess: (result) => {
            if (!result.updated || modeQueryInput === skipToken) {
                return;
            }

            utils.mode.getActive.setData(modeQueryInput, (current) => ({
                activeMode: result.mode,
                modes: current?.modes ?? modeListQuery.data?.modes ?? [result.mode],
            }));
            utils.mode.list.setData(modeQueryInput, (current) => ({
                modes: current?.modes ?? modeActiveQuery.data?.modes ?? [result.mode],
            }));
        },
    });
    const selectMode = createSelectModeAction({
        resolvedProfileId: input.resolvedProfileId,
        topLevelTab: input.topLevelTab,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        isPending: setActiveModeMutation.isPending,
        mutateAsync: setActiveModeMutation.mutateAsync,
    });

    return {
        modes: modeActiveQuery.data?.modes ?? modeListQuery.data?.modes ?? [],
        activeModeKey: resolveWorkspaceActiveModeKey(input.topLevelTab, modeActiveQuery.data?.activeMode.modeKey),
        hasResolvedInitialMode:
            Boolean(input.resolvedProfileId) && (!modeActiveQuery.isPending || !modeListQuery.isPending),
        modePending: Boolean(input.resolvedProfileId) && (modeActiveQuery.isPending || modeListQuery.isPending),
        modeErrorMessage: modeActiveQuery.error?.message ?? modeListQuery.error?.message,
        setActiveModeMutation,
        selectMode,
    };
}
