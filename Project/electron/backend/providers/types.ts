import type { ProviderAdapterResult as AdapterResult } from '@/app/backend/providers/adapters/errors';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type {
    ComposerImageAttachmentInput,
    KiloDynamicSort,
    OpenAIExecutionMode,
    ProviderAuthMethod,
    RuntimeMessagePartType,
    RuntimeRequestedTransportFamily,
    RuntimeReasoningEffort,
    RuntimeReasoningSummary,
    RuntimeRunOptions,
} from '@/app/backend/runtime/contracts';

export type ProviderModelModality = 'text' | 'audio' | 'image' | 'video' | 'pdf';
export type ProviderToolProtocol =
    | 'openai_responses'
    | 'openai_chat_completions'
    | 'kilo_gateway'
    | 'provider_native'
    | 'anthropic_messages'
    | 'google_generativeai';
export type ProviderRuntimeTransportFamily = ProviderToolProtocol | 'openai_realtime_websocket';

export type ProviderApiFamily =
    | 'openai_compatible'
    | 'kilo_gateway'
    | 'provider_native'
    | 'anthropic_messages'
    | 'google_generativeai';
export type ProviderRoutedApiFamily = Exclude<ProviderApiFamily, 'kilo_gateway'>;

export interface ProviderModelFeatureSet {
    supportsTools: boolean;
    supportsReasoning: boolean;
    supportsVision: boolean;
    supportsAudioInput: boolean;
    supportsAudioOutput: boolean;
    supportsPromptCache?: boolean;
    inputModalities: ProviderModelModality[];
    outputModalities: ProviderModelModality[];
}

export interface OpenAIResponsesRuntimeDescriptor {
    toolProtocol: 'openai_responses';
    apiFamily: 'openai_compatible';
    supportsRealtimeWebSocket?: boolean;
}

export interface OpenAIChatCompletionsRuntimeDescriptor {
    toolProtocol: 'openai_chat_completions';
    apiFamily: 'openai_compatible';
}

export interface AnthropicMessagesRuntimeDescriptor {
    toolProtocol: 'anthropic_messages';
    apiFamily: 'anthropic_messages';
}

export interface GoogleGenerativeAiRuntimeDescriptor {
    toolProtocol: 'google_generativeai';
    apiFamily: 'google_generativeai';
}

export interface KiloGatewayRuntimeDescriptor {
    toolProtocol: 'kilo_gateway';
    apiFamily: 'kilo_gateway';
    routedApiFamily: Exclude<ProviderRoutedApiFamily, 'provider_native'>;
}

export interface ProviderNativeRuntimeDescriptor {
    toolProtocol: 'provider_native';
    apiFamily?: ProviderApiFamily;
    providerNativeId: string;
}

export type ProviderRuntimeDescriptor =
    | OpenAIResponsesRuntimeDescriptor
    | OpenAIChatCompletionsRuntimeDescriptor
    | AnthropicMessagesRuntimeDescriptor
    | GoogleGenerativeAiRuntimeDescriptor
    | KiloGatewayRuntimeDescriptor
    | ProviderNativeRuntimeDescriptor;

export interface ProviderModelCapabilities {
    features: ProviderModelFeatureSet;
    runtime: ProviderRuntimeDescriptor;
    promptFamily?: string;
}

export interface ProviderCatalogModel {
    modelId: string;
    label: string;
    upstreamProvider?: string;
    isFree: boolean;
    features: ProviderModelFeatureSet;
    runtime: ProviderRuntimeDescriptor;
    promptFamily?: string;
    contextLength?: number;
    pricing: Record<string, unknown>;
    raw: Record<string, unknown>;
}

export type MetadataKnownSource = 'provider_api' | 'override_registry' | 'derived_hint' | 'unknown';

export interface NormalizedModelMetadata {
    providerId: FirstPartyProviderId;
    modelId: string;
    label: string;
    source: MetadataKnownSource;
    updatedAt: string;
    sourceProvider?: string;
    isFree?: boolean;
    features: ProviderModelFeatureSet;
    runtime: ProviderRuntimeDescriptor;
    promptFamily?: string;
    contextLength?: number;
    maxOutputTokens?: number;
    inputPrice?: number;
    outputPrice?: number;
    cacheReadPrice?: number;
    cacheWritePrice?: number;
    price?: number;
    latency?: number;
    tps?: number;
    pricing?: Record<string, unknown>;
    raw?: Record<string, unknown>;
}

export interface ProviderCatalogSyncSuccess {
    ok: true;
    status: 'synced' | 'unchanged';
    providerId: FirstPartyProviderId;
    models: ProviderCatalogModel[];
    providerPayload: Record<string, unknown>;
    modelPayload: Record<string, unknown>;
}

export interface ProviderCatalogSyncFailure {
    ok: false;
    status: 'error';
    providerId: FirstPartyProviderId;
    reason: 'auth_required' | 'sync_failed';
    detail?: string;
}

export type ProviderCatalogSyncResult = ProviderCatalogSyncSuccess | ProviderCatalogSyncFailure;

