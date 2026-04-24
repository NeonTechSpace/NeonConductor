import { workspaceEnvironmentService } from '@/app/backend/runtime/services/environment/service';
import { vendoredRipgrepResolver } from '@/app/backend/runtime/services/environment/vendoredRipgrepResolver';
import { resolveSupportedPlatform } from '@/app/backend/runtime/services/environment/workspaceCommandAvailabilityService';
import { workspaceShellResolver } from '@/app/backend/runtime/services/environment/workspaceShellResolver';
import type { RuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/types';
import { getWorkspacePreference } from '@/app/backend/runtime/services/workspace/preferences';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

import type { ResolvedWorkspaceContext, TopLevelTab } from '@/shared/contracts';

export async function resolveRuntimeToolGuidanceContext(input: {
    profileId: string;
    sessionId: `sess_${string}`;
    topLevelTab: TopLevelTab;
    workspaceFingerprint?: string;
    workspaceContext?: ResolvedWorkspaceContext;
}): Promise<RuntimeToolGuidanceContext> {
    const platform = resolveSupportedPlatform();
    const [resolvedShell, ripgrepResolution] = await Promise.all([
        workspaceShellResolver.resolve(platform),
        vendoredRipgrepResolver.resolve(),
    ]);

    const resolvedWorkspaceContext =
        input.workspaceContext === undefined && input.workspaceFingerprint
            ? await workspaceContextService.resolveForSession({
                  profileId: input.profileId,
                  sessionId: input.sessionId,
                  topLevelTab: input.topLevelTab,
                  allowLazySandboxCreation: false,
              })
            : input.workspaceContext;

    const workspaceContext = resolvedWorkspaceContext ?? undefined;

    return buildRuntimeToolGuidanceContext({
        platform,
        resolvedShell,
        ripgrepAvailable: ripgrepResolution.available,
        ...(workspaceContext ? { workspaceContext } : {}),
        profileId: input.profileId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
}

async function buildRuntimeToolGuidanceContext(input: {
    platform: ReturnType<typeof resolveSupportedPlatform>;
    resolvedShell: Awaited<ReturnType<typeof workspaceShellResolver.resolve>>;
    ripgrepAvailable: boolean;
    profileId: string;
    workspaceFingerprint?: string;
    workspaceContext?: ResolvedWorkspaceContext;
}): Promise<RuntimeToolGuidanceContext> {
    let workspaceEnvironmentSnapshot: RuntimeToolGuidanceContext['workspaceEnvironmentSnapshot'];
    if (
        input.workspaceFingerprint &&
        input.workspaceContext &&
        (input.workspaceContext.kind === 'workspace' || input.workspaceContext.kind === 'sandbox')
    ) {
        const workspacePreference = await getWorkspacePreference(input.profileId, input.workspaceFingerprint);
        const inspectionResult = await workspaceEnvironmentService.inspectWorkspaceEnvironment({
            workspaceRootPath: input.workspaceContext.absolutePath,
            ...(input.workspaceContext.kind === 'sandbox'
                ? { baseWorkspaceRootPath: input.workspaceContext.baseWorkspace.absolutePath }
                : {}),
            ...(workspacePreference
                ? {
                      overrides: {
                          ...(workspacePreference.preferredVcs
                              ? { preferredVcs: workspacePreference.preferredVcs }
                              : {}),
                          ...(workspacePreference.preferredPackageManager
                              ? { preferredPackageManager: workspacePreference.preferredPackageManager }
                              : {}),
                      },
                  }
                : {}),
        });

        if (inspectionResult.isOk()) {
            workspaceEnvironmentSnapshot = inspectionResult.value;
        }
    }

    return {
        platform: input.platform,
        shellFamily: workspaceEnvironmentSnapshot?.shellFamily ?? input.resolvedShell.shellFamily,
        ...(workspaceEnvironmentSnapshot?.shellExecutable
            ? { shellExecutable: workspaceEnvironmentSnapshot.shellExecutable }
            : input.resolvedShell.shellExecutable
              ? { shellExecutable: input.resolvedShell.shellExecutable }
              : {}),
        shellResolved: input.resolvedShell.resolved,
        vendoredRipgrepAvailable: input.ripgrepAvailable,
        ...(workspaceEnvironmentSnapshot ? { workspaceEnvironmentSnapshot } : {}),
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
    };
}
