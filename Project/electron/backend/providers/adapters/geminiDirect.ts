import { streamDirectFamilyRuntimeWithHandler } from '@/app/backend/providers/adapters/directFamily/shell';
import type { DirectFamilyRuntimeConfig, DirectFamilyRuntimeHandler } from '@/app/backend/providers/adapters/directFamily/types';
import type { ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import {
    buildDirectGeminiBody,
    buildDirectGeminiRequest,
    supportsDirectGeminiRuntimeContext,
    validateDirectGeminiAuth,
} from '@/app/backend/providers/adapters/directGeminiRequestBuilder';
import {
    consumeDirectGeminiStreamResponse,
    emitDirectGeminiPayload,
    parseDirectGeminiPayload,
} from '@/app/backend/providers/adapters/directGeminiStreamDecoder';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

export {
    buildDirectGeminiBody,
    consumeDirectGeminiStreamResponse,
    emitDirectGeminiPayload,
    parseDirectGeminiPayload,
    supportsDirectGeminiRuntimeContext,
};

export const directGeminiRuntimeHandler: DirectFamilyRuntimeHandler = {
    toolProtocol: 'google_generativeai',
    familyLabel: 'Gemini',
    supportsContext: supportsDirectGeminiRuntimeContext,
    incompatibleContextMessage: ({ runtimeInput, config }) =>
        `Model "${runtimeInput.modelId}" requires a Gemini-compatible base URL on provider "${config.providerId}".`,
    validateAuth: validateDirectGeminiAuth,
    buildRequest: buildDirectGeminiRequest,
    consumeStreamResponse: consumeDirectGeminiStreamResponse,
    emitPayload: emitDirectGeminiPayload,
};

export async function streamDirectGeminiRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: DirectFamilyRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    return streamDirectFamilyRuntimeWithHandler(input, handlers, config, directGeminiRuntimeHandler);
}
