import { streamOpenAICompatibleRuntime } from '@/app/backend/providers/adapters/openaiCompatible/runtime';
import { resolveOpenAIEndpoints } from '@/app/backend/providers/adapters/openai/endpoints';
import type { ProviderAdapterResult, ProviderRuntimeHandlers, ProviderRuntimeInput } from '@/app/backend/providers/types';

export async function streamOpenAICodexRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    return streamOpenAICompatibleRuntime(input, handlers, {
        providerId: 'openai_codex',
        modelPrefix: 'openai_codex/',
        label: 'OpenAI Codex',
        resolveEndpoints: resolveOpenAIEndpoints,
    });
}
