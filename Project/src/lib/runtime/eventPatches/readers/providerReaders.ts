import { hasRequiredStringFields, isRecord, readBoolean, readLiteral, readString } from '@/web/lib/runtime/eventPatches/readers/shared';

import type { ProviderAuthStateRecord, ProviderModelRecord } from '@/app/backend/persistence/types';
import type {
    KiloModelProviderOption,
    ProviderConnectionProfileResult,
    ProviderListItem,
} from '@/app/backend/providers/service/types';

import {
    kiloDynamicSorts,
    kiloRoutingModes,
    openAIExecutionModes,
    providerAuthMethods,
    providerAuthStates,
    providerIds,
} from '@/shared/contracts';
import type { KiloModelRoutingPreference } from '@/shared/contracts';

const providerCatalogStrategies = ['dynamic', 'static'] as const;

export function readProviderListItem(value: unknown): ProviderListItem | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const id = readLiteral(value['id'], providerIds);
    const label = readString(value['label']);
    const supportsByok = readBoolean(value['supportsByok']);
    const isDefault = readBoolean(value['isDefault']);
    const authMethod = readLiteral(value['authMethod'], [...providerAuthMethods, 'none'] as const);
    const authState = readLiteral(value['authState'], providerAuthStates);
    const availableAuthMethods = Array.isArray(value['availableAuthMethods'])
        ? value['availableAuthMethods']
              .map((entry) => readLiteral(entry, providerAuthMethods))
              .filter((entry): entry is (typeof providerAuthMethods)[number] => entry !== undefined)
        : undefined;
    const connectionProfileValue = value['connectionProfile'];
    const apiKeyCtaValue = value['apiKeyCta'];
    const featuresValue = value['features'];
    const executionPreferenceValue = value['executionPreference'];
    if (
        !id ||
        !label ||
        supportsByok === undefined ||
        isDefault === undefined ||
        !authMethod ||
        !authState ||
        !availableAuthMethods ||
        !isRecord(connectionProfileValue) ||
        !isRecord(apiKeyCtaValue) ||
        !isRecord(featuresValue)
    ) {
        return undefined;
    }

    const connectionProfileLabel = readString(connectionProfileValue['label']);
    const connectionProfileOptionValue = readString(connectionProfileValue['optionProfileId']);
    const connectionProfileOptionsValue = connectionProfileValue['options'];
    if (!Array.isArray(connectionProfileOptionsValue)) {
        return undefined;
    }
    const connectionProfileOptions = connectionProfileOptionsValue
        .map((entry) => {
            if (!isRecord(entry)) {
                return undefined;
            }

            const optionValue = readString(entry['value']);
            const optionLabel = readString(entry['label']);
            return optionValue && optionLabel
                ? {
                      value: optionValue,
                      label: optionLabel,
                  }
                : undefined;
        })
        .filter((entry): entry is { value: string; label: string } => entry !== undefined);
    const apiKeyCtaLabel = readString(apiKeyCtaValue['label']);
    const apiKeyCtaUrl = readString(apiKeyCtaValue['url']);
    const catalogStrategy = readLiteral(featuresValue['catalogStrategy'], providerCatalogStrategies);
    const supportsKiloRouting = readBoolean(featuresValue['supportsKiloRouting']);
    const supportsModelProviderListing = readBoolean(featuresValue['supportsModelProviderListing']);
    const supportsConnectionOptions = readBoolean(featuresValue['supportsConnectionOptions']);
    const supportsCustomBaseUrl = readBoolean(featuresValue['supportsCustomBaseUrl']);
    const supportsOrganizationScope = readBoolean(featuresValue['supportsOrganizationScope']);
    const baseUrlOverride = readString(connectionProfileValue['baseUrlOverride']);
    const resolvedBaseUrl = readString(connectionProfileValue['resolvedBaseUrl']);
    const organizationId =
        connectionProfileValue['organizationId'] === null ? null : readString(connectionProfileValue['organizationId']);
    const executionPreferenceProviderId = isRecord(executionPreferenceValue)
        ? readLiteral(executionPreferenceValue['providerId'], ['openai'] as const)
        : undefined;
    const executionPreferenceMode = isRecord(executionPreferenceValue)
        ? readLiteral(executionPreferenceValue['mode'], openAIExecutionModes)
        : undefined;
    const canUseRealtimeWebSocket = isRecord(executionPreferenceValue)
        ? readBoolean(executionPreferenceValue['canUseRealtimeWebSocket'])
        : undefined;
    const disabledReason = isRecord(executionPreferenceValue)
        ? readLiteral(executionPreferenceValue['disabledReason'], [
              'provider_not_supported',
              'api_key_required',
              'base_url_not_supported',
          ] as const)
        : undefined;
    const executionPreference: ProviderListItem['executionPreference'] =
        executionPreferenceProviderId && executionPreferenceMode && canUseRealtimeWebSocket !== undefined
            ? {
                  providerId: executionPreferenceProviderId,
                  mode: executionPreferenceMode,
                  canUseRealtimeWebSocket,
                  ...(disabledReason ? { disabledReason } : {}),
              }
            : undefined;
    if (
        !connectionProfileOptionValue ||
        !connectionProfileLabel ||
        connectionProfileOptions.length !== connectionProfileOptionsValue.length ||
        !apiKeyCtaLabel ||
        !apiKeyCtaUrl ||
        !catalogStrategy ||
        supportsKiloRouting === undefined ||
        supportsModelProviderListing === undefined ||
        supportsConnectionOptions === undefined ||
        supportsCustomBaseUrl === undefined ||
        supportsOrganizationScope === undefined
    ) {
        return undefined;
    }

    return {
        id,
        label,
        supportsByok,
        isDefault,
        authMethod,
        authState,
        availableAuthMethods,
        connectionProfile: {
            providerId: id,
            optionProfileId: connectionProfileOptionValue,
            label: connectionProfileLabel,
            options: connectionProfileOptions,
            ...(baseUrlOverride ? { baseUrlOverride } : {}),
            resolvedBaseUrl: resolvedBaseUrl ?? null,
            ...(organizationId !== undefined ? { organizationId } : {}),
        },
        ...(executionPreference ? { executionPreference } : {}),
        apiKeyCta: {
            label: apiKeyCtaLabel,
            url: apiKeyCtaUrl,
        },
        features: {
            catalogStrategy,
            supportsKiloRouting,
            supportsModelProviderListing,
            supportsConnectionOptions,
            supportsCustomBaseUrl,
            supportsOrganizationScope,
        },
    };
}

