import type { ProviderAdapterResult as AdapterResult } from '@/app/backend/providers/adapters/errors';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type {
    ComposerImageAttachmentInput,
    KiloDynamicSort,
    ProviderAuthMethod,
    RuntimeMessagePartType,
    RuntimeOpenAITransport,
    RuntimeReasoningEffort,
    RuntimeReasoningSummary,
    RuntimeRunOptions,
} from '@/app/backend/runtime/contracts';

export type ProviderModelModality = 'text' | 'audio' | 'image' | 'video' | 'pdf';

export interface ProviderModelCapabilities {
    supportsTools: boolean;
    supportsReasoning: boolean;
    supportsVision: boolean;
    supportsAudioInput: boolean;
    supportsAudioOutput: boolean;
    inputModalities: ProviderModelModality[];
    outputModalities: ProviderModelModality[];
    promptFamily?: string;
}

export interface ProviderCatalogModel {
    modelId: string;
    label: string;
    upstreamProvider?: string;
    isFree: boolean;
    capabilities: ProviderModelCapabilities;
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
    supportsTools?: boolean;
    supportsReasoning?: boolean;
    supportsVision?: boolean;
    supportsAudioInput?: boolean;
    supportsAudioOutput?: boolean;
    inputModalities?: ProviderModelModality[];
    outputModalities?: ProviderModelModality[];
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
    selected: 'responses' | 'chat_completions';
    requested: RuntimeOpenAITransport;
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
    openai: RuntimeOpenAITransport;
}

export interface ProviderRuntimeInput {
    profileId: string;
    sessionId: string;
    runId: string;
    providerId: FirstPartyProviderId;
    modelId: string;
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
