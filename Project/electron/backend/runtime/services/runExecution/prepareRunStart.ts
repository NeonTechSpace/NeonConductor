import { kiloRoutingPreferenceStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';
import { resolveRunCache } from '@/app/backend/runtime/services/runExecution/cacheKey';
import { prepareRunnableCandidate } from '@/app/backend/runtime/services/runExecution/compatibility';
import { buildRunContext } from '@/app/backend/runtime/services/runExecution/contextBuilder';
import type { RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import { errRunExecution, okRunExecution } from '@/app/backend/runtime/services/runExecution/errors';
import { resolveKiloModeHeader } from '@/app/backend/runtime/services/runExecution/kiloMode';
import { resolveModeExecution, type ResolvedModeExecution } from '@/app/backend/runtime/services/runExecution/mode';
import { resolveFirstRunnableRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunnableTarget';
import {
    resolveRequestedOrDefaultRunTarget,
    verifyResolvedRunTargetAvailability,
} from '@/app/backend/runtime/services/runExecution/resolveRunTarget';
import { resolveRuntimeToolGuidanceContext } from '@/app/backend/runtime/services/runExecution/runtimeToolGuidanceContext';
import { resolveRuntimeToolsForMode } from '@/app/backend/runtime/services/runExecution/tools';
import type {
    PreparedRunStart,
    PreparedRunnableCandidate,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';
import type { ResolvedWorkspaceContext } from '@/shared/contracts';

async function resolvePreparedCandidate(input: {
    startInput: StartRunInput;
    mode: ResolvedModeExecution;
}): Promise<RunExecutionResult<PreparedRunnableCandidate>> {
    const { startInput, mode } = input;
    const explicitTargetRequested = startInput.providerId !== undefined || startInput.modelId !== undefined;
    const requestedTargetResult = await resolveRequestedOrDefaultRunTarget({
        profileId: startInput.profileId,
        mode: mode.mode,
        ...(startInput.providerId ? { providerId: startInput.providerId } : {}),
        ...(startInput.modelId ? { modelId: startInput.modelId } : {}),
    });

    if (explicitTargetRequested) {
        if (requestedTargetResult.isErr()) {
            return errRunExecution(requestedTargetResult.error.code, requestedTargetResult.error.message, {
                ...(requestedTargetResult.error.action ? { action: requestedTargetResult.error.action } : {}),
            });
        }

        const verifiedTargetResult = await verifyResolvedRunTargetAvailability({
            profileId: startInput.profileId,
            target: requestedTargetResult.value,
        });
        if (verifiedTargetResult.isErr()) {
            return errRunExecution(verifiedTargetResult.error.code, verifiedTargetResult.error.message, {
                ...(verifiedTargetResult.error.action ? { action: verifiedTargetResult.error.action } : {}),
            });
        }

        const preparedCandidateResult = await prepareRunnableCandidate({
            profileId: startInput.profileId,
            providerId: verifiedTargetResult.value.providerId,
            modelId: verifiedTargetResult.value.modelId,
            topLevelTab: startInput.topLevelTab,
            mode: mode.mode,
            runtimeOptions: startInput.runtimeOptions,
            ...(startInput.attachments ? { attachments: startInput.attachments } : {}),
        });
        if (preparedCandidateResult.isErr()) {
            return errRunExecution(preparedCandidateResult.error.code, preparedCandidateResult.error.message, {
                ...(preparedCandidateResult.error.action ? { action: preparedCandidateResult.error.action } : {}),
            });
        }

        if (preparedCandidateResult.value.kind === 'incompatible') {
            return errRunExecution(
                preparedCandidateResult.value.error.code,
                preparedCandidateResult.value.error.message,
                {
                    ...(preparedCandidateResult.value.error.action
                        ? { action: preparedCandidateResult.value.error.action }
                        : {}),
                }
            );
        }

        return okRunExecution(preparedCandidateResult.value.candidate);
    }

    const fallbackResult = await resolveFirstRunnableRunTarget({
        profileId: startInput.profileId,
        topLevelTab: startInput.topLevelTab,
        mode: mode.mode,
        runtimeOptions: startInput.runtimeOptions,
        ...(startInput.attachments ? { attachments: startInput.attachments } : {}),
        ...(requestedTargetResult.isOk() ? { preferredTarget: requestedTargetResult.value } : {}),
    });
    if (fallbackResult.isErr()) {
        return errRunExecution(fallbackResult.error.code, fallbackResult.error.message, {
            ...(fallbackResult.error.action ? { action: fallbackResult.error.action } : {}),
        });
    }
    if (!fallbackResult.value) {
        return errRunExecution('provider_model_missing', 'No compatible runnable provider/model found for this run.', {
            action: {
                code: 'model_unavailable',
            },
        });
    }

    return okRunExecution(fallbackResult.value);
}

export async function prepareRunStart(
    input: StartRunInput & {
        workspaceContext?: ResolvedWorkspaceContext;
    }
): Promise<RunExecutionResult<PreparedRunStart>> {
    const resolvedModeResult = await resolveModeExecution({
        profileId: input.profileId,
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
    });
    if (resolvedModeResult.isErr()) {
        return errRunExecution(resolvedModeResult.error.code, resolvedModeResult.error.message, {
            ...(resolvedModeResult.error.action ? { action: resolvedModeResult.error.action } : {}),
        });
    }

    const preparedCandidateResult = await resolvePreparedCandidate({
        startInput: input,
        mode: resolvedModeResult.value,
    });
    if (preparedCandidateResult.isErr()) {
        return errRunExecution(preparedCandidateResult.error.code, preparedCandidateResult.error.message, {
            ...(preparedCandidateResult.error.action ? { action: preparedCandidateResult.error.action } : {}),
        });
    }

    const preparedCandidate = preparedCandidateResult.value;
    const runtimeToolGuidanceContext = await resolveRuntimeToolGuidanceContext({
        profileId: input.profileId,
        sessionId: input.sessionId,
        topLevelTab: input.topLevelTab,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
    });
    const toolDefinitions = await resolveRuntimeToolsForMode({
        mode: resolvedModeResult.value.mode,
        guidanceContext: runtimeToolGuidanceContext,
    });
    const runContextResult = await buildRunContext({
        profileId: input.profileId,
        sessionId: input.sessionId,
        prompt: input.prompt,
        ...(input.attachments ? { attachments: input.attachments } : {}),
        ...(input.browserContext ? { browserContext: input.browserContext } : {}),
        topLevelTab: input.topLevelTab,
        providerId: preparedCandidate.target.providerId,
        modelId: preparedCandidate.target.modelId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        resolvedMode: resolvedModeResult.value,
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
        ...(runtimeToolGuidanceContext.workspaceEnvironmentSnapshot
            ? { workspaceEnvironmentSnapshot: runtimeToolGuidanceContext.workspaceEnvironmentSnapshot }
            : {}),
        runtimeToolGuidanceContext,
    });
    if (runContextResult.isErr()) {
        return errRunExecution(runContextResult.error.code, runContextResult.error.message, {
            ...(runContextResult.error.action ? { action: runContextResult.error.action } : {}),
        });
    }

    const runContext = runContextResult.value;
    const resolvedCacheResult = resolveRunCache({
        profileId: input.profileId,
        sessionId: input.sessionId,
        ...(runContext ? { cacheScopeKey: runContext.digest } : {}),
        providerId: preparedCandidate.target.providerId,
        modelId: preparedCandidate.target.modelId,
        modelCapabilities: preparedCandidate.modelCapabilities,
        runtimeOptions: input.runtimeOptions,
    });
    if (resolvedCacheResult.isErr()) {
        return errRunExecution(resolvedCacheResult.error.code, resolvedCacheResult.error.message, {
            ...(resolvedCacheResult.error.action ? { action: resolvedCacheResult.error.action } : {}),
        });
    }

    const kiloRoutingPreference =
        preparedCandidate.target.providerId === 'kilo'
            ? await kiloRoutingPreferenceStore.getPreference(input.profileId, preparedCandidate.target.modelId)
            : null;
    const kiloRouting: ProviderRuntimeInput['kiloRouting'] =
        preparedCandidate.target.providerId !== 'kilo'
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
    const kiloModeHeader =
        preparedCandidate.target.providerId === 'kilo'
            ? resolveKiloModeHeader(resolvedModeResult.value.mode)
            : undefined;

    return okRunExecution({
        resolvedMode: resolvedModeResult.value,
        activeTarget: preparedCandidate.target,
        runtimeDescriptor: preparedCandidate.runtimeDescriptor,
        resolvedAuth: preparedCandidate.resolvedAuth,
        resolvedCache: resolvedCacheResult.value,
        initialTransport: preparedCandidate.initialTransport,
        ...(preparedCandidate.openAIExecutionMode
            ? { openAIExecutionMode: preparedCandidate.openAIExecutionMode }
            : {}),
        toolDefinitions,
        ...(runContext ? { runContext } : {}),
        ...(kiloModeHeader ? { kiloModeHeader } : {}),
        ...(kiloRouting ? { kiloRouting } : {}),
        ...(input.workspaceContext ? { workspaceContext: input.workspaceContext } : {}),
    });
}
