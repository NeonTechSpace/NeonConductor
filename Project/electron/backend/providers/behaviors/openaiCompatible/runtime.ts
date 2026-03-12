import {
    errProviderBehavior,
    okProviderBehavior,
    type ProviderBilledVia,
    type ProviderRuntimeBehavior,
} from '@/app/backend/providers/behaviors/types';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { RuntimeRunOptions } from '@/app/backend/runtime/contracts';

function isReasoningRequested(runtimeOptions: RuntimeRunOptions): boolean {
    return (
        runtimeOptions.reasoning.effort !== 'none' ||
        runtimeOptions.reasoning.summary !== 'none' ||
        runtimeOptions.reasoning.includeEncrypted
    );
}

export function createOpenAICompatibleRuntimeBehavior(input: {
    providerId: FirstPartyProviderId;
    billedViaApiKey: ProviderBilledVia;
    billedViaOAuth: ProviderBilledVia;
}): ProviderRuntimeBehavior {
    return {
        providerId: input.providerId,
        validateRunOptions(validationInput) {
            if (
                !validationInput.modelCapabilities.supportsReasoning &&
                isReasoningRequested(validationInput.runtimeOptions)
            ) {
                return errProviderBehavior(
                    'runtime_option_invalid',
                    `Model "${validationInput.modelId}" does not support reasoning options.`
                );
            }

            return okProviderBehavior(undefined);
        },
        resolveBilledVia(authMethod) {
            if (authMethod === 'api_key') {
                return input.billedViaApiKey;
            }

            return input.billedViaOAuth;
        },
    };
}
