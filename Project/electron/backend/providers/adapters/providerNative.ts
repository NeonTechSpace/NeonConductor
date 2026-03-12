import {
    errProviderAdapter,
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import {
    executeHttpFallback,
    type HttpRuntimeRequest,
} from '@/app/backend/providers/adapters/httpFallback';
import {
    emitRuntimeLifecycleSelection,
    failRuntimeAdapter,
    mapHttpFallbackFailureStage,
} from '@/app/backend/providers/adapters/runtimeLifecycle';
import {
    consumeStrictServerSentEvents,
    type StrictServerSentEventFrame,
} from '@/app/backend/providers/adapters/strictServerSentEvents';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import { providerCatalogStore } from '@/app/backend/persistence/stores';
import type { RuntimeParsedCompletion } from '@/app/backend/providers/adapters/runtimePayload';
import { miniMaxOpenAICompatibilitySpecialization } from '@/app/backend/providers/adapters/providerNative/minimax';
import type { FirstPartyProviderId } from '@/app/backend/providers/registry';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import type {
    ProviderApiFamily,
    ProviderRuntimePart,
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
    ProviderRuntimeTransportSelection,
    ProviderRuntimeUsage,
} from '@/app/backend/providers/types';

export interface ProviderNativeCompatibilityContext {
    providerId: FirstPartyProviderId;
    modelId: string;
    optionProfileId: string;
    resolvedBaseUrl: string | null;
    sourceProvider?: string;
    apiFamily?: ProviderApiFamily;
    providerSettings?: Record<string, unknown>;
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

const providerNativeRuntimeSpecializations: ProviderNativeRuntimeSpecialization[] = [
    miniMaxOpenAICompatibilitySpecialization,
];

async function emitStreamEventResult(input: {
    result: ProviderNativeStreamEventResult;
    handlers: ProviderRuntimeHandlers;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    for (const part of input.result.parts) {
        await input.handlers.onPart(part);
    }

    if (input.result.usage && input.handlers.onUsage) {
        await input.handlers.onUsage({
            ...input.result.usage,
            latencyMs: Date.now() - input.startedAt,
        });
    }

    return okProviderAdapter(undefined);
}

function failProviderNativeRuntime(
    input: ProviderRuntimeInput,
    specialization: ProviderNativeRuntimeSpecialization | null,
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    return failRuntimeAdapter({
        input,
        logTag: `provider.${input.providerId}`,
        runtimeLabel: 'Provider-native runtime',
        context,
        code,
        error,
        logFields: {
            providerNativeSpecializationId: specialization?.id ?? null,
        },
    });
}

function resolveProviderNativeRuntimeSpecializationForContext(
    context: ProviderNativeCompatibilityContext
): ProviderNativeRuntimeSpecialization | null {
    for (const specialization of providerNativeRuntimeSpecializations) {
        if (specialization.providerId !== context.providerId) {
            continue;
        }

        const matchStrength = specialization.matchContext(context);
        if (matchStrength === 'trusted') {
            return specialization;
        }
    }

    return null;
}

export function supportsProviderNativeRuntimeContext(context: ProviderNativeCompatibilityContext): boolean {
    return resolveProviderNativeRuntimeSpecializationForContext(context) !== null;
}

export async function resolveProviderNativeRuntimeSpecialization(
    providerId: FirstPartyProviderId,
    modelId: string,
    profileId: string
): Promise<ProviderNativeRuntimeSpecialization | null> {
    const [runtimePathContextResult, modelRecord] = await Promise.all([
        resolveProviderRuntimePathContext(profileId, providerId),
        providerCatalogStore.getModel(profileId, providerId, modelId),
    ]);
    if (runtimePathContextResult.isErr() || !modelRecord) {
        return null;
    }

    const compatibilityContext: ProviderNativeCompatibilityContext = {
        providerId,
        modelId,
        optionProfileId: runtimePathContextResult.value.optionProfileId,
        resolvedBaseUrl: runtimePathContextResult.value.resolvedBaseUrl,
        ...(modelRecord.sourceProvider ? { sourceProvider: modelRecord.sourceProvider } : {}),
        ...(modelRecord.apiFamily ? { apiFamily: modelRecord.apiFamily } : {}),
        ...(modelRecord.providerSettings ? { providerSettings: modelRecord.providerSettings } : {}),
    };

    return resolveProviderNativeRuntimeSpecializationForContext(compatibilityContext);
}

export async function streamProviderNativeRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    const specialization = await resolveProviderNativeRuntimeSpecialization(input.providerId, input.modelId, input.profileId);
    if (!specialization) {
        return unsupportedProviderNativeRuntime(input);
    }

    await emitRuntimeLifecycleSelection({
        handlers,
        transportSelection: {
            selected: specialization.transportSelection,
            requested: input.runtimeOptions.transport.family,
            degraded: false,
        },
        cacheResult: input.cache,
    });

    const requestResult = specialization.buildRequest(input);
    if (requestResult.isErr()) {
        return failProviderNativeRuntime(
            input,
            specialization,
            'request build',
            requestResult.error.code,
            requestResult.error.message
        );
    }

    const request = requestResult.value;
    const startedAt = Date.now();
    const fallbackRequest: HttpRuntimeRequest | undefined = request.fallbackBody
        ? {
              url: request.url,
              headers: request.headers,
              body: request.fallbackBody,
          }
        : undefined;

    const execution = await executeHttpFallback({
        signal: input.signal,
        streamRequest: {
            url: request.url,
            headers: request.headers,
            body: request.body,
        },
        ...(fallbackRequest ? { fallbackRequest } : {}),
        consumeStreamResponse: async (response) => {
            const streamState = specialization.createStreamState();
            const streamed = await consumeStrictServerSentEvents({
                response,
                sourceLabel: 'Provider-native stream',
                onFrame: async (frame: StrictServerSentEventFrame) => {
                    const parsedEvent = specialization.parseStreamEvent({
                        frame,
                        state: streamState,
                    });
                    if (parsedEvent.isErr()) {
                        return errProviderAdapter(parsedEvent.error.code, parsedEvent.error.message);
                    }

                    const emitted = await emitStreamEventResult({
                        result: parsedEvent.value,
                        handlers,
                        startedAt,
                    });
                    if (emitted.isErr()) {
                        return errProviderAdapter(emitted.error.code, emitted.error.message);
                    }

                    return okProviderAdapter(parsedEvent.value.stop === true);
                },
            });
            if (streamed.isErr()) {
                return streamed;
            }

            const finalized = specialization.finalizeStream(streamState);
            if (finalized.isErr()) {
                return errProviderAdapter(finalized.error.code, finalized.error.message);
            }

            return emitStreamEventResult({
                result: finalized.value,
                handlers,
                startedAt,
            });
        },
        emitPayload: async (payload) => {
            const parsedPayload = specialization.parseNonStreamPayload(payload);
            if (parsedPayload.isErr()) {
                return errProviderAdapter(parsedPayload.error.code, parsedPayload.error.message);
            }

            return emitParsedCompletion(parsedPayload.value, handlers, startedAt);
        },
        formatHttpFailure: ({ response }) =>
            `Provider-native completion failed: ${String(response.status)} ${response.statusText}`,
    });
    if (execution.isErr()) {
        return failProviderNativeRuntime(
            input,
            specialization,
            mapHttpFallbackFailureStage(execution.error.stage),
            execution.error.code,
            execution.error.message
        );
    }

    return okProviderAdapter(undefined);
}

export function unsupportedProviderNativeRuntime(
    input: ProviderRuntimeInput,
    message?: string
): ProviderAdapterResult<never> {
    return errProviderAdapter(
        'invalid_payload',
        message ??
            `Model "${input.modelId}" requires a provider-native runtime specialization that is not registered.`
    );
}
