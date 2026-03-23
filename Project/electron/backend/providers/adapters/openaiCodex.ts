import { streamOpenAICodexRuntime } from '@/app/backend/providers/adapters/openaiCodex/runtime';
import { syncStaticCatalog } from '@/app/backend/providers/metadata/staticCatalog/adapter';
import type {
    ProviderAdapter,
    ProviderAdapterResult,
    ProviderCatalogSyncResult,
    ProviderRuntimeHandlers,
    ProviderRuntimeInput,
} from '@/app/backend/providers/types';

export class OpenAICodexProviderAdapter implements ProviderAdapter {
    readonly id = 'openai_codex' as const;

    async syncCatalog(input: {
        profileId: string;
        authMethod: 'none' | 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';
        apiKey?: string;
        accessToken?: string;
        organizationId?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult> {
        return syncStaticCatalog('openai_codex', input);
    }

    async streamCompletion(
        input: ProviderRuntimeInput,
        handlers: ProviderRuntimeHandlers
    ): Promise<ProviderAdapterResult<void>> {
        return streamOpenAICodexRuntime(input, handlers);
    }
}

export const openAICodexProviderAdapter = new OpenAICodexProviderAdapter();
