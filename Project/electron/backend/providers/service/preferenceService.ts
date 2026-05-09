import { providerStore } from '@/app/backend/persistence/stores';
import { ensureSupportedProvider } from '@/app/backend/providers/service/helpers';
import type {
    ProviderSpecialistDefaultModeKey,
    ProviderSpecialistDefaultTopLevelTab,
    WorkflowRoutingTargetKey,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import type {
    ProviderModelFavoriteRecord,
    ProviderSpecialistDefaultRecord,
    WorkflowRoutingPreferenceRecord,
} from '@/app/backend/runtime/contracts/types/provider';
import { isSupportedModeSpecialistAlias } from '@/app/backend/runtime/services/mode/routing';
import { appLog } from '@/app/main/logging';

import { canonicalizeProviderModelId } from '@/shared/kiloModels';
import { resolveWorkflowRoutingCompatibilityRequirements } from '@/shared/workflowRouting';

export async function getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
    return providerStore.getDefaults(profileId);
}

export async function getSpecialistDefaults(profileId: string): Promise<ProviderSpecialistDefaultRecord[]> {
    return providerStore.getSpecialistDefaults(profileId);
}

export async function getWorkflowRoutingPreferences(profileId: string): Promise<WorkflowRoutingPreferenceRecord[]> {
    return providerStore.getWorkflowRoutingPreferences(profileId);
}

export async function getModelFavorites(profileId: string): Promise<ProviderModelFavoriteRecord[]> {
    return providerStore.getModelFavorites(profileId);
}

