import { errProviderAdapter, okProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import { executeHttpFallback, type HttpRuntimeRequest } from '@/app/backend/providers/adapters/httpFallback';
import {
    emitRuntimeLifecycleSelection,
    failRuntimeAdapter,
    mapHttpFallbackFailureStage,
} from '@/app/backend/providers/adapters/runtimeLifecycle';
import { emitParsedCompletion } from '@/app/backend/providers/adapters/streaming';
import {
    consumeStrictServerSentEvents,
    type StrictServerSentEventFrame,
} from '@/app/backend/providers/adapters/strictServerSentEvents';
import type {
    ProviderNativeRuntimeExecutionInput,
    ProviderNativeRuntimeSpecialization,
    ProviderNativeStreamEventResult,
} from '@/app/backend/providers/adapters/providerNative.types';

async function emitStreamEventResult(input: {
    result: ProviderNativeStreamEventResult;
    executionInput: ProviderNativeRuntimeExecutionInput;
    startedAt: number;
}): Promise<ProviderAdapterResult<void>> {
    for (const part of input.result.parts) {
        await input.executionInput.handlers.onPart(part);
    }

    if (input.result.usage && input.executionInput.handlers.onUsage) {
        await input.executionInput.handlers.onUsage({
            ...input.result.usage,
            latencyMs: Date.now() - input.startedAt,
        });
    }

    return okProviderAdapter(undefined);
}

function failProviderNativeRuntime(
    input: ProviderNativeRuntimeExecutionInput['runtimeInput'],
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

export async function executeProviderNativeRuntime(
    input: ProviderNativeRuntimeExecutionInput
): Promise<ProviderAdapterResult<void>> {
    await emitRuntimeLifecycleSelection({
        handlers: input.handlers,
        transportSelection: {
            selected: input.specialization.transportSelection,
            requested: input.runtimeInput.runtimeOptions.transport.family,
            degraded: false,
        },
        cacheResult: input.runtimeInput.cache,
    });

    const requestResult = input.specialization.buildRequest(input.runtimeInput);
    if (requestResult.isErr()) {
        return failProviderNativeRuntime(
            input.runtimeInput,
            input.specialization,
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
        signal: input.runtimeInput.signal,
        streamRequest: {
            url: request.url,
            headers: request.headers,
            body: request.body,
        },
        ...(fallbackRequest ? { fallbackRequest } : {}),
        consumeStreamResponse: async (response) => {
            const streamState = input.specialization.createStreamState();
            const streamed = await consumeStrictServerSentEvents({
                response,
                sourceLabel: 'Provider-native stream',
                onFrame: async (frame: StrictServerSentEventFrame) => {
                    const parsedEvent = input.specialization.parseStreamEvent({
                        frame,
                        state: streamState,
                    });
                    if (parsedEvent.isErr()) {
                        return errProviderAdapter(parsedEvent.error.code, parsedEvent.error.message);
                    }

                    const emitted = await emitStreamEventResult({
                        result: parsedEvent.value,
                        executionInput: input,
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

            const finalized = input.specialization.finalizeStream(streamState);
            if (finalized.isErr()) {
                return errProviderAdapter(finalized.error.code, finalized.error.message);
            }

            return emitStreamEventResult({
                result: finalized.value,
                executionInput: input,
                startedAt,
            });
        },
        emitPayload: async (payload) => {
            const parsedPayload = input.specialization.parseNonStreamPayload(payload);
            if (parsedPayload.isErr()) {
                return errProviderAdapter(parsedPayload.error.code, parsedPayload.error.message);
            }

            return emitParsedCompletion(parsedPayload.value, input.handlers, startedAt);
        },
        formatHttpFailure: ({ response }) =>
            `Provider-native completion failed: ${String(response.status)} ${response.statusText}`,
    });
    if (execution.isErr()) {
        return failProviderNativeRuntime(
            input.runtimeInput,
            input.specialization,
            mapHttpFallbackFailureStage(execution.error.stage),
            execution.error.code,
            execution.error.message
        );
    }

    return okProviderAdapter(undefined);
}
