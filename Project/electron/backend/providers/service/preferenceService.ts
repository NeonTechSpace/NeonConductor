import { providerStore } from '@/app/backend/persistence/stores';
import { ensureSupportedProvider } from '@/app/backend/providers/service/helpers';
import type {
    ProviderSpecialistDefaultModeKey,
    ProviderSpecialistDefaultTopLevelTab,
    RuntimeProviderId,
} from '@/app/backend/runtime/contracts';
import type { ProviderSpecialistDefaultRecord } from '@/app/backend/runtime/contracts/types/provider';
import { appLog } from '@/app/main/logging';

export async function getDefaults(profileId: string): Promise<{ providerId: string; modelId: string }> {
    return providerStore.getDefaults(profileId);
}

export async function getSpecialistDefaults(profileId: string): Promise<ProviderSpecialistDefaultRecord[]> {
    return providerStore.getSpecialistDefaults(profileId);
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
    const supportedTarget =
        (input.topLevelTab === 'agent' &&
            (input.modeKey === 'ask' || input.modeKey === 'code' || input.modeKey === 'debug')) ||
        (input.topLevelTab === 'orchestrator' && (input.modeKey === 'orchestrate' || input.modeKey === 'debug'));
    if (!supportedTarget) {
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
