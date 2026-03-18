import type { StaticProviderModelDefinition } from '@/app/backend/providers/metadata/staticCatalog/modelDefinition';

const STATIC_SOURCE_NOTE = 'official_docs_curated_static_registry';
const STATIC_UPDATED_AT = '2026-03-17';
const DEFAULT_AVAILABILITY = { default: true };
const DEFAULT_RECOMMENDED = { default: true };
const TEXT_INPUT: Array<'text'> = ['text'];
const TEXT_OUTPUT: Array<'text'> = ['text'];
const TEXT_IMAGE_INPUT: Array<'text' | 'image'> = ['text', 'image'];

interface OpenAIModelOptions {
    modelName: string;
    label: string;
    contextLength: number;
    maxOutputTokens: number;
    supportsReasoning: boolean;
    supportsVision: boolean;
    supportsPromptCache?: boolean;
    supportsRealtimeWebSocket?: boolean;
    promptFamily?: string;
    recommended?: boolean;
}

function createOpenAIResponsesModelDefinition(options: OpenAIModelOptions): StaticProviderModelDefinition {
    return {
        providerId: 'openai',
        modelId: `openai/${options.modelName}`,
        label: options.label,
        availabilityByEndpointProfile: DEFAULT_AVAILABILITY,
        ...(options.recommended ? { recommendedByEndpointProfile: DEFAULT_RECOMMENDED } : {}),
        supportsTools: true,
        supportsReasoning: options.supportsReasoning,
        supportsVision: options.supportsVision,
        ...(options.supportsPromptCache !== undefined ? { supportsPromptCache: options.supportsPromptCache } : {}),
        ...(options.supportsRealtimeWebSocket !== undefined
            ? { supportsRealtimeWebSocket: options.supportsRealtimeWebSocket }
            : {}),
        toolProtocol: 'openai_responses',
        apiFamily: 'openai_compatible',
        inputModalities: options.supportsVision ? TEXT_IMAGE_INPUT : TEXT_INPUT,
        outputModalities: TEXT_OUTPUT,
        ...(options.promptFamily ? { promptFamily: options.promptFamily } : {}),
        contextLength: options.contextLength,
        maxOutputTokens: options.maxOutputTokens,
        sourceNote: STATIC_SOURCE_NOTE,
        updatedAt: STATIC_UPDATED_AT,
    };
}

function createGpt5FamilyModelDefinition(
    modelName: string,
    label: string,
    options: Pick<OpenAIModelOptions, 'promptFamily' | 'recommended'> = {}
): StaticProviderModelDefinition {
    return createOpenAIResponsesModelDefinition({
        modelName,
        label,
        contextLength: 400_000,
        maxOutputTokens: 128_000,
        supportsReasoning: true,
        supportsVision: true,
        supportsPromptCache: true,
        supportsRealtimeWebSocket: true,
        ...options,
    });
}

function createStandardVisionModelDefinition(
    modelName: string,
    label: string,
    options: Pick<OpenAIModelOptions, 'supportsReasoning' | 'supportsPromptCache' | 'supportsRealtimeWebSocket'> = {
        supportsReasoning: false,
        supportsRealtimeWebSocket: true,
    }
): StaticProviderModelDefinition {
    return createOpenAIResponsesModelDefinition({
        modelName,
        label,
        contextLength: 128_000,
        maxOutputTokens: 32_000,
        supportsVision: true,
        supportsReasoning: options.supportsReasoning,
        ...(options.supportsRealtimeWebSocket !== undefined
            ? { supportsRealtimeWebSocket: options.supportsRealtimeWebSocket }
            : {}),
        ...(options.supportsPromptCache !== undefined ? { supportsPromptCache: options.supportsPromptCache } : {}),
    });
}

function createStandardTextModelDefinition(
    modelName: string,
    label: string,
    options: Pick<OpenAIModelOptions, 'contextLength' | 'maxOutputTokens' | 'supportsReasoning' | 'supportsPromptCache' | 'supportsRealtimeWebSocket'>
): StaticProviderModelDefinition {
    return createOpenAIResponsesModelDefinition({
        modelName,
        label,
        supportsVision: false,
        ...options,
    });
}

