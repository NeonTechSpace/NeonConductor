import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

export interface OpenAICompatibleResolvedEndpoints {
    chatCompletionsUrl: string;
    responsesUrl: string;
    baseUrl?: string;
}

export interface OpenAICompatibleRuntimeConfig {
    providerId: ProviderRuntimeInput['providerId'];
    modelPrefix: string;
    label: string;
    resolveEndpoints:
        | ((input: ProviderRuntimeInput) => Promise<OpenAICompatibleResolvedEndpoints>)
        | ((input: ProviderRuntimeInput) => OpenAICompatibleResolvedEndpoints);
}

export type OpenAICompatibleExecutionBranch =
    | 'provider_native'
    | 'direct_family'
    | 'realtime_websocket'
    | 'openai_chat_completions'
    | 'openai_responses';

export interface OpenAICompatibleExecutionContext {
    runtimeInput: ProviderRuntimeInput;
    handlers: ProviderRuntimeHandlers;
    config: OpenAICompatibleRuntimeConfig;
    token: string;
    startedAt: number;
    endpoints: OpenAICompatibleResolvedEndpoints;
}

export interface OpenAICompatibleProtocolExecutionInput {
    executionBranch: Extract<OpenAICompatibleExecutionBranch, 'openai_chat_completions' | 'openai_responses'>;
    executionContext: OpenAICompatibleExecutionContext;
}
