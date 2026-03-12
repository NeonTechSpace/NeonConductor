import {
    okProviderAdapter,
    type ProviderAdapterResult,
} from '@/app/backend/providers/adapters/errors';
import { executeHttpFallback } from '@/app/backend/providers/adapters/httpFallback';
import {
    emitRuntimeLifecycleSelection,
    failRuntimeAdapter,
    mapHttpFallbackFailureStage,
} from '@/app/backend/providers/adapters/runtimeLifecycle';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

import type { DirectFamilyRuntimeConfig, DirectFamilyRuntimeHandler } from '@/app/backend/providers/adapters/directFamily/types';

function failDirectFamilyRuntime(
    input: ProviderRuntimeInput,
    config: DirectFamilyRuntimeConfig,
    familyLabel: string,
    context: string,
    code: string,
    error: string
): ProviderAdapterResult<never> {
    return failRuntimeAdapter({
        input,
        logTag: `provider.${config.providerId}`,
        runtimeLabel: `${config.label} ${familyLabel} runtime`,
        context,
        code,
        error,
    });
}

export async function streamDirectFamilyRuntimeWithHandler(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: DirectFamilyRuntimeConfig,
    familyHandler: DirectFamilyRuntimeHandler
): Promise<ProviderAdapterResult<void>> {
    const runtimePathResult = await resolveProviderRuntimePathContext(input.profileId, config.providerId);
    if (runtimePathResult.isErr()) {
        return failDirectFamilyRuntime(
            input,
            config,
            familyHandler.familyLabel,
            'path resolution',
            'provider_request_failed',
            runtimePathResult.error.message
        );
    }

    if (
        !familyHandler.supportsContext({
            providerId: config.providerId,
            resolvedBaseUrl: runtimePathResult.value.resolvedBaseUrl,
        })
    ) {
        return failDirectFamilyRuntime(
            input,
            config,
            familyHandler.familyLabel,
            'path validation',
            'provider_request_failed',
            familyHandler.incompatibleContextMessage({
                runtimeInput: input,
                config,
            })
        );
    }

    const authResult = familyHandler.validateAuth({
        runtimeInput: input,
        config,
    });
    if (authResult.isErr()) {
        return failDirectFamilyRuntime(
            input,
            config,
            familyHandler.familyLabel,
            'auth resolution',
            authResult.error.code,
            authResult.error.message
        );
    }

    await emitRuntimeLifecycleSelection({
        handlers,
        transportSelection: {
            selected: familyHandler.toolProtocol,
            requested: input.runtimeOptions.transport.family,
            degraded: false,
        },
        cacheResult: input.cache,
    });

    const resolvedBaseUrl = runtimePathResult.value.resolvedBaseUrl;
    if (!resolvedBaseUrl) {
        return failDirectFamilyRuntime(
            input,
            config,
            familyHandler.familyLabel,
            'path validation',
            'provider_request_failed',
            familyHandler.incompatibleContextMessage({
                runtimeInput: input,
                config,
            })
        );
    }

    const startedAt = Date.now();
    const streamRequest = familyHandler.buildRequest({
        runtimeInput: input,
        config,
        resolvedBaseUrl,
        stream: true,
    });
    const fallbackRequest = familyHandler.buildRequest({
        runtimeInput: input,
        config,
        resolvedBaseUrl,
        stream: false,
    });

    const execution = await executeHttpFallback({
        signal: input.signal,
        streamRequest,
        fallbackRequest,
        consumeStreamResponse: (response) =>
            familyHandler.consumeStreamResponse({
                response,
                handlers,
                startedAt,
                includeEncrypted: input.runtimeOptions.reasoning.includeEncrypted,
            }),
        emitPayload: (payload) =>
            familyHandler.emitPayload({
                payload,
                handlers,
                startedAt,
                includeEncrypted: input.runtimeOptions.reasoning.includeEncrypted,
            }),
        formatHttpFailure: ({ response }) =>
            `${config.label} ${familyHandler.familyLabel} completion failed: ${String(response.status)} ${response.statusText}`,
    });
    if (execution.isErr()) {
        return failDirectFamilyRuntime(
            input,
            config,
            familyHandler.familyLabel,
            mapHttpFallbackFailureStage(execution.error.stage),
            execution.error.code,
            execution.error.message
        );
    }

    return okProviderAdapter(undefined);
}
