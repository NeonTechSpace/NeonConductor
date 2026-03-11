import { kiloDynamicSorts, kiloRoutingModes } from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readEnumValue,
    readOptionalBoolean,
    readOptionalString,
    readProfileId,
    readProviderAuthMethod,
    readProviderId,
    readObject,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import { parseProfileInput } from '@/app/backend/runtime/contracts/parsers/profile';
import type {
    ProviderByIdInput,
    ProviderCancelAuthInput,
    ProviderClearAuthInput,
    ProviderCompleteAuthInput,
    ProviderGetCredentialInput,
    ProviderGetEndpointProfileInput,
    ProviderGetAccountContextInput,
    ProviderListAuthMethodsInput,
    ProviderListModelProvidersInput,
    ProviderListModelsInput,
    ProviderListProvidersInput,
    ProviderPollAuthInput,
    ProviderRefreshAuthInput,
    ProviderSetEndpointProfileInput,
    ProviderGetModelRoutingPreferenceInput,
    ProviderSetModelRoutingPreferenceInput,
    ProviderSetApiKeyInput,
    ProviderSetDefaultInput,
    ProviderSetOrganizationInput,
    ProviderStartAuthInput,
    ProviderSyncCatalogInput,
    ProviderFlowInput,
} from '@/app/backend/runtime/contracts/types';

export function parseProviderSetDefaultInput(input: unknown): ProviderSetDefaultInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        modelId: readString(source.modelId, 'modelId'),
    };
}

export function parseProviderListProvidersInput(input: unknown): ProviderListProvidersInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
    };
}

export function parseProviderByIdInput(input: unknown): ProviderByIdInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
    };
}

export function parseProviderListModelsInput(input: unknown): ProviderListModelsInput {
    return parseProviderByIdInput(input);
}

export function parseProviderSetApiKeyInput(input: unknown): ProviderSetApiKeyInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        apiKey: readString(source.apiKey, 'apiKey'),
    };
}

export function parseProviderGetCredentialInput(input: unknown): ProviderGetCredentialInput {
    return parseProviderByIdInput(input);
}

export function parseProviderClearAuthInput(input: unknown): ProviderClearAuthInput {
    return parseProviderByIdInput(input);
}

export function parseProviderSyncCatalogInput(input: unknown): ProviderSyncCatalogInput {
    const source = readObject(input, 'input');
    const force = readOptionalBoolean(source.force, 'force');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        ...(force !== undefined ? { force } : {}),
    };
}

export function parseProviderListAuthMethodsInput(input: unknown): ProviderListAuthMethodsInput {
    return parseProfileInput(input);
}

export function parseProviderStartAuthInput(input: unknown): ProviderStartAuthInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        method: readProviderAuthMethod(source.method, 'method'),
    };
}

export function parseProviderFlowInput(input: unknown): ProviderFlowInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        flowId: readString(source.flowId, 'flowId'),
    };
}

export function parseProviderPollAuthInput(input: unknown): ProviderPollAuthInput {
    return parseProviderFlowInput(input);
}

export function parseProviderCompleteAuthInput(input: unknown): ProviderCompleteAuthInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        flowId: readString(source.flowId, 'flowId'),
        ...(source.code !== undefined ? { code: readString(source.code, 'code') } : {}),
    };
}

export function parseProviderCancelAuthInput(input: unknown): ProviderCancelAuthInput {
    return parseProviderFlowInput(input);
}

export function parseProviderRefreshAuthInput(input: unknown): ProviderRefreshAuthInput {
    return parseProviderByIdInput(input);
}

export function parseProviderGetAccountContextInput(input: unknown): ProviderGetAccountContextInput {
    return parseProviderByIdInput(input);
}

export function parseProviderSetOrganizationInput(input: unknown): ProviderSetOrganizationInput {
    const source = readObject(input, 'input');
    const providerId = readProviderId(source.providerId, 'providerId');
    if (providerId !== 'kilo') {
        throw new Error('Invalid "providerId": organization selection is supported only for "kilo".');
    }

    const organizationId =
        source.organizationId === null ? null : readOptionalString(source.organizationId, 'organizationId');

    return {
        profileId: readProfileId(source),
        providerId,
        ...(organizationId !== undefined ? { organizationId } : {}),
    };
}

export function parseProviderGetEndpointProfileInput(input: unknown): ProviderGetEndpointProfileInput {
    return parseProviderByIdInput(input);
}

