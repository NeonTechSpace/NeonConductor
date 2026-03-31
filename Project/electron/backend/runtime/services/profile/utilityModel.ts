import { providerStore, settingsStore } from '@/app/backend/persistence/stores';
import { ensureSupportedProvider } from '@/app/backend/providers/service/helpers';
import type { RuntimeProviderId } from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { resolveRunAuth } from '@/app/backend/runtime/services/runExecution/resolveRunAuth';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';

const UTILITY_PROVIDER_ID_SETTING_KEY = 'utility_provider_id';
const UTILITY_MODEL_ID_SETTING_KEY = 'utility_model_id';

export interface UtilityModelSelection {
    providerId: RuntimeProviderId;
    modelId: string;
}

export interface UtilityModelPreference {
    selection: UtilityModelSelection | null;
}

export interface ResolvedUtilityModelTarget {
    providerId: RuntimeProviderId;
    modelId: string;
    source: 'utility' | 'fallback';
}

async function readPersistedUtilitySelection(profileId: string): Promise<UtilityModelSelection | null> {
    const [providerIdRaw, modelIdRaw] = await Promise.all([
        settingsStore.getStringOptional(profileId, UTILITY_PROVIDER_ID_SETTING_KEY),
        settingsStore.getStringOptional(profileId, UTILITY_MODEL_ID_SETTING_KEY),
    ]);

    if (!providerIdRaw || !modelIdRaw) {
        return null;
    }

    const ensuredProviderResult = await ensureSupportedProvider(providerIdRaw as RuntimeProviderId);
    if (ensuredProviderResult.isErr()) {
        return null;
    }

    const providerId = ensuredProviderResult.value;
    const modelId = canonicalizeProviderModelId(providerId, modelIdRaw);
    const modelExists = await providerStore.modelExists(profileId, providerId, modelId);
    if (!modelExists) {
        return null;
    }

    return {
        providerId,
        modelId,
    };
}

class UtilityModelService {
    async getUtilityModelPreference(profileId: string): Promise<UtilityModelPreference> {
        return {
            selection: await readPersistedUtilitySelection(profileId),
        };
    }

    async setUtilityModelPreference(input: {
        profileId: string;
        providerId?: RuntimeProviderId;
        modelId?: string;
    }): Promise<OperationalResult<UtilityModelPreference>> {
        const providerId = input.providerId;
        const modelId = input.modelId?.trim();

        if ((providerId && !modelId) || (!providerId && modelId)) {
            return errOp(
                'invalid_input',
                'Utility AI selection requires both providerId and modelId, or neither to clear the selection.'
            );
        }

        if (!providerId && !modelId) {
            await Promise.all([
                settingsStore.delete(input.profileId, UTILITY_PROVIDER_ID_SETTING_KEY),
                settingsStore.delete(input.profileId, UTILITY_MODEL_ID_SETTING_KEY),
            ]);

            return okOp({ selection: null });
        }

        const requiredProviderId = providerId;
        const requiredModelId = modelId;
        if (!requiredProviderId || !requiredModelId) {
            return errOp(
                'invalid_input',
                'Utility AI selection requires both providerId and modelId, or neither to clear the selection.'
            );
        }

        const ensuredProviderResult = await ensureSupportedProvider(requiredProviderId);
        if (ensuredProviderResult.isErr()) {
            return errOp(ensuredProviderResult.error.code, ensuredProviderResult.error.message);
        }

        const resolvedProviderId = ensuredProviderResult.value;
        const canonicalModelId = canonicalizeProviderModelId(resolvedProviderId, requiredModelId);
        const modelExists = await providerStore.modelExists(input.profileId, resolvedProviderId, canonicalModelId);
        if (!modelExists) {
            return errOp(
                'provider_model_missing',
                `Model "${canonicalModelId}" is not available for provider "${resolvedProviderId}".`
            );
        }

        await Promise.all([
            settingsStore.setString(input.profileId, UTILITY_PROVIDER_ID_SETTING_KEY, resolvedProviderId),
            settingsStore.setString(input.profileId, UTILITY_MODEL_ID_SETTING_KEY, canonicalModelId),
        ]);

        return okOp({
            selection: {
                providerId: resolvedProviderId,
                modelId: canonicalModelId,
            },
        });
    }

    async resolveUtilityModelTarget(input: {
        profileId: string;
        fallbackProviderId: RuntimeProviderId;
        fallbackModelId: string;
    }): Promise<ResolvedUtilityModelTarget> {
        const preference = await this.getUtilityModelPreference(input.profileId);
        if (!preference.selection) {
            return {
                providerId: input.fallbackProviderId,
                modelId: input.fallbackModelId,
                source: 'fallback',
            };
        }

        const authResult = await resolveRunAuth({
            profileId: input.profileId,
            providerId: preference.selection.providerId,
        });
        if (authResult.isErr()) {
            return {
                providerId: input.fallbackProviderId,
                modelId: input.fallbackModelId,
                source: 'fallback',
            };
        }

        return {
            providerId: preference.selection.providerId,
            modelId: preference.selection.modelId,
            source: 'utility',
        };
    }
}

export const utilityModelService = new UtilityModelService();
