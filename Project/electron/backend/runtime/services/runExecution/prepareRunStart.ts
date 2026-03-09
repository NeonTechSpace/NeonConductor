import { kiloRoutingPreferenceStore, providerStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';
import { resolveRunCache } from '@/app/backend/runtime/services/runExecution/cacheKey';
import { validateRunCapabilities } from '@/app/backend/runtime/services/runExecution/capabilities';
import { buildRunContext } from '@/app/backend/runtime/services/runExecution/contextBuilder';
import type { RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import { errRunExecution, okRunExecution } from '@/app/backend/runtime/services/runExecution/errors';
import { resolveModeExecution } from '@/app/backend/runtime/services/runExecution/mode';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import { resolveFirstRunnableRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunnableTarget';
import { resolveRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunTarget';
import { resolveInitialRunTransport } from '@/app/backend/runtime/services/runExecution/transport';
import type {
    PreparedRunStart,
    ResolvedRunAuth,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';

export async function prepareRunStart(input: StartRunInput): Promise<RunExecutionResult<PreparedRunStart>> {
    const resolvedModeResult = await resolveModeExecution({
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (resolvedModeResult.isErr()) {
        return errRunExecution(resolvedModeResult.error.code, resolvedModeResult.error.message);
    }

    const resolvedTargetResult = await resolveRunTarget({
        profileId: input.profileId,
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.modelId ? { modelId: input.modelId } : {}),
    });
    if (resolvedTargetResult.isErr()) {
        return errRunExecution(resolvedTargetResult.error.code, resolvedTargetResult.error.message);
    }

    const explicitTargetRequested = input.providerId !== undefined || input.modelId !== undefined;
    let activeTarget = resolvedTargetResult.value;
    let resolvedAuth: ResolvedRunAuth;

    const resolvedAuthResult = await resolveRunAuth({
        profileId: input.profileId,
        providerId: activeTarget.providerId,
    });
    if (resolvedAuthResult.isErr()) {
        if (explicitTargetRequested) {
            return errRunExecution(resolvedAuthResult.error.code, resolvedAuthResult.error.message);
        }

        const fallback = await resolveFirstRunnableRunTarget(input.profileId, {
            providerId: activeTarget.providerId,
            modelId: activeTarget.modelId,
        });
        if (!fallback) {
            return errRunExecution(resolvedAuthResult.error.code, resolvedAuthResult.error.message);
        }

        activeTarget = fallback.target;
        resolvedAuth = fallback.auth;
    } else {
        resolvedAuth = resolvedAuthResult.value;
    }

    const modelCapabilities = await providerStore.getModelCapabilities(
        input.profileId,
        activeTarget.providerId,
        activeTarget.modelId
    );
    if (!modelCapabilities) {
        return errRunExecution(
            'provider_model_missing',
            `Model "${activeTarget.modelId}" is missing runtime capabilities.`
        );
    }

    const capabilityValidation = validateRunCapabilities({
        providerId: activeTarget.providerId,
        modelId: activeTarget.modelId,
        modelCapabilities,
        runtimeOptions: input.runtimeOptions,
    });
    if (capabilityValidation.isErr()) {
        return errRunExecution(capabilityValidation.error.code, capabilityValidation.error.message);
    }

    const initialTransport = resolveInitialRunTransport({
        providerId: activeTarget.providerId,
        runtimeOptions: input.runtimeOptions,
    });
    const runContextResult = await buildRunContext({
        profileId: input.profileId,
        sessionId: input.sessionId,
        prompt: input.prompt,
        topLevelTab: input.topLevelTab,
        providerId: activeTarget.providerId,
        modelId: activeTarget.modelId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        resolvedMode: resolvedModeResult.value,
    });
    if (runContextResult.isErr()) {
        return errRunExecution(runContextResult.error.code, runContextResult.error.message);
    }

    const runContext = runContextResult.value;
    const resolvedCacheResult = resolveRunCache({
        profileId: input.profileId,
        sessionId: input.sessionId,
        ...(runContext ? { cacheScopeKey: runContext.digest } : {}),
        providerId: activeTarget.providerId,
        modelId: activeTarget.modelId,
        runtimeOptions: input.runtimeOptions,
    });
    if (resolvedCacheResult.isErr()) {
        return errRunExecution(resolvedCacheResult.error.code, resolvedCacheResult.error.message);
    }

    const kiloRoutingPreference =
        activeTarget.providerId === 'kilo'
            ? await kiloRoutingPreferenceStore.getPreference(input.profileId, activeTarget.modelId)
            : null;
    const kiloRouting: ProviderRuntimeInput['kiloRouting'] =
        activeTarget.providerId !== 'kilo'
            ? undefined
            : kiloRoutingPreference
              ? kiloRoutingPreference.routingMode === 'dynamic'
                  ? {
                        mode: 'dynamic' as const,
                        sort: kiloRoutingPreference.sort ?? 'default',
                    }
                  : kiloRoutingPreference.pinnedProviderId
                    ? {
                          mode: 'pinned' as const,
                          providerId: kiloRoutingPreference.pinnedProviderId,
                      }
                    : {
                          mode: 'dynamic' as const,
                          sort: 'default',
                      }
              : {
                    mode: 'dynamic' as const,
                    sort: 'default',
                };

    return okRunExecution({
        resolvedMode: resolvedModeResult.value,
        activeTarget,
        resolvedAuth,
        resolvedCache: resolvedCacheResult.value,
        initialTransport,
        ...(runContext ? { runContext } : {}),
        ...(kiloRouting ? { kiloRouting } : {}),
    });
}
