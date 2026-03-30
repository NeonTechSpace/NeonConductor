import { errProviderAdapter, okProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import { executeHttpFallback } from '@/app/backend/providers/adapters/httpFallback';
import { buildOpenAIChatCompletionsRequestBody } from '@/app/backend/providers/adapters/openaiCompatible/openAIChatCompletionsRequestBuilder';
import { buildOpenAIResponsesRequestBody } from '@/app/backend/providers/adapters/openaiCompatible/openAIResponsesRequestBuilder';
import type { OpenAICompatibleProtocolExecutionInput } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleRuntime.types';
import {
    emitRuntimeLifecycleSelection,
    failRuntimeAdapter,
    mapHttpFallbackFailureStage,
} from '@/app/backend/providers/adapters/runtimeLifecycle';
import { parseChatCompletionsPayload, parseResponsesPayload } from '@/app/backend/providers/adapters/runtimePayload';
import {
    consumeChatCompletionsStreamResponse,
    consumeResponsesStreamResponse,
    emitParsedCompletion,
} from '@/app/backend/providers/adapters/streaming';

function failOpenAICompatibleProtocolExecution(
    input: OpenAICompatibleProtocolExecutionInput['executionContext'],
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    return failRuntimeAdapter({
        input: input.runtimeInput,
        logTag: `provider.${input.config.providerId}`,
        runtimeLabel: `${input.config.label} runtime`,
        context,
        code,
        error,
    });
}

export async function executeOpenAICompatibleProtocol(
    input: OpenAICompatibleProtocolExecutionInput
): Promise<ProviderAdapterResult<void>> {
    const protocolConfig =
        input.executionBranch === 'openai_chat_completions'
            ? {
                  transportSelection: 'openai_chat_completions' as const,
                  url: input.executionContext.endpoints.chatCompletionsUrl,
                  streamBody: buildOpenAIChatCompletionsRequestBody(
                      input.executionContext.runtimeInput,
                      input.executionContext.config.modelPrefix
                  ),
                  consumeStreamResponse: (response: Response) =>
                      consumeChatCompletionsStreamResponse({
                          response,
                          handlers: input.executionContext.handlers,
                          startedAt: input.executionContext.startedAt,
                      }),
                  emitPayload: async (payload: unknown) => {
                      const parsed = parseChatCompletionsPayload(payload);
                      if (parsed.isErr()) {
                          return errProviderAdapter(parsed.error.code, parsed.error.message);
                      }

                      return emitParsedCompletion(
                          parsed.value,
                          input.executionContext.handlers,
                          input.executionContext.startedAt
                      );
                  },
                  formatHttpFailure: ({ response }: { response: Response }) =>
                      `${input.executionContext.config.label} chat completion failed: ${String(response.status)} ${response.statusText}`,
              }
            : {
                  transportSelection: 'openai_responses' as const,
                  url: input.executionContext.endpoints.responsesUrl,
                  streamBody: buildOpenAIResponsesRequestBody(
                      input.executionContext.runtimeInput,
                      input.executionContext.config.modelPrefix
                  ),
                  consumeStreamResponse: (response: Response) =>
                      consumeResponsesStreamResponse({
                          response,
                          handlers: input.executionContext.handlers,
                          startedAt: input.executionContext.startedAt,
                      }),
                  emitPayload: async (payload: unknown) => {
                      const parsed = parseResponsesPayload(payload);
                      if (parsed.isErr()) {
                          return errProviderAdapter(parsed.error.code, parsed.error.message);
                      }

                      return emitParsedCompletion(
                          parsed.value,
                          input.executionContext.handlers,
                          input.executionContext.startedAt
                      );
                  },
                  formatHttpFailure: ({ response }: { response: Response }) =>
                      `${input.executionContext.config.label} responses completion failed: ${String(response.status)} ${response.statusText}`,
              };

    await emitRuntimeLifecycleSelection({
        handlers: input.executionContext.handlers,
        transportSelection: {
            selected: protocolConfig.transportSelection,
            requested: input.executionContext.runtimeInput.runtimeOptions.transport.family,
            degraded: false,
        },
        cacheResult: input.executionContext.runtimeInput.cache,
    });

    const authHeaders = {
        Authorization: `Bearer ${input.executionContext.token}`,
        Accept: 'text/event-stream, application/json',
        'Content-Type': 'application/json',
    };

    const execution = await executeHttpFallback({
        signal: input.executionContext.runtimeInput.signal,
        streamRequest: {
            url: protocolConfig.url,
            headers: authHeaders,
            body: protocolConfig.streamBody,
        },
        fallbackRequest: {
            url: protocolConfig.url,
            headers: authHeaders,
            body: {
                ...protocolConfig.streamBody,
                stream: false,
            },
        },
        consumeStreamResponse: protocolConfig.consumeStreamResponse,
        emitPayload: protocolConfig.emitPayload,
        formatHttpFailure: protocolConfig.formatHttpFailure,
    });
    if (execution.isErr()) {
        return failOpenAICompatibleProtocolExecution(
            input.executionContext,
            mapHttpFallbackFailureStage(execution.error.stage),
            execution.error.code,
            execution.error.message
        );
    }

    return okProviderAdapter(undefined);
}
