import { errProviderAdapter, okProviderAdapter, type ProviderAdapterResult } from '@/app/backend/providers/adapters/errors';
import type { OpenAICompatibleRuntimeConfig } from '@/app/backend/providers/adapters/openaiCompatible/openAICompatibleRuntime.types';
import type { ProviderRuntimeInput } from '@/app/backend/providers/types';

export function resolveOpenAICompatibleAuthToken(input: {
    runtimeInput: ProviderRuntimeInput;
    config: Pick<OpenAICompatibleRuntimeConfig, 'providerId' | 'label'>;
}): ProviderAdapterResult<string> {
    const token = input.config.providerId === 'openai_codex' ? input.runtimeInput.accessToken : input.runtimeInput.apiKey;
    if (!token) {
        return errProviderAdapter(
            'auth_missing',
            input.config.providerId === 'openai_codex'
                ? `${input.config.label} runtime execution requires an OAuth access token.`
                : `${input.config.label} runtime execution requires an API key.`
        );
    }

    return okProviderAdapter(token);
}
