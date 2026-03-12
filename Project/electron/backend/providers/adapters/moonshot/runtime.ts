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

async function resolveMoonshotEndpoints(profileId: string) {
    const connectionProfileResult = await resolveConnectionProfile(profileId, 'moonshot');
    const baseUrl = connectionProfileResult.isErr()
        ? 'https://api.moonshot.cn/v1'
        : connectionProfileResult.value.resolvedBaseUrl;
    if (!baseUrl) {
        throw new Error('Expected Moonshot endpoint base URL to resolve.');
    }
    return {
        chatCompletionsUrl: buildEndpoint(baseUrl, '/chat/completions'),
        responsesUrl: buildEndpoint(baseUrl, '/responses'),
    };
}

export async function streamMoonshotRuntime(
    input: ProviderRuntimeInput,
    handlers: ProviderRuntimeHandlers
): Promise<ProviderAdapterResult<void>> {
    return streamOpenAICompatibleRuntime(input, handlers, {
        providerId: 'moonshot',
        modelPrefix: 'moonshot/',
        label: 'Moonshot',
        resolveEndpoints: () => resolveMoonshotEndpoints(input.profileId),
    });
}
