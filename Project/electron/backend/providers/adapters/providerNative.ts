import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import { resolveProviderNativeCompatibilityContext } from '@/app/backend/providers/adapters/providerNativeCompatibilityContextResolver';
import { executeProviderNativeRuntime } from '@/app/backend/providers/adapters/providerNativeRuntimeExecutor';
import {
    resolveProviderNativeRuntimeSpecializationForContext,
} from '@/app/backend/providers/adapters/providerNativeSpecializationRegistry';
import { errProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

import type { ProviderNativeRuntimeSpecialization } from '@/app/backend/providers/adapters/providerNative.types';

export type {
    ProviderNativeCompatibilityContext,
    ProviderNativeHttpRequest,
    ProviderNativeRuntimeExecutionInput,
    ProviderNativeRuntimeMatchStrength,
    ProviderNativeRuntimeSpecialization,
    ProviderNativeServerSentEventFrame,
    ProviderNativeStreamEventResult,
    ProviderNativeStreamState,
} from '@/app/backend/providers/adapters/providerNative.types';

export { supportsProviderNativeRuntimeContext } from '@/app/backend/providers/adapters/providerNativeSpecializationRegistry';

export async function resolveProviderNativeRuntimeSpecialization(
    providerId: FirstPartyProviderId,
    modelId: string,
    profileId: string
): Promise<ProviderNativeRuntimeSpecialization | null> {
    const compatibilityContext = await resolveProviderNativeCompatibilityContext(providerId, modelId, profileId);
    if (!compatibilityContext) {
        return null;
    }

    return resolveProviderNativeRuntimeSpecializationForContext(compatibilityContext);
}

export async function streamProviderNativeRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    const specialization = await resolveProviderNativeRuntimeSpecialization(
        input.providerId,
        input.modelId,
        input.profileId
    );
    if (!specialization) {
        return unsupportedProviderNativeRuntime(input);
    }

    return executeProviderNativeRuntime({
        runtimeInput: input,
        handlers,
        specialization,
    });
}

export function unsupportedProviderNativeRuntime(
    input: ProviderRuntimeInput,
    message?: string
): ProviderAdapterResult<never> {
    return errProviderAdapter(
        'invalid_payload',
        message ?? `Model "${input.modelId}" requires a provider-native runtime specialization that is not registered.`
    );
}