export function readProviderAuthState(value: unknown): ProviderAuthStateRecord | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const profileId = readString(value['profileId']);
    const providerId = readLiteral(value['providerId'], ['openai'] as const);
    const authMethod = readLiteral(value['authMethod'], [...providerAuthMethods, 'none'] as const);
    const authState = readLiteral(value['authState'], providerAuthStates);
    const updatedAt = readString(value['updatedAt']);
    const accountId = readString(value['accountId']);
    const organizationId = readString(value['organizationId']);
    const tokenExpiresAt = readString(value['tokenExpiresAt']);
    const lastErrorCode = readString(value['lastErrorCode']);
    const lastErrorMessage = readString(value['lastErrorMessage']);
    if (!profileId || !providerId || !authMethod || !authState || !updatedAt) {
        return undefined;
    }

    return {
        profileId,
        providerId,
        authMethod,
        authState,
        ...(accountId ? { accountId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(tokenExpiresAt ? { tokenExpiresAt } : {}),
        ...(lastErrorCode ? { lastErrorCode } : {}),
        ...(lastErrorMessage ? { lastErrorMessage } : {}),
        updatedAt,
    };
}

export function readConnectionProfile(value: unknown): ProviderConnectionProfileResult | undefined {
    if (!isRecord(value) || !Array.isArray(value['options'])) {
        return undefined;
    }

    const providerId = readLiteral(value['providerId'], providerIds);
    const optionValue = readString(value['optionProfileId']);
    const label = readString(value['label']);
    const options = value['options']
        .map((entry) => {
            if (!isRecord(entry)) {
                return undefined;
            }

            const value = readString(entry['value']);
            const label = readString(entry['label']);
            return value && label
                ? {
                      value,
                      label,
                  }
                : undefined;
        })
        .filter((entry): entry is { value: string; label: string } => entry !== undefined);
    if (!providerId || !optionValue || !label || options.length !== value['options'].length) {
        return undefined;
    }

    const baseUrlOverride = readString(value['baseUrlOverride']);
    const resolvedBaseUrl = readString(value['resolvedBaseUrl']);
    const organizationId = value['organizationId'] === null ? null : readString(value['organizationId']);

    return {
        providerId,
        optionProfileId: optionValue,
        label,
        options,
        ...(baseUrlOverride ? { baseUrlOverride } : {}),
        resolvedBaseUrl: resolvedBaseUrl ?? null,
        ...(organizationId !== undefined ? { organizationId } : {}),
    };
}

export function readExecutionPreference(value: unknown): ProviderListItem['executionPreference'] | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const providerId = readLiteral(value['providerId'], providerIds);
    const mode = readLiteral(value['mode'], openAIExecutionModes);
    const canUseRealtimeWebSocket = readBoolean(value['canUseRealtimeWebSocket']);
    const disabledReason = readLiteral(value['disabledReason'], [
        'provider_not_supported',
        'api_key_required',
        'base_url_not_supported',
    ] as const);
    if (!providerId || !mode || canUseRealtimeWebSocket === undefined) {
        return undefined;
    }

    return {
        providerId: 'openai',
        mode,
        canUseRealtimeWebSocket,
        ...(disabledReason ? { disabledReason } : {}),
    } satisfies NonNullable<ProviderListItem['executionPreference']>;
}

