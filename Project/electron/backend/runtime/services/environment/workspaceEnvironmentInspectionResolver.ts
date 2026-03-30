import type {
    RuntimeInspectWorkspaceEnvironmentInput,
    WorkspaceEnvironmentOverrides,
    WorkspaceRootRecord,
} from '@/app/backend/runtime/contracts/types/runtime';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { getWorkspacePreference } from '@/app/backend/runtime/services/workspace/preferences';
import {
    normalizeWorkspacePath,
    toWorkspacePathKey,
} from '@/app/backend/runtime/services/environment/workspaceEnvironmentPathUtils';

export interface ResolvedWorkspaceEnvironmentInspectionTarget {
    workspaceRootPath: string;
    workspaceFingerprint?: string;
    overrides?: Partial<WorkspaceEnvironmentOverrides>;
}

export function findRegisteredWorkspaceFingerprintByPath(input: {
    absolutePath: string;
    workspaceRoots: WorkspaceRootRecord[];
}): string | undefined {
    const normalizedPath = toWorkspacePathKey(normalizeWorkspacePath(input.absolutePath));
    return input.workspaceRoots.find(
        (workspaceRoot) =>
            toWorkspacePathKey(normalizeWorkspacePath(workspaceRoot.absolutePath)) === normalizedPath
    )?.fingerprint;
}

function buildWorkspaceEnvironmentOverrides(input: {
    preferredVcs: WorkspaceEnvironmentOverrides['preferredVcs'] | undefined;
    preferredPackageManager: WorkspaceEnvironmentOverrides['preferredPackageManager'] | undefined;
}): Partial<WorkspaceEnvironmentOverrides> | undefined {
    const overrides: Partial<WorkspaceEnvironmentOverrides> = {
        ...(input.preferredVcs ? { preferredVcs: input.preferredVcs } : {}),
        ...(input.preferredPackageManager ? { preferredPackageManager: input.preferredPackageManager } : {}),
    };

    return Object.keys(overrides).length > 0 ? overrides : undefined;
}

export async function resolveWorkspaceEnvironmentInspectionTarget(input: {
    request: RuntimeInspectWorkspaceEnvironmentInput;
    workspaceRoots: WorkspaceRootRecord[];
}): Promise<OperationalResult<ResolvedWorkspaceEnvironmentInspectionTarget>> {
    const workspaceFingerprint =
        'workspaceFingerprint' in input.request
            ? input.request.workspaceFingerprint
            : findRegisteredWorkspaceFingerprintByPath({
                  absolutePath: input.request.absolutePath,
                  workspaceRoots: input.workspaceRoots,
              });
    const resolvedWorkspaceRoot = workspaceFingerprint
        ? input.workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === workspaceFingerprint)
        : undefined;

    if ('workspaceFingerprint' in input.request && !resolvedWorkspaceRoot) {
        return errOp('not_found', `Workspace "${input.request.workspaceFingerprint}" was not found.`);
    }

    const workspaceRootPath =
        resolvedWorkspaceRoot?.absolutePath ?? ('absolutePath' in input.request ? input.request.absolutePath : undefined);
    if (!workspaceRootPath) {
        return errOp('not_found', 'Workspace path could not be resolved for environment inspection.');
    }

    const workspacePreference = workspaceFingerprint
        ? await getWorkspacePreference(input.request.profileId, workspaceFingerprint)
        : undefined;
    const overrides = buildWorkspaceEnvironmentOverrides({
        preferredVcs: workspacePreference?.preferredVcs,
        preferredPackageManager: workspacePreference?.preferredPackageManager,
    });

    return okOp({
        workspaceRootPath,
        ...(workspaceFingerprint ? { workspaceFingerprint } : {}),
        ...(overrides ? { overrides } : {}),
    });
}
