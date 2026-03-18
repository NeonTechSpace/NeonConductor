import { getProviderRuntimeBehavior } from '@/app/backend/providers/behaviors';
import type { ProviderModelCapabilities } from '@/app/backend/providers/types';
import type { ModeDefinition, RuntimeProviderId, RuntimeRunOptions, TopLevelTab } from '@/app/backend/runtime/contracts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import { runModeRequiresNativeTools } from '@/app/backend/runtime/services/runExecution/tools';

interface ValidateRunCapabilitiesInput {
    providerId: RuntimeProviderId;
    modelId: string;
    modelCapabilities: ProviderModelCapabilities;
    runtimeOptions: RuntimeRunOptions;
    topLevelTab: TopLevelTab;
    mode: ModeDefinition;
}

export function validateRunCapabilities(input: ValidateRunCapabilitiesInput): RunExecutionResult<void> {
    const behavior = getProviderRuntimeBehavior(input.providerId);
    const validation = behavior.validateRunOptions({
        modelId: input.modelId,
        modelCapabilities: input.modelCapabilities,
        runtimeOptions: input.runtimeOptions,
    });
    if (validation.isErr()) {
        return errRunExecution('runtime_option_invalid', validation.error.message, {
            action: {
                code: 'runtime_options_invalid',
                providerId: input.providerId,
                modelId: input.modelId,
                modeKey: input.mode.modeKey,
                detail: 'generic',
            },
        });
    }

    if (
        runModeRequiresNativeTools({
            mode: input.mode,
        }) &&
        !input.modelCapabilities.supportsTools
    ) {
        return errRunExecution(
            'runtime_option_invalid',
            `Model "${input.modelId}" does not support native tool calling and cannot run in mode "${input.mode.modeKey}".`,
            {
                action: {
                    code: 'model_tools_required',
                    providerId: input.providerId,
                    modelId: input.modelId,
                    modeKey: input.mode.modeKey,
                },
            }
        );
    }

    return okRunExecution(undefined);
}
