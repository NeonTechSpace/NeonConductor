import { settingsStore } from '@/app/backend/persistence/stores';
import { resolveProviderBaseUrl } from '@/app/backend/providers/providerBaseUrls';
import {
    getDefaultEndpointProfile,
    getProviderDefinition,
    isValidEndpointProfile,
    type ProviderEndpointProfileDefinition,
    resolveProviderApiKeyCta,
    type FirstPartyProviderId,
} from '@/app/backend/providers/registry';
import {
    errProviderService,
    okProviderService,
    type ProviderServiceResult,
} from '@/app/backend/providers/service/errors';

function connectionProfileSettingKey(providerId: FirstPartyProviderId): string {
    return `provider_connection_profile:${providerId}`;
}

interface StoredProviderConnectionProfile {
    optionProfileId: string;
    baseUrlOverride?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredProviderConnectionProfile(value: unknown): value is StoredProviderConnectionProfile {
    if (!isRecord(value) || typeof value['optionProfileId'] !== 'string') {
        return false;
    }

    return value['baseUrlOverride'] === undefined || typeof value['baseUrlOverride'] === 'string';
}

function normalizeOptionalString(value: string | null | undefined): string | undefined {
    if (value === null || value === undefined) {
        return undefined;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function buildConnectionProfileOption(definition: ProviderEndpointProfileDefinition): { value: string; label: string } {
    return {
        value: definition.value,
        label: definition.label,
    };
}

function resolveSelectedOption(
    providerId: FirstPartyProviderId,
    storedOptionProfileId: string | undefined
): { optionProfileId: string; definition: ProviderEndpointProfileDefinition } {
    const providerDefinition = getProviderDefinition(providerId);
    const fallbackOptionProfileId = getDefaultEndpointProfile(providerId);
    const optionProfileId =
        storedOptionProfileId && isValidEndpointProfile(providerId, storedOptionProfileId)
            ? storedOptionProfileId
            : fallbackOptionProfileId;
    const definition = providerDefinition.endpointProfiles.find((profile) => profile.value === optionProfileId) ??
        providerDefinition.endpointProfiles[0] ?? {
            value: optionProfileId,
            label: optionProfileId,
        };

    return {
        optionProfileId,
        definition,
    };
}

export interface ProviderConnectionProfileState {
    providerId: FirstPartyProviderId;
    optionProfileId: string;
    label: string;
    options: Array<{ value: string; label: string }>;
    baseUrlOverride?: string;
    resolvedBaseUrl: string | null;
}

export async function getConnectionProfileState(
    profileId: string,
    providerId: FirstPartyProviderId
): Promise<ProviderServiceResult<ProviderConnectionProfileState>> {
    const definition = getProviderDefinition(providerId);
    const stored = await settingsStore.getJsonOptional(
        profileId,
        connectionProfileSettingKey(providerId),
        isStoredProviderConnectionProfile
    );
    const { optionProfileId, definition: selected } = resolveSelectedOption(providerId, stored?.optionProfileId);
    const baseUrlOverride = normalizeOptionalString(stored?.baseUrlOverride);

    return okProviderService({
        providerId,
        optionProfileId,
        label: selected.label,
        options: definition.endpointProfiles.map(buildConnectionProfileOption),
        ...(baseUrlOverride ? { baseUrlOverride } : {}),
        resolvedBaseUrl: baseUrlOverride ?? resolveProviderBaseUrl(providerId, optionProfileId),
    });
}

export async function setConnectionProfileState(
    profileId: string,
    providerId: FirstPartyProviderId,
    input: {
        optionProfileId: string;
        baseUrlOverride?: string | null;
    }
): Promise<ProviderServiceResult<ProviderConnectionProfileState>> {
    if (!isValidEndpointProfile(providerId, input.optionProfileId)) {
        return errProviderService(
            'invalid_payload',
            `Invalid connection profile option "${input.optionProfileId}" for provider "${providerId}".`
        );
    }

    const providerDefinition = getProviderDefinition(providerId);
    const normalizedBaseUrlOverride = normalizeOptionalString(input.baseUrlOverride);
    if (normalizedBaseUrlOverride && !providerDefinition.supportsCustomBaseUrl) {
        return errProviderService(
            'invalid_payload',
            `Provider "${providerId}" does not support custom base URL overrides.`
        );
    }

    await settingsStore.setJson(profileId, connectionProfileSettingKey(providerId), {
        optionProfileId: input.optionProfileId,
        ...(normalizedBaseUrlOverride ? { baseUrlOverride: normalizedBaseUrlOverride } : {}),
    });
    return getConnectionProfileState(profileId, providerId);
}

export async function resolveConnectionProfile(
    profileId: string,
    providerId: FirstPartyProviderId
): Promise<ProviderServiceResult<ProviderConnectionProfileState>> {
    return getConnectionProfileState(profileId, providerId);
}

export async function resolveEndpointProfile(
    profileId: string,
    providerId: FirstPartyProviderId
): Promise<ProviderServiceResult<string>> {
    const state = await getConnectionProfileState(profileId, providerId);
    if (state.isErr()) {
        return errProviderService(state.error.code, state.error.message);
    }
    return okProviderService(state.value.optionProfileId);
}

export async function resolveApiKeyCta(profileId: string, providerId: FirstPartyProviderId) {
    const connectionProfileResult = await resolveConnectionProfile(profileId, providerId);
    if (connectionProfileResult.isErr()) {
        return errProviderService(connectionProfileResult.error.code, connectionProfileResult.error.message);
    }

    return okProviderService(resolveProviderApiKeyCta(providerId, connectionProfileResult.value.optionProfileId));
}
