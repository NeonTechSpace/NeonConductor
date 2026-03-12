import { providerStore } from '@/app/backend/persistence/stores';
import { toSupportedProviderIdResult } from '@/app/backend/providers/registry';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { ResolvedRunTarget } from '@/app/backend/runtime/services/runExecution/types';

function tryAssertProviderId(value: string): RuntimeProviderId | undefined {
    const supportedProviderIdResult = toSupportedProviderIdResult(value);
    if (supportedProviderIdResult.isErr()) {
        return undefined;
    }

    return supportedProviderIdResult.value;
}

export async function resolveRunTarget(input: {
    profileId: string;
    providerId?: string;
    modelId?: string;
}): Promise<RunExecutionResult<ResolvedRunTarget>> {
    const defaults = await providerStore.getDefaults(input.profileId);

    let providerId: RuntimeProviderId | undefined;
    if (input.providerId) {
        const assertedProviderId = tryAssertProviderId(input.providerId);
        if (!assertedProviderId) {
            return errRunExecution('provider_not_supported', `Provider "${input.providerId}" is not supported.`);
        }
        providerId = assertedProviderId;
    }

    let modelId = input.modelId;

    if (!providerId && modelId) {
        const inferred = modelId.split('/')[0] ?? '';
        const inferredProviderId = tryAssertProviderId(inferred);
        if (!inferredProviderId) {
            return errRunExecution('provider_not_supported', `Provider "${inferred}" is not supported.`);
        }
        providerId = inferredProviderId;
    }

    if (!providerId) {
        providerId = tryAssertProviderId(defaults.providerId);
    }

    if (providerId && !modelId) {
        if (defaults.providerId === providerId && defaults.modelId.trim().length > 0) {
            modelId = defaults.modelId;
        }
    }

    if (!providerId || !modelId) {
        return errRunExecution('provider_model_missing', 'No explicit provider/model target could be resolved.');
    }

    const modelExists = await providerStore.modelExists(input.profileId, providerId, modelId);
    if (!modelExists) {
        return errRunExecution(
            'provider_model_not_available',
            `Model "${modelId}" is not available for provider "${providerId}".`
        );
    }

    return okRunExecution({
        providerId,
        modelId,
    });
}
