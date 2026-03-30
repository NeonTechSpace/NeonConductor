import {
    resolveProviderNativeRuntimeSpecialization,
    supportsProviderNativeRuntimeContext,
} from '@/app/backend/providers/adapters/providerNative';
import type {
    ResolveRuntimeFamilyInput,
    ResolvedRuntimeFamilyProtocol,
    RuntimeFamilyCatalogInput,
} from '@/app/backend/providers/runtimeFamilyPolicy.types';
import { buildTransport, invalidRuntimeOption, invalidTransportOverride } from '@/app/backend/providers/transportOverridePolicy';
import { errRunExecution, okRunExecution, type RunExecutionResult } from '@/app/backend/runtime/services/runExecution/errors';

export function supportsProviderNativeCatalogRuntimeFamily(input: RuntimeFamilyCatalogInput): boolean {
    return (
        input.model.runtime.toolProtocol === 'provider_native' &&
        !!input.context &&
        supportsProviderNativeRuntimeContext({
            providerId: input.providerId,
            modelId: input.model.modelId,
            optionProfileId: input.context.optionProfileId,
            resolvedBaseUrl: input.context.resolvedBaseUrl,
            ...(input.model.sourceProvider ? { sourceProvider: input.model.sourceProvider } : {}),
            ...(input.model.runtime.apiFamily ? { apiFamily: input.model.runtime.apiFamily } : {}),
            providerNativeId: input.model.runtime.providerNativeId,
        })
    );
}

export async function resolveProviderNativeRuntimeProtocol(
    input: ResolveRuntimeFamilyInput
): Promise<RunExecutionResult<ResolvedRuntimeFamilyProtocol>> {
    const runtime = input.modelCapabilities.runtime;
    const transportError = invalidTransportOverride(input, 'protocol "provider_native"');
    if (transportError) {
        return transportError;
    }

    const specialization = await resolveProviderNativeRuntimeSpecialization(input.providerId, input.modelId, input.profileId);
    if (!specialization) {
        return errRunExecution(
            'runtime_option_invalid',
            `Model "${input.modelId}" requires a provider-native runtime specialization that is not registered.`,
            {
                action: {
                    code: 'provider_native_unsupported',
                    providerId: input.providerId,
                    modelId: input.modelId,
                },
            }
        );
    }

    if (runtime.toolProtocol !== 'provider_native') {
        return invalidRuntimeOption({
            providerId: input.providerId,
            modelId: input.modelId,
            message: `Model "${input.modelId}" is missing the provider-native runtime descriptor.`,
        });
    }

    return okRunExecution({
        runtime,
        transport: buildTransport({
            runtimeOptions: input.runtimeOptions,
            selected: 'provider_native',
        }),
    });
}
