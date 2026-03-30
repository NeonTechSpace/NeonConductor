import { streamDirectFamilyRuntime } from '@/app/backend/providers/adapters/directFamily/runtime';
import { okProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import { resolveOpenAICompatibleAuthToken } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleAuthResolver';
import { resolveOpenAICompatibleExecutionBranch } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleExecutionBranchResolver';
import { executeOpenAICompatibleProtocol } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleProtocolExecutor';
import type {
    OpenAICompatibleExecutionContext,
    OpenAICompatibleRuntimeConfig,
} from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleRuntime.types';
import { streamOpenAIRealtimeWebSocketRuntime } from '@/app/backend/providers/adapters/openaiCompatible/realtimeWebsocket';
import { streamProviderNativeRuntime } from '@/app/backend/providers/adapters/providerNative';
import { emitRuntimeLifecycleSelection, failRuntimeAdapter } from '@/app/backend/providers/adapters/runtimeLifecycle';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

function failOpenAICompatibleRuntime(
    input: ProviderRuntimeInput,
    config: OpenAICompatibleRuntimeConfig,
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    return failRuntimeAdapter({
        input,
        logTag: `provider.${config.providerId}`,
        runtimeLabel: `${config.label} runtime`,
        context,
        code,
        error,
    });
}

export async function streamOpenAICompatibleRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: OpenAICompatibleRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    const executionBranch = resolveOpenAICompatibleExecutionBranch({
        runtimeInput: input,
        config,
    });

    if (executionBranch === 'provider_native') {
        return streamProviderNativeRuntime(input, handlers);
    }

    if (executionBranch === 'direct_family') {
        return streamDirectFamilyRuntime(input, handlers, {
            providerId: input.providerId,
            modelPrefix: config.modelPrefix,
            label: config.label,
        });
    }

    const tokenResult = resolveOpenAICompatibleAuthToken({
        runtimeInput: input,
        config,
    });
    if (tokenResult.isErr()) {
        return failOpenAICompatibleRuntime(
            input,
            config,
            'auth resolution',
            tokenResult.error.code,
            tokenResult.error.message
        );
    }

    const executionContext: OpenAICompatibleExecutionContext = {
        runtimeInput: input,
        handlers,
        config,
        token: tokenResult.value,
        startedAt: Date.now(),
        endpoints: await config.resolveEndpoints(input),
    };

    if (executionBranch === 'realtime_websocket') {
        if (!executionContext.endpoints.baseUrl) {
            return failOpenAICompatibleRuntime(
                input,
                config,
                'realtime websocket',
                'request_failed',
                'OpenAI Realtime WebSocket execution requires a resolved OpenAI base URL.'
            );
        }

        await emitRuntimeLifecycleSelection({
            handlers: executionContext.handlers,
            transportSelection: {
                selected: 'openai_realtime_websocket',
                requested: input.runtimeOptions.transport.family,
                degraded: false,
            },
            cacheResult: input.cache,
        });

        const realtimeResult = await streamOpenAIRealtimeWebSocketRuntime({
            runtimeInput: executionContext.runtimeInput,
            handlers: executionContext.handlers,
            baseUrl: executionContext.endpoints.baseUrl,
            token: executionContext.token,
            startedAt: executionContext.startedAt,
        });
        if (realtimeResult.isErr()) {
            return failOpenAICompatibleRuntime(
                input,
                config,
                'realtime websocket',
                realtimeResult.error.code,
                realtimeResult.error.message
            );
        }

        return okProviderAdapter(undefined);
    }

    if (executionBranch === 'openai_chat_completions' || executionBranch === 'openai_responses') {
        return executeOpenAICompatibleProtocol({
            executionBranch,
            executionContext,
        });
    }

    return failOpenAICompatibleRuntime(
        input,
        config,
        'protocol dispatch',
        'invalid_payload',
        `Model "${input.modelId}" declares unsupported protocol "${input.runtime.toolProtocol}" for the OpenAI-compatible adapter.`
    );
}
