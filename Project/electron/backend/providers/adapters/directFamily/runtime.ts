import { directAnthropicRuntimeHandler } from '@/app/backend/providers/adapters/anthropicDirect';
import { streamDirectFamilyRuntimeWithHandler } from '@/app/backend/providers/adapters/directFamily/shell';
import type {
    DirectFamilyRuntimeConfig,
    DirectFamilyRuntimeHandler,
} from '@/app/backend/providers/adapters/directFamily/types';
import { errProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import { directGeminiRuntimeHandler } from '@/app/backend/providers/adapters/geminiDirect';
import type { ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

const directFamilyRuntimeHandlers: Record<
    Extract<ProviderRuntimeInput['runtime']['toolProtocol'], 'anthropic_messages' | 'google_generativeai'>,
    DirectFamilyRuntimeHandler
> = {
    anthropic_messages: directAnthropicRuntimeHandler,
    google_generativeai: directGeminiRuntimeHandler,
};

export function resolveDirectFamilyRuntimeHandler(
    toolProtocol: ProviderRuntimeInput['runtime']['toolProtocol']
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
    const familyHandler = resolveDirectFamilyRuntimeHandler(input.runtime.toolProtocol);
    if (!familyHandler) {
        return errProviderAdapter(
            'invalid_payload',
            `Model "${input.modelId}" declares unsupported direct-family protocol "${input.runtime.toolProtocol}".`
        );
    }

    return streamDirectFamilyRuntimeWithHandler(input, handlers, config, familyHandler);
}
