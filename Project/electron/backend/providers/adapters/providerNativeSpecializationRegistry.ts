import { miniMaxOpenAICompatibilitySpecialization } from '@/app/backend/providers/adapters/providerNative/minimax';
import type {
    ProviderNativeCompatibilityContext,
    ProviderNativeRuntimeSpecialization,
} from '@/app/backend/providers/adapters/providerNative.types';

const providerNativeRuntimeSpecializations: ProviderNativeRuntimeSpecialization[] = [
    miniMaxOpenAICompatibilitySpecialization,
];

export function getProviderNativeRuntimeSpecializations(): readonly ProviderNativeRuntimeSpecialization[] {
    return providerNativeRuntimeSpecializations;
}

export function resolveProviderNativeRuntimeSpecializationForContext(
    context: ProviderNativeCompatibilityContext
): ProviderNativeRuntimeSpecialization | null {
    for (const specialization of providerNativeRuntimeSpecializations) {
        if (specialization.providerId !== context.providerId) {
            continue;
        }

        const matchStrength = specialization.matchContext(context);
        if (matchStrength === 'trusted') {
            return specialization;
        }
    }

    return null;
}

export function supportsProviderNativeRuntimeContext(context: ProviderNativeCompatibilityContext): boolean {
    return resolveProviderNativeRuntimeSpecializationForContext(context) !== null;
}