export async function setDefault(
    profileId: string,
    providerId: RuntimeProviderId,
    modelId: string
): Promise<{
    success: boolean;
    reason: 'provider_not_found' | 'model_not_found' | null;
    defaultProviderId: string;
    defaultModelId: string;
}> {
    const ensuredProviderResult = await ensureSupportedProvider(providerId);
    if (ensuredProviderResult.isErr()) {
        const defaults = await providerStore.getDefaults(profileId);
        appLog.warn({
            tag: 'provider.preference-service',
            message: 'Rejected default provider update due to unsupported or unregistered provider.',
            profileId,
            providerId,
            error: ensuredProviderResult.error.message,
        });
        return {
            success: false,
            reason: 'provider_not_found',
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }

    const hasModel = await providerStore.modelExists(profileId, providerId, modelId);
    if (!hasModel) {
        const defaults = await providerStore.getDefaults(profileId);
        return {
            success: false,
            reason: 'model_not_found',
            defaultProviderId: defaults.providerId,
            defaultModelId: defaults.modelId,
        };
    }

    await providerStore.setDefaults(profileId, providerId, modelId);
    const defaults = await providerStore.getDefaults(profileId);
    return {
        success: true,
        reason: null,
        defaultProviderId: defaults.providerId,
        defaultModelId: defaults.modelId,
    };
}

export async function setSpecialistDefault(input: {
    profileId: string;
    topLevelTab: ProviderSpecialistDefaultTopLevelTab;
    modeKey: ProviderSpecialistDefaultModeKey;
    providerId: RuntimeProviderId;
    modelId: string;
}): Promise<{
    success: boolean;
    reason:
        | 'provider_not_found'
        | 'model_not_found'
        | 'model_tools_required'
        | 'specialist_default_not_supported'
        | null;
    specialistDefaults: ProviderSpecialistDefaultRecord[];
    specialistDefault?: ProviderSpecialistDefaultRecord;
}> {
    if (!isSupportedModeSpecialistAlias({ topLevelTab: input.topLevelTab, modeKey: input.modeKey })) {
        return {
            success: false,
            reason: 'specialist_default_not_supported',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    const ensuredProviderResult = await ensureSupportedProvider(input.providerId);
    if (ensuredProviderResult.isErr()) {
        appLog.warn({
            tag: 'provider.preference-service',
            message: 'Rejected specialist default update due to unsupported or unregistered provider.',
            profileId: input.profileId,
            providerId: input.providerId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            error: ensuredProviderResult.error.message,
        });
        return {
            success: false,
            reason: 'provider_not_found',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    const modelCapabilities = await providerStore.getModelCapabilities(
        input.profileId,
        input.providerId,
        input.modelId
    );
    if (!modelCapabilities) {
        return {
            success: false,
            reason: 'model_not_found',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    if (!modelCapabilities.features.supportsTools) {
        return {
            success: false,
            reason: 'model_tools_required',
            specialistDefaults: await providerStore.getSpecialistDefaults(input.profileId),
        };
    }

    const specialistDefaults = await providerStore.setSpecialistDefault(input.profileId, input);
    const specialistDefault = specialistDefaults.find(
        (value) => value.topLevelTab === input.topLevelTab && value.modeKey === input.modeKey
    );
    return {
        success: true,
        reason: null,
        specialistDefaults,
        ...(specialistDefault ? { specialistDefault } : {}),
    };
}

export async function setWorkflowRoutingPreference(input: {
    profileId: string;
    targetKey: WorkflowRoutingTargetKey;
    providerId: RuntimeProviderId;
    modelId: string;
}): Promise<{
    success: boolean;
    reason: 'provider_not_found' | 'model_not_found' | 'model_not_compatible' | null;
    workflowRoutingPreferences: WorkflowRoutingPreferenceRecord[];
    workflowRoutingPreference?: WorkflowRoutingPreferenceRecord;
}> {
    const ensuredProviderResult = await ensureSupportedProvider(input.providerId);
    if (ensuredProviderResult.isErr()) {
        appLog.warn({
            tag: 'provider.preference-service',
            message: 'Rejected workflow routing preference update due to unsupported or unregistered provider. ' +
                `targetKey="${input.targetKey}"`,
            profileId: input.profileId,
            providerId: input.providerId,
            targetKey: input.targetKey,
            error: ensuredProviderResult.error.message,
        });
        return {
            success: false,
            reason: 'provider_not_found',
            workflowRoutingPreferences: await providerStore.getWorkflowRoutingPreferences(input.profileId),
        };
    }

    const modelCapabilities = await providerStore.getModelCapabilities(
        input.profileId,
        input.providerId,
        input.modelId
    );
    if (!modelCapabilities) {
        return {
            success: false,
            reason: 'model_not_found',
            workflowRoutingPreferences: await providerStore.getWorkflowRoutingPreferences(input.profileId),
        };
    }

    const compatibilityRequirements = resolveWorkflowRoutingCompatibilityRequirements(input.targetKey);
    if (
        (compatibilityRequirements.requiresNativeTools && !modelCapabilities.features.supportsTools) ||
        (compatibilityRequirements.requiresReasoning && !modelCapabilities.features.supportsReasoning)
    ) {
        appLog.warn({
            tag: 'provider.preference-service',
            message: 'Rejected workflow routing preference update because the selected model does not satisfy the workflow routing requirements.',
            profileId: input.profileId,
            providerId: input.providerId,
            modelId: input.modelId,
            targetKey: input.targetKey,
        });
        return {
            success: false,
            reason: 'model_not_compatible',
            workflowRoutingPreferences: await providerStore.getWorkflowRoutingPreferences(input.profileId),
        };
    }

    const workflowRoutingPreferences = await providerStore.setWorkflowRoutingPreference(input.profileId, {
        targetKey: input.targetKey,
        providerId: input.providerId,
        modelId: input.modelId,
    });
    const workflowRoutingPreference = workflowRoutingPreferences.find(
        (value) => value.targetKey === input.targetKey
    );
    return {
        success: true,
        reason: null,
        workflowRoutingPreferences,
        ...(workflowRoutingPreference ? { workflowRoutingPreference } : {}),
    };
}

export async function clearWorkflowRoutingPreference(input: {
    profileId: string;
    targetKey: WorkflowRoutingTargetKey;
}): Promise<{
    success: boolean;
    reason: null;
    workflowRoutingPreferences: WorkflowRoutingPreferenceRecord[];
}> {
    const workflowRoutingPreferences = await providerStore.clearWorkflowRoutingPreference(
        input.profileId,
        input.targetKey
    );
    return {
        success: true,
        reason: null,
        workflowRoutingPreferences,
    };
}

export async function setModelFavorite(input: {
    profileId: string;
    providerId: RuntimeProviderId;
    modelId: string;
    favorite: boolean;
}): Promise<{
    success: boolean;
    reason: 'provider_not_found' | 'model_not_found' | null;
    modelFavorites: ProviderModelFavoriteRecord[];
}> {
    const ensuredProviderResult = await ensureSupportedProvider(input.providerId);
    if (ensuredProviderResult.isErr()) {
        appLog.warn({
            tag: 'provider.preference-service',
            message: 'Rejected model favorite update due to unsupported or unregistered provider.',
            profileId: input.profileId,
            providerId: input.providerId,
            error: ensuredProviderResult.error.message,
        });
        return {
            success: false,
            reason: 'provider_not_found',
            modelFavorites: await providerStore.getModelFavorites(input.profileId),
        };
    }

    const canonicalModelId = canonicalizeProviderModelId(input.providerId, input.modelId);

    if (input.favorite) {
        const hasModel = await providerStore.modelExists(input.profileId, input.providerId, canonicalModelId);
        if (!hasModel) {
            return {
                success: false,
                reason: 'model_not_found',
                modelFavorites: await providerStore.getModelFavorites(input.profileId),
            };
        }
    }

    return {
        success: true,
        reason: null,
        modelFavorites: await providerStore.setModelFavorite(input.profileId, {
            ...input,
            modelId: canonicalModelId,
        }),
    };
}
