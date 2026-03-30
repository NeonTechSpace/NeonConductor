import type { ResolveRuntimeFamilyInput } from '@/app/backend/providers/runtimeFamilyPolicy.types';
import type { ProviderRuntimeTransportFamily } from '@/app/backend/providers/types';
import { errRunExecution, type RunExecutionError, type RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';
import type { RunTransportResolution } from '@/app/backend/runtime/services/runExecution/types';

type RuntimeOptionInvalidDetail =
    | 'attachments_not_allowed'
    | 'generic'
    | 'chat_mode_not_supported'
    | 'model_not_realtime_capable'
    | 'api_key_required'
    | 'base_url_not_supported'
    | 'provider_not_supported';

export function buildTransport(input: {
    runtimeOptions: ResolveRuntimeFamilyInput['runtimeOptions'];
    selected: ProviderRuntimeTransportFamily;
}): RunTransportResolution {
    return {
        requested: input.runtimeOptions.transport.family,
        selected: input.selected,
        degraded: false,
    };
}

export function invalidRuntimeOption(input: {
    providerId: ResolveRuntimeFamilyInput['providerId'];
    modelId: string;
    message: string;
    detail?: RuntimeOptionInvalidDetail;
}): RunExecutionResult<never> {
    return errRunExecution('runtime_option_invalid', input.message, {
        action: {
            code: 'runtime_options_invalid',
            providerId: input.providerId,
            modelId: input.modelId,
            detail: input.detail ?? 'generic',
        },
    });
}

function requireAutoRequestedTransportFamily(
    input: ResolveRuntimeFamilyInput,
    protocolLabel: string
): RunExecutionError | null {
    if (input.runtimeOptions.transport.family !== 'auto') {
        return {
            code: 'runtime_option_invalid',
            message: `Requested transport family "${input.runtimeOptions.transport.family}" is not supported for ${protocolLabel}.`,
            action: {
                code: 'runtime_options_invalid',
                providerId: input.providerId,
                modelId: input.modelId,
                detail: 'generic',
            },
        };
    }

    return null;
}

export function invalidRuntimeOptionFromError(error: RunExecutionError): RunExecutionResult<never> {
    return errRunExecution(error.code, error.message, {
        ...(error.action ? { action: error.action } : {}),
    });
}

export function invalidTransportOverride(
    input: ResolveRuntimeFamilyInput,
    protocolLabel: string
): RunExecutionResult<never> | null {
    const transportError = requireAutoRequestedTransportFamily(input, protocolLabel);
    if (!transportError) {
        return null;
    }

    return invalidRuntimeOptionFromError(transportError);
}
