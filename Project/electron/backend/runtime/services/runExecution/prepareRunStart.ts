import { kiloRoutingPreferenceStore, providerStore } from '@/app/backend/persistence/stores';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';
import { getExecutionPreferenceState } from '@/app/backend/providers/service/executionPreferences';
import { resolveRunCache } from '@/app/backend/runtime/services/runExecution/cacheKey';
import { validateRunCapabilities } from '@/app/backend/runtime/services/runExecution/capabilities';
import { buildRunContext } from '@/app/backend/runtime/services/runExecution/contextBuilder';
import type { RunExecutionErrorCode, RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import { errRunExecution, okRunExecution } from '@/app/backend/runtime/services/runExecution/errors';
import { resolveModeExecution } from '@/app/backend/runtime/services/runExecution/mode';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';
import { resolveFirstRunnableRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunnableTarget';
import { resolveRunTarget } from '@/app/backend/runtime/services/runExecution/resolveRunTarget';
import { resolveRuntimeToolsForMode } from '@/app/backend/runtime/services/runExecution/tools';
import type { ProviderServiceErrorCode } from '@/app/backend/providers/service/errors';
import type {
    PreparedRunStart,
    ResolvedRunAuth,
    ResolvedRunTarget,
    StartRunInput,
} from '@/app/backend/runtime/services/runExecution/types';

function mapProviderServiceErrorCodeToRunExecutionCode(
    code: ProviderServiceErrorCode
): RunExecutionErrorCode {
    if (code === 'request_failed') {
        return 'provider_request_failed';
    }

    if (code === 'request_unavailable') {
        return 'provider_request_unavailable';
    }

    if (code === 'provider_model_missing') {
        return 'provider_model_missing';
    }

    if (code === 'invalid_payload') {
        return 'invalid_payload';
    }

    return 'provider_not_supported';
}

export async function prepareRunStart(input: StartRunInput): Promise<RunExecutionResult<PreparedRunStart>> {
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

    const explicitTargetRequested = input.providerId !== undefined || input.modelId !== undefined;
    let resolvedAuth: ResolvedRunAuth;
    let activeTarget: ResolvedRunTarget;

    if (explicitTargetRequested) {
        const resolvedTargetResult = await resolveRunTarget({
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.modelId ? { modelId: input.modelId } : {}),
        });
        if (resolvedTargetResult.isErr()) {
            return errRunExecution(resolvedTargetResult.error.code, resolvedTargetResult.error.message, {
                ...(resolvedTargetResult.error.action ? { action: resolvedTargetResult.error.action } : {}),
            });
        }

        activeTarget = resolvedTargetResult.value;

        const resolvedAuthResult = await resolveRunAuth({
            profileId: input.profileId,
            providerId: activeTarget.providerId,
        });
        if (resolvedAuthResult.isErr()) {
            return errRunExecution(resolvedAuthResult.error.code, resolvedAuthResult.error.message, {
                ...(resolvedAuthResult.error.action ? { action: resolvedAuthResult.error.action } : {}),
            });
        }

        resolvedAuth = resolvedAuthResult.value;
    } else {
        const preferredTargetResult = await resolveRunTarget({
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
        });
        const fallback = await resolveFirstRunnableRunTarget({
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            mode: resolvedModeResult.value.mode,
            runtimeOptions: input.runtimeOptions,
            ...(input.attachments ? { attachments: input.attachments } : {}),
            ...(preferredTargetResult.isOk() ? { preferredTarget: preferredTargetResult.value } : {}),
        });
        if (!fallback) {
            return errRunExecution(
                'provider_model_missing',
                'No compatible runnable provider/model found for this run.',
                {
                    action: {
                        code: 'model_unavailable',
                    },
                }
            );
        }

        activeTarget = fallback.target;
        resolvedAuth = fallback.auth;
    }

    const modelCapabilities = await providerStore.getModelCapabilities(
        input.profileId,
        activeTarget.providerId,
        activeTarget.modelId
    );
    if (!modelCapabilities) {
        return errRunExecution(
            'provider_model_missing',
            `Model "${activeTarget.modelId}" is missing runtime capabilities.`,
            {
                action: {
                    code: 'model_unavailable',
                    providerId: activeTarget.providerId,
                    modelId: activeTarget.modelId,
                },
            }
        );
    }

    const capabilityValidation = validateRunCapabilities({
        providerId: activeTarget.providerId,
        modelId: activeTarget.modelId,
        modelCapabilities,
        runtimeOptions: input.runtimeOptions,
        topLevelTab: input.topLevelTab,
        mode: resolvedModeResult.value.mode,
    });
    if (capabilityValidation.isErr()) {
        return errRunExecution(capabilityValidation.error.code, capabilityValidation.error.message, {
            ...(capabilityValidation.error.action ? { action: capabilityValidation.error.action } : {}),
        });
    }
    if (input.attachments && input.attachments.length > 0 && !modelCapabilities.features.supportsVision) {
        return errRunExecution(
            'runtime_option_invalid',
            `Model "${activeTarget.modelId}" does not support image input. Select a vision-capable model before attaching images.`,
            {
                action: {
                    code: 'model_vision_required',
                    providerId: activeTarget.providerId,
                    modelId: activeTarget.modelId,
                },
            }
        );
    }

    const openAIExecutionPreferenceResult =
        activeTarget.providerId === 'openai'
            ? await getExecutionPreferenceState(input.profileId, activeTarget.providerId)
            : null;
    if (openAIExecutionPreferenceResult?.isErr()) {
        return errRunExecution(
            mapProviderServiceErrorCodeToRunExecutionCode(openAIExecutionPreferenceResult.error.code),
            openAIExecutionPreferenceResult.error.message
        );
    }

    const runtimeProtocolResult = await resolveRuntimeProtocol({
        profileId: input.profileId,
        providerId: activeTarget.providerId,
        modelId: activeTarget.modelId,
        modelCapabilities,
        authMethod: resolvedAuth.authMethod,
        runtimeOptions: input.runtimeOptions,
        topLevelTab: input.topLevelTab,
        ...(openAIExecutionPreferenceResult?.isOk()
            ? { openAIExecutionMode: openAIExecutionPreferenceResult.value.mode }
            : {}),
    });
    if (runtimeProtocolResult.isErr()) {
        return errRunExecution(runtimeProtocolResult.error.code, runtimeProtocolResult.error.message, {
            ...(runtimeProtocolResult.error.action ? { action: runtimeProtocolResult.error.action } : {}),
        });
    }

    const toolDefinitions = await resolveRuntimeToolsForMode({
        mode: resolvedModeResult.value.mode,
    });
    const runContextResult = await buildRunContext({
        profileId: input.profileId,
        sessionId: input.sessionId,
        prompt: input.prompt,
        ...(input.attachments ? { attachments: input.attachments } : {}),
        topLevelTab: input.topLevelTab,
        providerId: activeTarget.providerId,
        modelId: activeTarget.modelId,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        resolvedMode: resolvedModeResult.value,
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
        providerId: activeTarget.providerId,
        modelId: activeTarget.modelId,
        modelCapabilities,
        runtimeOptions: input.runtimeOptions,
    });
    if (resolvedCacheResult.isErr()) {
        return errRunExecution(resolvedCacheResult.error.code, resolvedCacheResult.error.message, {
            ...(resolvedCacheResult.error.action ? { action: resolvedCacheResult.error.action } : {}),
        });
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
        runtimeDescriptor: runtimeProtocolResult.value.runtime,
        resolvedAuth,
        resolvedCache: resolvedCacheResult.value,
        initialTransport: runtimeProtocolResult.value.transport,
        ...(openAIExecutionPreferenceResult?.isOk()
            ? { openAIExecutionMode: openAIExecutionPreferenceResult.value.mode }
            : {}),
        toolDefinitions,
        ...(runContext ? { runContext } : {}),
        ...(kiloRouting ? { kiloRouting } : {}),
    });
}
