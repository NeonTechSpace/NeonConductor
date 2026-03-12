import { getProviderCatalogBehavior } from '@/app/backend/providers/behaviors';
import type { KiloGatewayModel } from '@/app/backend/providers/kiloGatewayClient/types';
import type { ProviderCatalogModel, ProviderRoutedApiFamily } from '@/app/backend/providers/types';

interface NormalizeKiloModelInput {
    providerIds: ReadonlySet<string>;
    modelsByProviderIndex: ReadonlyMap<string, ReadonlySet<string>>;
}

export function buildModelsByProviderIndex(
    payload: Array<{ providerId: string; modelIds: string[] }>
): Map<string, ReadonlySet<string>> {
    const index = new Map<string, Set<string>>();
    for (const entry of payload) {
        index.set(entry.providerId, new Set(entry.modelIds));
    }

    return index;
}

export function buildProviderIdSet(payload: Array<{ id: string }>): Set<string> {
    return new Set(payload.map((entry) => entry.id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseExplicitRoutedApiFamily(value: unknown): ProviderRoutedApiFamily | undefined {
    if (value === 'openai_compatible' || value === 'provider_native' || value === 'anthropic_messages' || value === 'google_generativeai') {
        return value;
    }

    return undefined;
}

function hasProviderNativeHint(raw: Record<string, unknown>): boolean {
    const providerNativeId = raw['provider_native_id'];
    if (typeof providerNativeId === 'string' && providerNativeId.trim().length > 0) {
        return true;
    }

    const providerSettings = isRecord(raw['provider_settings']) ? raw['provider_settings'] : undefined;
    return typeof providerSettings?.['providerNativeId'] === 'string';
}

function mapUpstreamProviderToRoutedApiFamily(providerId: string): ProviderRoutedApiFamily {
    if (providerId === 'anthropic') {
        return 'anthropic_messages';
    }

    if (providerId === 'google' || providerId === 'google-ai-studio' || providerId === 'vertex-ai') {
        return 'google_generativeai';
    }

    return 'openai_compatible';
}

function deriveKiloRoutedApiFamily(
    model: KiloGatewayModel,
    input: NormalizeKiloModelInput
): ProviderRoutedApiFamily | undefined {
    const explicitFamily =
        parseExplicitRoutedApiFamily(model.raw['routed_api_family']) ??
        parseExplicitRoutedApiFamily(model.raw['routedApiFamily']) ??
        parseExplicitRoutedApiFamily(model.raw['upstream_api_family']) ??
        parseExplicitRoutedApiFamily(model.raw['upstreamApiFamily']);
    if (explicitFamily) {
        return explicitFamily;
    }

    if (hasProviderNativeHint(model.raw)) {
        return 'provider_native';
    }

    const upstreamProvider = model.upstreamProvider?.trim().toLowerCase();
    if (!upstreamProvider) {
        return undefined;
    }

    if (upstreamProvider === 'kilo') {
        return 'openai_compatible';
    }

    const providerMembership = input.modelsByProviderIndex.get(upstreamProvider)?.has(model.id) ?? false;
    const providerListed = input.providerIds.has(upstreamProvider);
    if (!providerMembership && !providerListed) {
        return undefined;
    }

    return mapUpstreamProviderToRoutedApiFamily(upstreamProvider);
}

export function normalizeKiloModel(model: KiloGatewayModel, input: NormalizeKiloModelInput): ProviderCatalogModel {
    const behavior = getProviderCatalogBehavior('kilo');
    const capabilities = behavior.createCapabilities({
        modelId: model.id,
        supportedParameters: model.supportedParameters,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
        ...(model.promptFamily !== undefined ? { promptFamily: model.promptFamily } : {}),
    });
    const routedApiFamily = deriveKiloRoutedApiFamily(model, input);

    return {
        modelId: model.id,
        label: model.name,
        ...(model.upstreamProvider ? { upstreamProvider: model.upstreamProvider } : {}),
        isFree: model.id.endsWith(':free'),
        capabilities: {
            ...capabilities,
            toolProtocol: 'kilo_gateway',
            apiFamily: 'kilo_gateway',
            ...(routedApiFamily ? { routedApiFamily } : {}),
            ...(typeof model.pricing['cache_read'] === 'number' || typeof model.pricing['cache_write'] === 'number'
                ? { supportsPromptCache: true }
                : {}),
        },
        ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
        pricing: model.pricing,
        raw: model.raw,
    };
}
