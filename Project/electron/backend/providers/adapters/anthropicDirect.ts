import { streamDirectFamilyRuntimeWithHandler } from '@/app/backend/providers/adapters/directFamily/shell';
import type { DirectFamilyRuntimeConfig, DirectFamilyRuntimeHandler } from '@/app/backend/providers/adapters/directFamily/types';
import type { ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import {
    buildDirectAnthropicBody,
    buildDirectAnthropicRequest,
    supportsDirectAnthropicRuntimeContext,
    validateDirectAnthropicAuth,
} from '@/app/backend/providers/adapters/directAnthropicRequestBuilder';
import {
    consumeDirectAnthropicStreamResponse,
    emitDirectAnthropicPayload,
    parseDirectAnthropicPayload,
} from '@/app/backend/providers/adapters/directAnthropicStreamDecoder';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

export {
    buildDirectAnthropicBody,
    consumeDirectAnthropicStreamResponse,
    emitDirectAnthropicPayload,
    parseDirectAnthropicPayload,
    supportsDirectAnthropicRuntimeContext,
};

export const directAnthropicRuntimeHandler: DirectFamilyRuntimeHandler = {
    toolProtocol: 'anthropic_messages',
    familyLabel: 'Anthropic',
    supportsContext: supportsDirectAnthropicRuntimeContext,
    incompatibleContextMessage: ({ runtimeInput, config }) =>
        `Model "${runtimeInput.modelId}" requires an Anthropic-compatible base URL on provider "${config.providerId}".`,
    validateAuth: validateDirectAnthropicAuth,
    buildRequest: buildDirectAnthropicRequest,
    consumeStreamResponse: consumeDirectAnthropicStreamResponse,
    emitPayload: emitDirectAnthropicPayload,
};

export async function streamDirectAnthropicRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: DirectFamilyRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    return streamDirectFamilyRuntimeWithHandler(input, handlers, config, directAnthropicRuntimeHandler);
}
