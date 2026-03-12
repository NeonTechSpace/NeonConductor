import { getProviderCatalogBehavior } from '@/app/backend/providers/behaviors';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type { ProviderApiFamily, ProviderCatalogModel, ProviderToolProtocol } from '@/app/backend/providers/types';

export interface StaticProviderModelDefinition {
    providerId: Exclude<FirstPartyProviderId, 'kilo'>;
    modelId: string;
    label: string;
    availabilityByEndpointProfile: Record<string, boolean>;
    recommendedByEndpointProfile?: Record<string, boolean>;
    supportsTools?: boolean;
    supportsReasoning?: boolean;
    supportsVision?: boolean;
    supportsAudioInput?: boolean;
    supportsAudioOutput?: boolean;
    supportsPromptCache?: boolean;
    toolProtocol?: ProviderToolProtocol;
    apiFamily?: ProviderApiFamily;
    inputModalities?: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    outputModalities?: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
    promptFamily?: string;
    contextLength?: number;
    maxOutputTokens?: number;
    inputPrice?: number;
    outputPrice?: number;
    cacheReadPrice?: number;
    cacheWritePrice?: number;
    sourceNote: string;
    updatedAt: string;
}

const STATIC_SOURCE_NOTE = 'official_docs_curated_static_registry';
const STATIC_UPDATED_AT = '2026-03-10';
const TEXT_INPUT: Array<'text'> = ['text'];
const TEXT_OUTPUT: Array<'text'> = ['text'];
const TEXT_IMAGE_INPUT: Array<'text' | 'image'> = ['text', 'image'];

const OPENAI_MODELS: StaticProviderModelDefinition[] = [
    {
        providerId: 'openai',
        modelId: 'openai/gpt-5',
        label: 'GPT-5',
        availabilityByEndpointProfile: { default: true },
        supportsTools: true,
        supportsReasoning: true,
        supportsVision: true,
        supportsPromptCache: true,
        toolProtocol: 'openai_responses',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_IMAGE_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'openai',
        modelId: 'openai/gpt-5-mini',
        label: 'GPT-5 Mini',
        availabilityByEndpointProfile: { default: true },
        supportsTools: true,
        supportsReasoning: true,
        supportsVision: true,
        supportsPromptCache: true,
        toolProtocol: 'openai_responses',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_IMAGE_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'openai',
        modelId: 'openai/gpt-5-nano',
        label: 'GPT-5 Nano',
        availabilityByEndpointProfile: { default: true },
        supportsTools: true,
        supportsReasoning: true,
        supportsVision: true,
        supportsPromptCache: true,
        toolProtocol: 'openai_responses',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_IMAGE_INPUT,
        outputModalities: TEXT_OUTPUT,
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'openai',
        modelId: 'openai/gpt-5-codex',
        label: 'GPT-5 Codex',
        availabilityByEndpointProfile: { default: true },
        recommendedByEndpointProfile: { default: true },
        supportsTools: true,
        supportsReasoning: true,
        supportsVision: true,
        supportsPromptCache: true,
        toolProtocol: 'openai_responses',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_IMAGE_INPUT,
        outputModalities: TEXT_OUTPUT,
        promptFamily: 'codex',
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
    {
        providerId: 'openai',
        modelId: 'openai/codex-mini',
        label: 'Codex Mini',
        availabilityByEndpointProfile: { default: true },
        supportsTools: true,
        supportsReasoning: true,
        supportsVision: true,
        supportsPromptCache: true,
        toolProtocol: 'openai_responses',
        apiFamily: 'openai_compatible',
        inputModalities: TEXT_IMAGE_INPUT,
        outputModalities: TEXT_OUTPUT,
        promptFamily: 'codex',
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    },
];

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
        capabilities: {
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
            ...(definition.toolProtocol ? { toolProtocol: definition.toolProtocol } : {}),
            ...(definition.apiFamily ? { apiFamily: definition.apiFamily } : {}),
        },
        ...(definition.contextLength !== undefined ? { contextLength: definition.contextLength } : {}),
        pricing: toPricing(definition),
        raw: {
            source: definition.sourceNote,
            updatedAt: definition.updatedAt,
            endpointProfile,
            recommended: isRecommendedForEndpoint(definition, endpointProfile),
            ...(definition.maxOutputTokens !== undefined ? { max_output_tokens: definition.maxOutputTokens } : {}),
        },
    };
}