export const OPENAI_MODELS: StaticProviderModelDefinition[] = [
    createStandardTextModelDefinition('gpt-3.5-turbo', 'GPT-3.5 Turbo', {
        contextLength: 16_000,
        maxOutputTokens: 4_000,
        supportsReasoning: false,
        supportsRealtimeWebSocket: true,
    }),
    createStandardVisionModelDefinition('gpt-4.1', 'GPT-4.1'),
    createStandardVisionModelDefinition('gpt-4.1-mini', 'GPT-4.1 Mini'),
    createStandardVisionModelDefinition('gpt-4.1-nano', 'GPT-4.1 Nano'),
    createStandardVisionModelDefinition('gpt-4o', 'GPT-4o'),
    createStandardVisionModelDefinition('gpt-4o-mini', 'GPT-4o Mini'),
    createGpt5FamilyModelDefinition('gpt-5', 'GPT-5'),
    createGpt5FamilyModelDefinition('gpt-5-chat-latest', 'GPT-5 Chat Latest'),
    createGpt5FamilyModelDefinition('gpt-5-codex', 'GPT-5 Codex', {
        promptFamily: 'codex',
        recommended: true,
    }),
    createGpt5FamilyModelDefinition('gpt-5-mini', 'GPT-5 Mini'),
    createGpt5FamilyModelDefinition('gpt-5-nano', 'GPT-5 Nano'),
    createGpt5FamilyModelDefinition('gpt-5-pro', 'GPT-5 Pro'),
    createGpt5FamilyModelDefinition('gpt-5.1', 'GPT-5.1'),
    createGpt5FamilyModelDefinition('gpt-5.1-chat-latest', 'GPT-5.1 Chat Latest'),
    createGpt5FamilyModelDefinition('gpt-5.1-codex', 'GPT-5.1 Codex', {
        promptFamily: 'codex',
    }),
    createGpt5FamilyModelDefinition('gpt-5.1-codex-max', 'GPT-5.1 Codex Max', {
        promptFamily: 'codex',
    }),
    createGpt5FamilyModelDefinition('gpt-5.1-codex-mini', 'GPT-5.1 Codex Mini', {
        promptFamily: 'codex',
    }),
    createGpt5FamilyModelDefinition('gpt-5.2', 'GPT-5.2'),
    createGpt5FamilyModelDefinition('gpt-5.2-chat-latest', 'GPT-5.2 Chat Latest'),
    createGpt5FamilyModelDefinition('gpt-5.2-codex', 'GPT-5.2 Codex', {
        promptFamily: 'codex',
    }),
    createGpt5FamilyModelDefinition('gpt-5.2-pro', 'GPT-5.2 Pro'),
    createGpt5FamilyModelDefinition('gpt-5.3-chat-latest', 'GPT-5.3 Chat Latest'),
    createGpt5FamilyModelDefinition('gpt-5.3-codex', 'GPT-5.3 Codex', {
        promptFamily: 'codex',
    }),
    createGpt5FamilyModelDefinition('gpt-5.4', 'GPT-5.4'),
    createGpt5FamilyModelDefinition('gpt-5.4-pro', 'GPT-5.4 Pro'),
    createStandardTextModelDefinition('gpt-realtime', 'GPT Realtime', {
        contextLength: 128_000,
        maxOutputTokens: 32_000,
        supportsReasoning: true,
        supportsRealtimeWebSocket: true,
    }),
    createStandardTextModelDefinition('gpt-realtime-1.5', 'GPT Realtime 1.5', {
        contextLength: 128_000,
        maxOutputTokens: 32_000,
        supportsReasoning: true,
        supportsRealtimeWebSocket: true,
    }),
    createStandardTextModelDefinition('gpt-realtime-mini', 'GPT Realtime Mini', {
        contextLength: 128_000,
        maxOutputTokens: 32_000,
        supportsReasoning: true,
        supportsRealtimeWebSocket: true,
    }),
    createStandardTextModelDefinition('o1', 'o1', {
        contextLength: 128_000,
        maxOutputTokens: 32_000,
        supportsReasoning: true,
        supportsRealtimeWebSocket: true,
    }),
    createStandardVisionModelDefinition('o3', 'o3', {
        supportsReasoning: true,
        supportsRealtimeWebSocket: true,
    }),
    createStandardVisionModelDefinition('o3-mini', 'o3 Mini', {
        supportsReasoning: true,
        supportsRealtimeWebSocket: true,
    }),
    createStandardVisionModelDefinition('o4-mini', 'o4 Mini', {
        supportsReasoning: true,
        supportsRealtimeWebSocket: true,
    }),
];
