import {
    errProviderBehavior,
    okProviderBehavior,
    type ProviderRuntimeBehavior,
} from '@/app/backend/providers/behaviors/types';
import type { RuntimeRunOptions } from '@/app/backend/runtime/contracts';

function isReasoningRequested(runtimeOptions: RuntimeRunOptions): boolean {
    return (
        runtimeOptions.reasoning.effort !== 'none' ||
        runtimeOptions.reasoning.summary !== 'none' ||
        runtimeOptions.reasoning.includeEncrypted
    );
}

export const kiloRuntimeBehavior: ProviderRuntimeBehavior = {
    providerId: 'kilo',
    validateRunOptions(input) {
        if (!input.modelCapabilities.supportsReasoning && isReasoningRequested(input.runtimeOptions)) {
            return errProviderBehavior(
                'runtime_option_invalid',
                `Model "${input.modelId}" does not support reasoning options.`
            );
        }

        return okProviderBehavior(undefined);
    },
    resolveBilledVia() {
        return 'kilo_gateway';
    },
};
