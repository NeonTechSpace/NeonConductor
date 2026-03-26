import { getProviderCatalogBehavior } from '@/app/backend/providers/behaviors';
import type { StaticProviderModelDefinition } from '@/app/backend/providers/metadata/staticCatalog/modelDefinition';
import { OPENAI_CODEX_MODELS, OPENAI_MODELS } from '@/app/backend/providers/metadata/staticCatalog/openai';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { ProviderCatalogModel, ProviderRuntimeDescriptor } from '@/app/backend/providers/types';

const STATIC_SOURCE_NOTE = 'official_docs_curated_static_registry';
const STATIC_UPDATED_AT = '2026-03-10';
const TEXT_INPUT: Array<'text'> = ['text'];
const TEXT_OUTPUT: Array<'text'> = ['text'];
const TEXT_IMAGE_INPUT: Array<'text' | 'image'> = ['text', 'image'];

const ZAI_MODELS: StaticProviderModelDefinition[] = [
    {
        providerId: 'zai',
        modelId: 'zai/glm-4.5',
        label: 'GLM 4.5',
        availabilityByEndpointProfile: {
            coding_international: true,
            general_international: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 128_000,
        maxOutputTokens: 96_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'zai',
        modelId: 'zai/glm-4.5-air',
        label: 'GLM 4.5 Air',
        availabilityByEndpointProfile: {
            coding_international: true,
            general_international: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 128_000,
        maxOutputTokens: 96_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'zai',
        modelId: 'zai/glm-4.5-flash',
        label: 'GLM 4.5 Flash',
        availabilityByEndpointProfile: {
            coding_international: true,
            general_international: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 128_000,
        maxOutputTokens: 96_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'zai',
        modelId: 'zai/glm-4.5v',
        label: 'GLM 4.5V',
        availabilityByEndpointProfile: {
            coding_international: true,
            general_international: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        supportsVision: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_IMAGE_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 128_000,
        maxOutputTokens: 96_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'zai',
        modelId: 'zai/glm-4.6',
        label: 'GLM 4.6',
        availabilityByEndpointProfile: {
            coding_international: true,
            general_international: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        supportsVision: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_IMAGE_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 128_000,
        maxOutputTokens: 96_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
];

const MOONSHOT_MODELS: StaticProviderModelDefinition[] = [
    {
        providerId: 'moonshot',
        modelId: 'moonshot/kimi-for-coding',
        label: 'Kimi for Coding',
        availabilityByEndpointProfile: {
            coding_plan: true,
            standard_api: false,
        },
        recommendedByEndpointProfile: {
            coding_plan: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        promptFamily: 'codex',
        contextLength: 262_144,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'moonshot',
        modelId: 'moonshot/kimi-k2',
        label: 'Kimi K2',
        availabilityByEndpointProfile: {
            coding_plan: true,
            standard_api: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 262_144,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'moonshot',
        modelId: 'moonshot/kimi-latest',
        label: 'Kimi Latest',
        availabilityByEndpointProfile: {
            coding_plan: true,
            standard_api: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 128_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'moonshot',
        modelId: 'moonshot/kimi-k2-thinking',
        label: 'Kimi K2 Thinking',
        availabilityByEndpointProfile: {
            coding_plan: true,
            standard_api: true,
        },
        recommendedByEndpointProfile: {
            standard_api: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 262_144,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'moonshot',
        modelId: 'moonshot/kimi-k2-thinking-turbo',
        label: 'Kimi K2 Thinking Turbo',
        availabilityByEndpointProfile: {
            coding_plan: true,
            standard_api: true,
        },
        supportsTools: true,
        supportsReasoning: true,
        toolProtocol: 'openai_chat_completions',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 262_144,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
];

const staticRegistry: Record<Exclude<FirstPartyProviderId, 'kilo'>, StaticProviderModelDefinition[]> = {
    openai: OPENAI_MODELS,
    openai_codex: OPENAI_CODEX_MODELS,
    zai: ZAI_MODELS,
    moonshot: MOONSHOT_MODELS,
};

function isAvailableForEndpoint(model: StaticProviderModelDefinition, endpointProfile: string): boolean {
    return model.availabilityByEndpointProfile[endpointProfile] === true;
}

function isRecommendedForEndpoint(model: StaticProviderModelDefinition, endpointProfile: string): boolean {
    return model.recommendedByEndpointProfile?.[endpointProfile] === true;
}

export function listStaticModelDefinitions(
    providerId: Exclude<FirstPartyProviderId, 'kilo'>,
    endpointProfile: string
): StaticProviderModelDefinition[] {
    const source = staticRegistry[providerId];
    return source
        .filter((model) => isAvailableForEndpoint(model, endpointProfile))
        .slice()
        .sort((left, right) => {
            const leftRecommended = isRecommendedForEndpoint(left, endpointProfile);
            const rightRecommended = isRecommendedForEndpoint(right, endpointProfile);
            if (leftRecommended !== rightRecommended) {
                return leftRecommended ? -1 : 1;
            }

            return left.label.localeCompare(right.label);
        });
}

export function findStaticModelDefinition(
    providerId: Exclude<FirstPartyProviderId, 'kilo'>,
    endpointProfile: string,
    modelId: string
): StaticProviderModelDefinition | undefined {
    return listStaticModelDefinitions(providerId, endpointProfile).find((definition) => definition.modelId === modelId);
}

function toPricing(definition: StaticProviderModelDefinition): Record<string, unknown> {
    return {
        ...(definition.inputPrice !== undefined ? { input: definition.inputPrice } : {}),
        ...(definition.outputPrice !== undefined ? { output: definition.outputPrice } : {}),
        ...(definition.cacheReadPrice !== undefined ? { cache_read: definition.cacheReadPrice } : {}),
        ...(definition.cacheWritePrice !== undefined ? { cache_write: definition.cacheWritePrice } : {}),
    };
}

function toRuntimeDescriptor(definition: StaticProviderModelDefinition): ProviderRuntimeDescriptor {
    if (definition.toolProtocol === 'openai_responses') {
        return {
            toolProtocol: 'openai_responses',
            apiFamily: 'openai_compatible',
            ...(definition.supportsRealtimeWebSocket !== undefined
                ? { supportsRealtimeWebSocket: definition.supportsRealtimeWebSocket }
                : {}),
        };
    }

    if (definition.toolProtocol === 'openai_chat_completions') {
        return {
            toolProtocol: 'openai_chat_completions',
            apiFamily: 'openai_compatible',
        };
    }

    if (definition.toolProtocol === 'anthropic_messages') {
        return {
            toolProtocol: 'anthropic_messages',
            apiFamily: 'anthropic_messages',
        };
    }

    if (definition.toolProtocol === 'google_generativeai') {
        return {
            toolProtocol: 'google_generativeai',
            apiFamily: 'google_generativeai',
        };
    }

    if (definition.toolProtocol === 'provider_native' && definition.providerNativeId) {
        return {
            toolProtocol: 'provider_native',
            ...(definition.apiFamily ? { apiFamily: definition.apiFamily } : {}),
            providerNativeId: definition.providerNativeId,
        };
    }

    throw new Error(
        `Static model "${definition.providerId}:${definition.modelId}" is missing a supported runtime descriptor.`
    );
}

export function toStaticProviderCatalogModel(
    definition: StaticProviderModelDefinition,
    endpointProfile: string
): ProviderCatalogModel {
    const behavior = getProviderCatalogBehavior(definition.providerId);
    const capabilities = behavior.createCapabilities({
        modelId: definition.modelId,
        supportedParameters: [
            ...(definition.supportsTools !== false ? ['tools'] : []),
            ...(definition.supportsReasoning !== false ? ['reasoning'] : []),
        ],
        ...(definition.inputModalities ? { inputModalities: definition.inputModalities } : {}),
        ...(definition.outputModalities ? { outputModalities: definition.outputModalities } : {}),
        ...(definition.promptFamily ? { promptFamily: definition.promptFamily } : {}),
    });

    return {
        modelId: definition.modelId,
        label: isRecommendedForEndpoint(definition, endpointProfile)
            ? `${definition.label} (Recommended)`
            : definition.label,
        upstreamProvider: definition.providerId,
        isFree: false,
        features: {
            ...capabilities,
            ...(definition.supportsVision !== undefined ? { supportsVision: definition.supportsVision } : {}),
            ...(definition.supportsAudioInput !== undefined
                ? { supportsAudioInput: definition.supportsAudioInput }
                : {}),
            ...(definition.supportsAudioOutput !== undefined
                ? { supportsAudioOutput: definition.supportsAudioOutput }
                : {}),
            ...(definition.supportsPromptCache !== undefined
                ? { supportsPromptCache: definition.supportsPromptCache }
                : {}),
        },
        runtime: toRuntimeDescriptor(definition),
        ...(definition.promptFamily ? { promptFamily: definition.promptFamily } : {}),
        ...(definition.contextLength !== undefined ? { contextLength: definition.contextLength } : {}),
        pricing: toPricing(definition),
        raw: {
            source: definition.sourceNote,
            updatedAt: definition.updatedAt,
            endpointProfile,
            recommended: isRecommendedForEndpoint(definition, endpointProfile),
            ...(definition.supportsRealtimeWebSocket !== undefined
                ? { supports_realtime_websocket: definition.supportsRealtimeWebSocket }
                : {}),
            ...(definition.maxOutputTokens !== undefined ? { max_output_tokens: definition.maxOutputTokens } : {}),
        },
    };
}
