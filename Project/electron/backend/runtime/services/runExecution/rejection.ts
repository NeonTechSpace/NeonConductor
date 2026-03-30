import { providerIds, type RuntimeProviderId } from '@/app/backend/runtime/contracts';
import type { RunExecutionError } from '@/app/backend/runtime/services/runExecution/errors';
import type { StartRunInput, StartRunResult } from '@/app/backend/runtime/services/runExecution/types';

import type { RunStartRejectionAction } from '@/shared/contracts';

function isRuntimeProviderId(value: string): value is RuntimeProviderId {
    return providerIds.some((providerId) => providerId === value);
}

function inferRequestedProviderId(input: Pick<StartRunInput, 'providerId' | 'modelId'>): RuntimeProviderId | undefined {
    if (input.providerId) {
        return input.providerId;
    }

    const inferredProviderId = input.modelId?.split('/')[0]?.trim();
    return inferredProviderId && inferredProviderId.length > 0 && isRuntimeProviderId(inferredProviderId)
        ? inferredProviderId
        : undefined;
}

function inferAction(
    error: RunExecutionError,
    input: Pick<StartRunInput, 'providerId' | 'modelId' | 'modeKey' | 'topLevelTab'>
): RunStartRejectionAction | undefined {
    if (error.action) {
        return error.action;
    }

    const requestedProviderId = inferRequestedProviderId(input);

    switch (error.code) {
        case 'provider_not_authenticated':
        case 'provider_auth_invalid_state':
        case 'provider_secret_missing':
        case 'provider_auth_unsupported':
            return {
                code: 'provider_not_runnable',
                ...(requestedProviderId ? { providerId: requestedProviderId } : {}),
            };
        case 'provider_not_supported':
            return {
                code: 'provider_unsupported',
                ...(requestedProviderId ? { providerId: requestedProviderId } : {}),
            };
        case 'provider_model_not_available':
        case 'provider_model_missing':
            return {
                code: 'model_unavailable',
                ...(requestedProviderId ? { providerId: requestedProviderId } : {}),
                ...(input.modelId ? { modelId: input.modelId } : {}),
            };
        case 'invalid_mode':
        case 'mode_not_available':
        case 'mode_policy_invalid':
            return {
                code: 'mode_invalid',
                modeKey: input.modeKey,
                topLevelTab: input.topLevelTab,
            };
        case 'execution_target_unavailable':
            return {
                code: 'execution_target_unavailable',
                target: 'workspace',
                detail: 'generic',
            };
        case 'runtime_option_invalid':
        case 'cache_resolution_failed':
        case 'invalid_payload':
            return {
                code: 'runtime_options_invalid',
                ...(requestedProviderId ? { providerId: requestedProviderId } : {}),
                ...(input.modelId ? { modelId: input.modelId } : {}),
                ...(input.modeKey ? { modeKey: input.modeKey } : {}),
                detail: 'generic',
            };
        default:
            return undefined;
    }
}

export function toRejectedStartResult(
    error: RunExecutionError,
    input: Pick<StartRunInput, 'providerId' | 'modelId' | 'modeKey' | 'topLevelTab'>
): Extract<StartRunResult, { accepted: false }> {
    const action = inferAction(error, input);

    return {
        accepted: false,
        reason: 'rejected',
        code: error.code,
        message: error.message,
        ...(action ? { action } : {}),
    };
}

