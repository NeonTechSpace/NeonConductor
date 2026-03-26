import {
    resolveOpenAIEndpoints,
    resolveOpenAIEndpointsFromBaseUrl,
} from '@/app/backend/providers/adapters/openai/endpoints';
import { streamOpenAICompatibleRuntime } from '@/app/backend/providers/adapters/openaiCompatible/runtime';
import { resolveProviderRuntimePathContext } from '@/app/backend/providers/runtimePathContext';
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
        resolveEndpoints: async (runtimeInput) => {
            const runtimePathResult = await resolveProviderRuntimePathContext(runtimeInput.profileId, 'openai');
            if (runtimePathResult.isErr() || !runtimePathResult.value.resolvedBaseUrl) {
                return resolveOpenAIEndpoints();
            }

            return resolveOpenAIEndpointsFromBaseUrl(runtimePathResult.value.resolvedBaseUrl);
        },
    });
}
