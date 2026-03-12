import { errProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import { directAnthropicRuntimeHandler } from '@/app/backend/providers/adapters/anthropicDirect';
import { directGeminiRuntimeHandler } from '@/app/backend/providers/adapters/geminiDirect';
import { streamDirectFamilyRuntimeWithHandler } from '@/app/backend/providers/adapters/directFamily/shell';
import type { DirectFamilyRuntimeConfig, DirectFamilyRuntimeHandler } from '@/app/backend/providers/adapters/directFamily/types';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

const directFamilyRuntimeHandlers: Record<
    Extract<ProviderRuntimeInput['toolProtocol'], 'anthropic_messages' | 'google_generativeai'>,
    DirectFamilyRuntimeHandler
> = {
    anthropic_messages: directAnthropicRuntimeHandler,
    google_generativeai: directGeminiRuntimeHandler,
};

export function resolveDirectFamilyRuntimeHandler(
    toolProtocol: ProviderRuntimeInput['toolProtocol']
): DirectFamilyRuntimeHandler | undefined {
    if (toolProtocol === 'anthropic_messages' || toolProtocol === 'google_generativeai') {
        return directFamilyRuntimeHandlers[toolProtocol];
    }

    return undefined;
}

export async function streamDirectFamilyRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers,
    config: DirectFamilyRuntimeConfig
): Promise<ProviderAdapterResult<void>> {
    const familyHandler = resolveDirectFamilyRuntimeHandler(input.toolProtocol);
    if (!familyHandler) {
        return errProviderAdapter(
            'invalid_payload',
            `Model "${input.modelId}" declares unsupported direct-family protocol "${input.toolProtocol}".`
        );
    }

    return streamDirectFamilyRuntimeWithHandler(input, handlers, config, familyHandler);
}
