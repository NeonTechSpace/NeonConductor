import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import type {
    ProviderApiFamily,
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
    ProviderRuntimePart,
    ProviderRuntimeTransportSelection,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';
import type { ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import type { RuntimeParsedCompletion } from '@/app/backend/providers/adapters/runtimePayload';

export interface ProviderNativeCompatibilityContext {
    providerId: FirstPartyProviderId;
    modelId: string;
    optionProfileId: string;
    resolvedBaseUrl: string | null;
    sourceProvider?: string;
    apiFamily?: ProviderApiFamily;
    providerNativeId: string;
}

export interface ProviderNativeHttpRequest {
    url: string;
    headers: Record<string, string>;
    body: Record<string, unknown>;
    fallbackBody?: Record<string, unknown>;
}

export interface ProviderNativeServerSentEventFrame {
    eventName?: string;
    data: string;
}

export interface ProviderNativeStreamState {
    [key: string]: unknown;
}

export interface ProviderNativeStreamEventResult {
    parts: ProviderRuntimePart[];
    usage?: ProviderRuntimeUsage;
    stop?: boolean;
}

export type ProviderNativeRuntimeMatchStrength = 'trusted';

export interface ProviderNativeRuntimeSpecialization {
    id: string;
    providerId: FirstPartyProviderId;
    matchContext(context: ProviderNativeCompatibilityContext): ProviderNativeRuntimeMatchStrength | null;
    transportSelection: ProviderRuntimeTransportSelection['selected'];
    buildRequest(input: ProviderRuntimeInput): ProviderAdapterResult<ProviderNativeHttpRequest>;
    createStreamState(): ProviderNativeStreamState;
    parseStreamEvent(input: {
        frame: ProviderNativeServerSentEventFrame;
        state: ProviderNativeStreamState;
    }): ProviderAdapterResult<ProviderNativeStreamEventResult>;
    finalizeStream(state: ProviderNativeStreamState): ProviderAdapterResult<ProviderNativeStreamEventResult>;
    parseNonStreamPayload(payload: unknown): ProviderAdapterResult<RuntimeParsedCompletion>;
}

export interface ProviderNativeRuntimeExecutionInput {
    runtimeInput: ProviderRuntimeInput;
    handlers: ProviderRuntimeHandlers;
    specialization: ProviderNativeRuntimeSpecialization;
}