export function parseProviderSetEndpointProfileInput(input: unknown): ProviderSetEndpointProfileInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        providerId: readProviderId(source.providerId, 'providerId'),
        value: readString(source.value, 'value'),
    };
}

function readKiloProviderId(value: unknown, field: string): 'kilo' {
    const providerId = readProviderId(value, field);
    if (providerId !== 'kilo') {
        throw new Error('Invalid "providerId": routing preferences are supported only for "kilo".');
    }

    return providerId;
}

export function parseProviderGetModelRoutingPreferenceInput(input: unknown): ProviderGetModelRoutingPreferenceInput {
    const source = readObject(input, 'input');
    return {
        profileId: readProfileId(source),
        providerId: readKiloProviderId(source.providerId, 'providerId'),
        modelId: readString(source.modelId, 'modelId'),
    };
}

export function parseProviderSetModelRoutingPreferenceInput(input: unknown): ProviderSetModelRoutingPreferenceInput {
    const source = readObject(input, 'input');
    const routingMode = readEnumValue(source.routingMode, 'routingMode', kiloRoutingModes);
    const sort = readOptionalString(source.sort, 'sort');
    const pinnedProviderId = readOptionalString(source.pinnedProviderId, 'pinnedProviderId');

    if (routingMode === 'dynamic') {
        if (pinnedProviderId) {
            throw new Error('Invalid "pinnedProviderId": not allowed when routingMode is "dynamic".');
        }
        if (!sort) {
            throw new Error('Invalid "sort": required when routingMode is "dynamic".');
        }
        return {
            profileId: readProfileId(source),
            providerId: readKiloProviderId(source.providerId, 'providerId'),
            modelId: readString(source.modelId, 'modelId'),
            routingMode,
            sort: readEnumValue(sort, 'sort', kiloDynamicSorts),
        };
    }

    if (sort) {
        throw new Error('Invalid "sort": not allowed when routingMode is "pinned".');
    }
    if (!pinnedProviderId) {
        throw new Error('Invalid "pinnedProviderId": required when routingMode is "pinned".');
    }

    return {
        profileId: readProfileId(source),
        providerId: readKiloProviderId(source.providerId, 'providerId'),
        modelId: readString(source.modelId, 'modelId'),
        routingMode,
        pinnedProviderId,
    };
}

export function parseProviderListModelProvidersInput(input: unknown): ProviderListModelProvidersInput {
    return parseProviderGetModelRoutingPreferenceInput(input);
}

export const providerSetDefaultInputSchema = createParser(parseProviderSetDefaultInput);
export const providerListProvidersInputSchema = createParser(parseProviderListProvidersInput);
export const providerListModelsInputSchema = createParser(parseProviderListModelsInput);
export const providerByIdInputSchema = createParser(parseProviderByIdInput);
export const providerSetApiKeyInputSchema = createParser(parseProviderSetApiKeyInput);
export const providerGetCredentialInputSchema = createParser(parseProviderGetCredentialInput);
export const providerClearAuthInputSchema = createParser(parseProviderClearAuthInput);
export const providerSyncCatalogInputSchema = createParser(parseProviderSyncCatalogInput);
export const providerListAuthMethodsInputSchema = createParser(parseProviderListAuthMethodsInput);
export const providerStartAuthInputSchema = createParser(parseProviderStartAuthInput);
export const providerPollAuthInputSchema = createParser(parseProviderPollAuthInput);
export const providerCompleteAuthInputSchema = createParser(parseProviderCompleteAuthInput);
export const providerCancelAuthInputSchema = createParser(parseProviderCancelAuthInput);
export const providerRefreshAuthInputSchema = createParser(parseProviderRefreshAuthInput);
export const providerGetAccountContextInputSchema = createParser(parseProviderGetAccountContextInput);
export const providerGetEndpointProfileInputSchema = createParser(parseProviderGetEndpointProfileInput);
export const providerSetEndpointProfileInputSchema = createParser(parseProviderSetEndpointProfileInput);
export const providerSetOrganizationInputSchema = createParser(parseProviderSetOrganizationInput);
export const providerGetModelRoutingPreferenceInputSchema = createParser(parseProviderGetModelRoutingPreferenceInput);
export const providerSetModelRoutingPreferenceInputSchema = createParser(parseProviderSetModelRoutingPreferenceInput);
export const providerListModelProvidersInputSchema = createParser(parseProviderListModelProvidersInput);
