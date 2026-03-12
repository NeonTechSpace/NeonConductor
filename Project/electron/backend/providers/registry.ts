import { err, ok, type Result } from 'neverthrow';

import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { appLog } from '@/app/main/logging';

import {
    firstPartyProviderIds,
    providerIds,
    type FirstPartyProviderId,
} from '@/shared/contracts/enums';

export { firstPartyProviderIds, providerIds };
export type { FirstPartyProviderId };

export interface UnsupportedProviderIdError {
    code: 'provider_not_supported';
    message: string;
}

export type SupportedProviderIdResult = Result<FirstPartyProviderId, UnsupportedProviderIdError>;

export type ProviderCatalogStrategy = 'dynamic' | 'static';

export interface ProviderEndpointProfileDefinition {
    value: string;
    label: string;
    isDefault?: boolean;
}

export interface ProviderApiKeyCta {
    label: string;
    url: string;
}

export type ProviderAuthMethodValue = 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';

export interface ProviderDefinition {
    id: FirstPartyProviderId;
    label: string;
    supportsByok: boolean;
    catalogStrategy: ProviderCatalogStrategy;
    authMethods: ProviderAuthMethodValue[];
    endpointProfiles: ProviderEndpointProfileDefinition[];
    supportsKiloRouting: boolean;
    supportsModelProviderListing: boolean;
    supportsCustomBaseUrl: boolean;
    supportsOrganizationScope: boolean;
}

const providerDefinitions: Record<FirstPartyProviderId, ProviderDefinition> = {
    kilo: {
        id: 'kilo',
        label: 'Kilo',
        supportsByok: false,
        catalogStrategy: 'dynamic',
        authMethods: ['device_code', 'api_key'],
        endpointProfiles: [{ value: 'gateway', label: 'Gateway', isDefault: true }],
        supportsKiloRouting: true,
        supportsModelProviderListing: true,
        supportsCustomBaseUrl: false,
        supportsOrganizationScope: true,
    },
    openai: {
        id: 'openai',
        label: 'OpenAI',
        supportsByok: true,
        catalogStrategy: 'static',
        authMethods: ['api_key', 'oauth_pkce', 'oauth_device'],
        endpointProfiles: [{ value: 'default', label: 'Default', isDefault: true }],
        supportsKiloRouting: false,
        supportsModelProviderListing: false,
        supportsCustomBaseUrl: true,
        supportsOrganizationScope: false,
    },
    zai: {
        id: 'zai',
        label: 'Z.AI',
        supportsByok: true,
        catalogStrategy: 'static',
        authMethods: ['api_key'],
        endpointProfiles: [
            { value: 'coding_international', label: 'Coding Plan International', isDefault: true },
            { value: 'general_international', label: 'General International' },
        ],
        supportsKiloRouting: false,
        supportsModelProviderListing: false,
        supportsCustomBaseUrl: true,
        supportsOrganizationScope: false,
    },
    moonshot: {
        id: 'moonshot',
        label: 'Moonshot (Kimi)',
        supportsByok: true,
        catalogStrategy: 'static',
        authMethods: ['api_key'],
        endpointProfiles: [
            { value: 'standard_api', label: 'Standard API', isDefault: true },
            { value: 'coding_plan', label: 'Coding Plan' },
        ],
        supportsKiloRouting: false,
        supportsModelProviderListing: false,
        supportsCustomBaseUrl: true,
        supportsOrganizationScope: false,
    },
};

export function listProviderDefinitions(): ProviderDefinition[] {
    return firstPartyProviderIds.map((providerId) => providerDefinitions[providerId]);
}

export function getProviderDefinition(providerId: FirstPartyProviderId): ProviderDefinition {
    return providerDefinitions[providerId];
}

export function getDefaultEndpointProfile(providerId: FirstPartyProviderId): string {
    const provider = getProviderDefinition(providerId);
    const explicitDefault = provider.endpointProfiles.find((profile) => profile.isDefault);
    return explicitDefault?.value ?? provider.endpointProfiles[0]?.value ?? 'default';
}

export function isValidEndpointProfile(providerId: FirstPartyProviderId, value: string): boolean {
    return getProviderDefinition(providerId).endpointProfiles.some((profile) => profile.value === value);
}

export function resolveProviderApiKeyCta(providerId: FirstPartyProviderId, endpointProfile: string): ProviderApiKeyCta {
    if (providerId === 'moonshot') {
        if (endpointProfile === 'coding_plan') {
            return {
                label: 'Get API Key',
                url: 'https://www.kimi.com/code/',
            };
        }

        return {
            label: 'Get API Key',
            url: 'https://platform.moonshot.ai/console/api-keys',
        };
    }

    if (providerId === 'zai') {
        return {
            label: 'Get API Key',
            url: 'https://z.ai/manage-apikey/apikey-list',
        };
    }

    if (providerId === 'openai') {
        return {
            label: 'Get API Key',
            url: 'https://platform.openai.com/api-keys',
        };
    }

    return {
        label: 'Get API Key',
        url: 'https://kilocode.ai',
    };
}

export function isSupportedProviderId(providerId: string): providerId is FirstPartyProviderId {
    return firstPartyProviderIds.some((candidate) => candidate === providerId);
}

export function toSupportedProviderIdResult(providerId: string): SupportedProviderIdResult {
    if (!isSupportedProviderId(providerId)) {
        return err({
            code: 'provider_not_supported',
            message: `Unsupported provider: "${providerId}".`,
        });
    }

    return ok(providerId);
}

export function parseSupportedProviderId(providerId: string): SupportedProviderIdResult {
    return toSupportedProviderIdResult(providerId);
}

export function assertSupportedProviderId(providerId: string): FirstPartyProviderId {
    const result = toSupportedProviderIdResult(providerId);
    if (result.isErr()) {
        appLog.error({
            tag: 'provider.registry',
            message: result.error.message,
            providerId,
        });
        throw new InvariantError(result.error.message);
    }

    return result.value;
}