export interface ProviderCatalogAdapter {
    readonly id: FirstPartyProviderId;
    syncCatalog(input: {
        profileId: string;
        authMethod: ProviderAuthMethod | 'none';
        apiKey?: string;
        accessToken?: string;
        organizationId?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult>;
}

export interface ProviderMetadataAdapter {
    readonly id: FirstPartyProviderId;
    fetchCatalog(input: {
        profileId: string;
        authMethod: ProviderAuthMethod | 'none';
        apiKey?: string;
        accessToken?: string;
        organizationId?: string;
        endpointProfile?: string;
        optionProfileId?: string;
        resolvedBaseUrl?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult>;
}

export interface ProviderRuntimeUsage {
    inputTokens?: number;
    outputTokens?: number;
    cachedTokens?: number;
    reasoningTokens?: number;
    totalTokens?: number;
    latencyMs?: number;
    costMicrounits?: number;
}

export interface ProviderRuntimeToolDefinition {
    id: string;
    description: string;
    inputSchema: Record<string, unknown>;
}

export interface ProviderRuntimeToolResult {
    callId: string;
    toolName: string;
    outputText: string;
    isError: boolean;
}

export interface ProviderRuntimePart {
    partType: RuntimeMessagePartType;
    payload: Record<string, unknown>;
}

export interface ProviderRuntimeTransportSelection {
    selected: ProviderRuntimeTransportFamily;
    requested: RuntimeRequestedTransportFamily;
    degraded: boolean;
    degradedReason?: string;
}

export interface ProviderRuntimeCacheApplication {
    strategy: RuntimeRunOptions['cache']['strategy'];
    key?: string;
    applied: boolean;
    reason?: string;
}

export interface ProviderRuntimeHandlers {
    onPart: (part: ProviderRuntimePart) => Promise<void> | void;
    onUsage?: (usage: ProviderRuntimeUsage) => Promise<void> | void;
    onTransportSelected?: (selection: ProviderRuntimeTransportSelection) => Promise<void> | void;
    onCacheResolved?: (result: ProviderRuntimeCacheApplication) => Promise<void> | void;
}

export interface ProviderRuntimeReasoningOptions {
    effort: RuntimeReasoningEffort;
    summary: RuntimeReasoningSummary;
    includeEncrypted: boolean;
}

export interface ProviderRuntimeCacheOptions {
    strategy: RuntimeRunOptions['cache']['strategy'];
    key?: string;
}

export interface ProviderRuntimeTransportOptions {
    family: RuntimeRequestedTransportFamily;
}

export interface ProviderRuntimeExecutionOptions {
    openAIExecutionMode?: OpenAIExecutionMode;
}

export interface ProviderRuntimeInput {
    profileId: string;
    sessionId: string;
    runId: string;
    providerId: FirstPartyProviderId;
    modelId: string;
    runtime: ProviderRuntimeDescriptor;
    promptText: string;
    contextMessages?: Array<{
        role: 'system' | 'user' | 'assistant' | 'tool';
        parts: Array<
            | {
                  type: 'text';
                  text: string;
              }
            | {
                  type: 'image';
                  dataUrl: string;
                  mimeType: ComposerImageAttachmentInput['mimeType'];
                  width: number;
                  height: number;
              }
            | {
                  type: 'reasoning';
                  text: string;
                  detailType?: string;
                  detailId?: string;
                  detailFormat?: string;
                  detailSignature?: string;
                  detailIndex?: number;
              }
            | {
                  type: 'reasoning_summary';
                  text: string;
                  detailType?: string;
                  detailId?: string;
                  detailFormat?: string;
                  detailSignature?: string;
                  detailIndex?: number;
              }
            | {
                  type: 'reasoning_encrypted';
                  opaque: unknown;
                  detailType?: string;
                  detailId?: string;
                  detailFormat?: string;
                  detailSignature?: string;
                  detailIndex?: number;
              }
            | {
                  type: 'tool_call';
                  callId: string;
                  toolName: string;
                  argumentsText: string;
              }
            | {
                  type: 'tool_result';
                  callId: string;
                  toolName: string;
                  outputText: string;
                  isError: boolean;
              }
        >;
    }>;
    tools?: ProviderRuntimeToolDefinition[];
    toolResults?: ProviderRuntimeToolResult[];
    toolChoice?: 'auto';
    runtimeOptions: {
        reasoning: ProviderRuntimeReasoningOptions;
        cache: ProviderRuntimeCacheOptions;
        transport: ProviderRuntimeTransportOptions;
        execution: ProviderRuntimeExecutionOptions;
    };
    cache: ProviderRuntimeCacheApplication;
    authMethod: ProviderAuthMethod | 'none';
    apiKey?: string;
    accessToken?: string;
    organizationId?: string;
    kiloRouting?:
        | {
              mode: 'dynamic';
              sort: KiloDynamicSort;
          }
        | {
              mode: 'pinned';
              providerId: string;
          };
    signal: AbortSignal;
}

export interface ProviderRuntimeAdapter {
    streamCompletion(
        input: ProviderRuntimeInput,
        handlers: ProviderRuntimeHandlers
    ): Promise<ProviderAdapterResult<void>>;
}

export type ProviderAdapterResult<T> = AdapterResult<T>;

export interface ProviderAdapter extends ProviderCatalogAdapter, ProviderRuntimeAdapter {}
