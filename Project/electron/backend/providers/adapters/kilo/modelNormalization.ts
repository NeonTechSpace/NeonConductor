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

function mapPromptFamilyToRoutedApiFamily(
    promptFamily: string
): Exclude<ProviderRoutedApiFamily, 'provider_native'> | undefined {
    if (promptFamily === 'anthropic') {
        return 'anthropic_messages';
    }

    if (promptFamily === 'google' || promptFamily === 'gemini') {
        return 'google_generativeai';
    }

    if (promptFamily === 'openai' || promptFamily === 'codex') {
        return 'openai_compatible';
    }

    return undefined;
}

function mapUpstreamProviderToRoutedApiFamily(
    providerId: string
): Exclude<ProviderRoutedApiFamily, 'provider_native'> {
    if (providerId === 'anthropic') {
        return 'anthropic_messages';
    }

    if (
        providerId === 'google' ||
        providerId === 'google-ai-studio' ||
        providerId === 'google-vertex' ||
        providerId === 'vertex-ai'
    ) {
        return 'google_generativeai';
    }

    return 'openai_compatible';
}

function isRecognizedUpstreamProvider(providerId: string): boolean {
    return (
        providerId === 'anthropic' ||
        providerId === 'google' ||
        providerId === 'google-ai-studio' ||
        providerId === 'google-vertex' ||
        providerId === 'vertex-ai' ||
        providerId === 'openai' ||
        providerId === 'moonshotai' ||
        providerId === 'moonshot' ||
        providerId === 'z-ai' ||
        providerId === 'zai' ||
        providerId === 'kilo' ||
        providerId === 'kilo-auto'
    );
}

function getModelNamespace(modelId: string): string | undefined {
    const slashIndex = modelId.indexOf('/');
    if (slashIndex <= 0) {
        return undefined;
    }

    return modelId.slice(0, slashIndex).trim().toLowerCase() || undefined;
}

function deriveKiloRoutedApiFamily(
    model: KiloGatewayModel,
    _input: NormalizeKiloModelInput
): Exclude<ProviderRoutedApiFamily, 'provider_native'> | undefined {
    const explicitFamily =
        parseExplicitRoutedApiFamily(model.raw['routed_api_family']) ??
        parseExplicitRoutedApiFamily(model.raw['routedApiFamily']) ??
        parseExplicitRoutedApiFamily(model.raw['upstream_api_family']) ??
        parseExplicitRoutedApiFamily(model.raw['upstreamApiFamily']);
    if (explicitFamily && explicitFamily !== 'provider_native') {
        return explicitFamily;
    }

    const upstreamProvider = model.upstreamProvider?.trim().toLowerCase();
    if (upstreamProvider && isRecognizedUpstreamProvider(upstreamProvider)) {
        return mapUpstreamProviderToRoutedApiFamily(upstreamProvider);
    }

    const promptFamily = model.promptFamily?.trim().toLowerCase();
    if (promptFamily) {
        const promptFamilyRoutedApiFamily = mapPromptFamilyToRoutedApiFamily(promptFamily);
        if (promptFamilyRoutedApiFamily) {
            return promptFamilyRoutedApiFamily;
        }
    }

    const modelNamespace = getModelNamespace(model.id);
    if (modelNamespace && isRecognizedUpstreamProvider(modelNamespace)) {
        return mapUpstreamProviderToRoutedApiFamily(modelNamespace);
    }

    return undefined;
}

export function normalizeKiloModel(model: KiloGatewayModel, input: NormalizeKiloModelInput): ProviderCatalogModel {
    const behavior = getProviderCatalogBehavior('kilo');
    const features = behavior.createCapabilities({
        modelId: model.id,
        supportedParameters: model.supportedParameters,
        inputModalities: model.inputModalities,
        outputModalities: model.outputModalities,
    });
    const routedApiFamily = deriveKiloRoutedApiFamily(model, input);
    if (!routedApiFamily || hasProviderNativeHint(model.raw)) {
        throw new Error(`Kilo model "${model.id}" is missing a supported routed API family.`);
    }

    return {
        modelId: model.id,
        label: model.name,
        ...(model.upstreamProvider ? { upstreamProvider: model.upstreamProvider } : {}),
        isFree: model.id.endsWith(':free'),
        features: {
            ...features,
            ...(typeof model.pricing['cache_read'] === 'number' || typeof model.pricing['cache_write'] === 'number'
                ? { supportsPromptCache: true }
                : {}),
        },
        runtime: {
            toolProtocol: 'kilo_gateway',
            apiFamily: 'kilo_gateway',
            routedApiFamily,
        },
        ...(model.promptFamily ? { promptFamily: model.promptFamily } : {}),
        ...(model.contextLength !== undefined ? { contextLength: model.contextLength } : {}),
        pricing: model.pricing,
        raw: model.raw,
    };
}
