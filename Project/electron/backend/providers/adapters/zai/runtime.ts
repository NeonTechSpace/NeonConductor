import { streamOpenAICompatibleRuntime } from '@/app/backend/providers/adapters/openaiCompatible/runtime';
import { resolveConnectionProfile } from '@/app/backend/providers/service/endpointProfiles';
import type {
    ProviderAdapterResult,
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
} from '@/app/backend/providers/types';

function buildEndpoint(baseUrl: string, path: string): string {
    const normalizedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    return `${normalizedBase}${path}`;
}

async function resolveZaiEndpoints(profileId: string) {
    const connectionProfileResult = await resolveConnectionProfile(profileId, 'zai');
    const baseUrl = connectionProfileResult.isErr()
        ? 'https://api.z.ai/api/coding/paas/v4'
        : connectionProfileResult.value.resolvedBaseUrl;
    if (!baseUrl) {
        throw new Error('Expected Z.AI endpoint base URL to resolve.');
    }
    return {
        chatCompletionsUrl: buildEndpoint(baseUrl, '/chat/completions'),
        responsesUrl: buildEndpoint(baseUrl, '/responses'),
    };
}

export async function streamZaiRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    return streamOpenAICompatibleRuntime(input, handlers, {
        providerId: 'zai',
        modelPrefix: 'zai/',
        label: 'Z.AI',
        resolveEndpoints: () => resolveZaiEndpoints(input.profileId),
    });
}
