import { trpc } from '@/web/trpc/client';

import type { WorkspacePreferenceRecord, WorkspaceRootRecord } from '@/shared/contracts';

type TrpcUtils = ReturnType<typeof trpc.useUtils>;
type ShellBootstrapData = Awaited<ReturnType<TrpcUtils['runtime']['getShellBootstrap']['fetch']>>;

export interface WorkspaceSurfaceCacheProjectionInput {
    utils: TrpcUtils;
    profileId: string;
}

export function patchWorkspaceRootCaches(
    input: WorkspaceSurfaceCacheProjectionInput & { workspaceRoot: WorkspaceRootRecord }
): void {
    input.utils.runtime.listWorkspaceRoots.setData({ profileId: input.profileId }, (current) => ({
        workspaceRoots: current
            ? [
                  input.workspaceRoot,
                  ...current.workspaceRoots.filter(
                      (workspaceRoot) => workspaceRoot.fingerprint !== input.workspaceRoot.fingerprint
                  ),
              ]
            : [input.workspaceRoot],
    }));

    input.utils.runtime.getShellBootstrap.setData(
        { profileId: input.profileId },
        (current: ShellBootstrapData | undefined) =>
            current
                ? {
                      ...current,
                      workspaceRoots: [
                          input.workspaceRoot,
                          ...current.workspaceRoots.filter(
                              (workspaceRoot) => workspaceRoot.fingerprint !== input.workspaceRoot.fingerprint
                          ),
                      ],
                  }
                : current
    );
}

export function patchWorkspacePreferenceCache(
    input: WorkspaceSurfaceCacheProjectionInput & { workspacePreference: WorkspacePreferenceRecord }
): void {
    input.utils.runtime.getShellBootstrap.setData(
        { profileId: input.profileId },
        (current: ShellBootstrapData | undefined) =>
            current
                ? {
                      ...current,
                      workspacePreferences: [
                          input.workspacePreference,
                          ...current.workspacePreferences.filter(
                              (record) => record.workspaceFingerprint !== input.workspacePreference.workspaceFingerprint
                          ),
                      ],
                  }
                : current
    );
}
