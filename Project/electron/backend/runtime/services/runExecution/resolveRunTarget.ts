import { providerStore } from '@/app/backend/persistence/stores';
import { toSupportedProviderIdResult } from '@/app/backend/providers/registry';
import { resolveModeRoutingIntent } from '@/app/backend/runtime/services/mode/routing';
import { modelRoleDefaultService } from '@/app/backend/runtime/services/profile/modelRoleDefaults';
import {
    errRunExecution,
    okRunExecution,
    type RunExecutionResult,
} from '@/app/backend/runtime/services/runExecution/errors';
import type { ResolvedRunTarget } from '@/app/backend/runtime/services/runExecution/types';

import { findProviderSpecialistDefault, type ModeDefinition, type RuntimeProviderId } from '@/shared/contracts';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';

function tryAssertProviderId(value: string): RuntimeProviderId | undefined {
    const supportedProviderIdResult = toSupportedProviderIdResult(value);
    if (supportedProviderIdResult.isErr()) {
        return undefined;
    }

    return supportedProviderIdResult.value;
}

export async function resolveRequestedOrDefaultRunTarget(input: {
    profileId: string;
    providerId?: string;
    modelId?: string;
    mode?: ModeDefinition;
}): Promise<RunExecutionResult<ResolvedRunTarget>> {
    let providerId: RuntimeProviderId | undefined;
    if (input.providerId) {
        const assertedProviderId = tryAssertProviderId(input.providerId);
        if (!assertedProviderId) {
            return errRunExecution('provider_not_supported', `Provider "${input.providerId}" is not supported.`);
        }
        providerId = assertedProviderId;
    }

    const modelId = input.modelId;
    if (!providerId && modelId) {
        const inferredProviderToken = modelId.split('/')[0] ?? '';
        const inferredProviderId = tryAssertProviderId(inferredProviderToken);
        if (!inferredProviderId) {
            return errRunExecution('provider_not_supported', `Provider "${inferredProviderToken}" is not supported.`);
        }
        providerId = inferredProviderId;
    }

    if (providerId && modelId) {
        return okRunExecution({
            providerId,
            modelId: canonicalizeProviderModelId(providerId, modelId),
        });
    }

    const [defaults, specialistDefaults] = await Promise.all([
        providerStore.getDefaults(input.profileId),
        providerStore.getSpecialistDefaults(input.profileId),
    ]);

    if (input.mode) {
        const roleDefault = await modelRoleDefaultService.resolveRoleDefault({
            profileId: input.profileId,
            role: input.mode.internalModelRole,
        });
        if (
            roleDefault.source === 'role_override' &&
            roleDefault.status === 'configured' &&
            roleDefault.providerId &&
            roleDefault.modelId
        ) {
            return okRunExecution({
                providerId: roleDefault.providerId,
                modelId: canonicalizeProviderModelId(roleDefault.providerId, roleDefault.modelId),
            });
        }
    }

    const specialistAlias = resolveModeRoutingIntent(input.mode).specialistAlias;
    const specialistDefault = specialistAlias
        ? findProviderSpecialistDefault(specialistDefaults, specialistAlias)
        : undefined;

    const defaultProviderId = specialistDefault?.providerId ?? defaults.providerId;
    providerId = tryAssertProviderId(defaultProviderId);
    if (!providerId) {
        return errRunExecution('provider_not_supported', `Provider "${defaultProviderId}" is not supported.`);
    }

    const defaultModelId =
        specialistDefault?.providerId === providerId && specialistDefault.modelId.trim().length > 0
            ? specialistDefault.modelId
            : defaults.providerId === providerId && defaults.modelId.trim().length > 0
              ? defaults.modelId
              : '';

    if (defaultModelId.trim().length === 0) {
        return errRunExecution('provider_model_missing', 'No explicit provider/model target could be resolved.');
    }

    return okRunExecution({
        providerId,
        modelId: canonicalizeProviderModelId(providerId, defaultModelId),
    });
}

export async function verifyResolvedRunTargetAvailability(input: {
    profileId: string;
    target: ResolvedRunTarget;
}): Promise<RunExecutionResult<ResolvedRunTarget>> {
    const modelExists = await providerStore.modelExists(input.profileId, input.target.providerId, input.target.modelId);
    if (!modelExists) {
        return errRunExecution(
            'provider_model_not_available',
            `Model "${input.target.modelId}" is not available for provider "${input.target.providerId}".`
        );
    }

    return okRunExecution(input.target);
}