export function readProviderDefaults(value: unknown): { providerId: string; modelId: string } | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const providerId = readString(value['providerId']);
    const modelId = readString(value['modelId']);
    if (!providerId || !modelId) {
        return undefined;
    }

    return {
        providerId,
        modelId,
    };
}

export function readProviderModels(value: unknown): ProviderModelRecord[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter(
        (entry): entry is ProviderModelRecord => isRecord(entry) && hasRequiredStringFields(entry, ['id', 'providerId'])
    );
}

export function readRoutingPreference(value: unknown): KiloModelRoutingPreference | undefined {
    if (!isRecord(value)) {
        return undefined;
    }

    const profileId = readString(value['profileId']);
    const providerId = readLiteral(value['providerId'], ['kilo'] as const);
    const modelId = readString(value['modelId']);
    const routingMode = readLiteral(value['routingMode'], kiloRoutingModes);
    const sort = readLiteral(value['sort'], kiloDynamicSorts);
    const pinnedProviderId = readString(value['pinnedProviderId']);
    if (!profileId || !providerId || !modelId || !routingMode) {
        return undefined;
    }

    return {
        profileId,
        providerId,
        modelId,
        routingMode,
        ...(sort ? { sort } : {}),
        ...(pinnedProviderId ? { pinnedProviderId } : {}),
    };
}

export function readModelProviderOptions(value: unknown): KiloModelProviderOption[] | undefined {
    if (!Array.isArray(value)) {
        return undefined;
    }

    return value.filter(
        (entry): entry is KiloModelProviderOption => isRecord(entry) && hasRequiredStringFields(entry, ['providerId'])
    );
}

export function replaceProviderModels(
    currentModels: ProviderModelRecord[],
    nextModels: ProviderModelRecord[]
): ProviderModelRecord[] {
    if (nextModels.length === 0) {
        return currentModels;
    }

    const providerId = nextModels[0]?.providerId;
    return [...currentModels.filter((model) => model.providerId !== providerId), ...nextModels];
}

