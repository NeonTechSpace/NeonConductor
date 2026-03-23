import { patchProviderCache } from '@/web/components/settings/providerSettings/providerSettingsCache';
import type { RuntimeEventContext, TrpcUtils } from '@/web/lib/runtime/invalidation/types';

import type { RuntimeEventRecordV1 } from '@/app/backend/persistence/types';

import {
    readConnectionProfile,
    readExecutionPreference,
    readModelProviderOptions,
    readProviderAuthState,
    readProviderDefaults,
    readProviderListItem,
    readProviderModels,
    readRoutingPreference,
    readString,
    replaceProviderModels,
} from './readers';

export function applyProviderRuntimeEventPatch(
    utils: TrpcUtils,
    event: RuntimeEventRecordV1,
    context: RuntimeEventContext
): boolean {
    const profileId = context.profileId;
    if (!profileId) {
        return false;
    }

    const providerId = context.providerId;
    if (!providerId) {
        return false;
    }

    const provider = readProviderListItem(event.payload['provider']);
    const defaults = readProviderDefaults(event.payload['defaults']);
    const models = readProviderModels(event.payload['models']);
    const state = readProviderAuthState(event.payload['state']);
    const connectionProfile = readConnectionProfile(event.payload['connectionProfile']);
    const executionPreference = readExecutionPreference(event.payload['executionPreference']);
    const preference = readRoutingPreference(event.payload['preference']);
    const providers = readModelProviderOptions(event.payload['providers']);
    const modelId = readString(event.payload['modelId']);

    if (!provider && !defaults && !models && !state && !connectionProfile && !executionPreference && !preference && !providers) {
        return false;
    }

    patchProviderCache({
        utils,
        profileId,
        providerId,
        ...(provider ? { provider } : {}),
        ...(defaults ? { defaults } : {}),
        ...(models ? { models } : {}),
        ...(state ? { authState: state } : {}),
        ...(connectionProfile ? { connectionProfile } : {}),
        ...(executionPreference ? { executionPreference } : {}),
        ...(preference ? { routingPreference: preference } : {}),
        ...(providers ? { routingProviders: providers } : {}),
        ...(modelId ? { routingModelId: modelId } : {}),
    });

    utils.runtime.getShellBootstrap.setData({ profileId }, (current) => {
        if (!current) {
            return current;
        }

        const nextProviders = current.providers.map((candidate) => {
            const providerValue = provider && candidate.id === provider.id ? provider : candidate;
            if (state && providerValue.id === providerId) {
                return {
                    ...providerValue,
                    authState: state.authState,
                    authMethod: state.authMethod,
                };
            }

            return providerValue;
        });

        return {
            ...current,
            providers: nextProviders,
            ...(defaults ? { defaults } : {}),
            ...(models ? { providerModels: replaceProviderModels(current.providerModels, models) } : {}),
        };
    });

    return true;
}
