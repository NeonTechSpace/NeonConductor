import { streamOpenAICompatibleRuntime } from '@/app/backend/providers/adapters/openaiCompatible/runtime';
import { resolveOpenAIEndpoints } from '@/app/backend/providers/adapters/openai/endpoints';
import type {
    ProviderAdapterResult,
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
} from '@/app/backend/providers/types';

export async function streamOpenAIRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    return streamOpenAICompatibleRuntime(input, handlers, {
        providerId: 'openai',
        modelPrefix: 'openai/',
        label: 'OpenAI',
        resolveEndpoints: () => resolveOpenAIEndpoints(),
    });
}
