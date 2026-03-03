import type { ProviderAdapter, ProviderCatalogModel, ProviderCatalogSyncResult } from '@/app/backend/providers/types';

const OPENAI_MODELS_ENDPOINT = process.env['OPENAI_MODELS_ENDPOINT']?.trim() || 'https://api.openai.com/v1/models';

const CURATED_SUBSCRIPTION_MODELS: ProviderCatalogModel[] = [
    {
        modelId: 'openai/gpt-5',
        label: 'GPT-5',
        upstreamProvider: 'openai',
        isFree: false,
        supportsTools: true,
        supportsReasoning: true,
        pricing: {},
        raw: {
            source: 'openai_subscription_curated',
        },
    },
    {
        modelId: 'openai/gpt-5-mini',
        label: 'GPT-5 Mini',
        upstreamProvider: 'openai',
        isFree: false,
        supportsTools: true,
        supportsReasoning: true,
        pricing: {},
        raw: {
            source: 'openai_subscription_curated',
        },
    },
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readOptionalString(value: unknown): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }

    const normalized = value.trim();
    return normalized.length > 0 ? normalized : undefined;
}

function normalizeOpenAIId(rawId: string): string {
    return rawId.startsWith('openai/') ? rawId : `openai/${rawId}`;
}

export class OpenAIProviderAdapter implements ProviderAdapter {
    readonly id = 'openai' as const;

    async syncCatalog(input: {
        profileId: string;
        authMethod: 'none' | 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';
        apiKey?: string;
        accessToken?: string;
        organizationId?: string;
        force?: boolean;
    }): Promise<ProviderCatalogSyncResult> {
        if (input.authMethod === 'oauth_pkce' || input.authMethod === 'oauth_device') {
            return {
                ok: true,
                status: 'synced',
                providerId: this.id,
                models: CURATED_SUBSCRIPTION_MODELS,
                providerPayload: {
                    source: 'openai_subscription_curated',
                },
                modelPayload: {
                    source: 'openai_subscription_curated',
                    modelIds: CURATED_SUBSCRIPTION_MODELS.map((model) => model.modelId),
                },
            };
        }

        if (!input.apiKey) {
            return {
                ok: false,
                status: 'error',
                providerId: this.id,
                reason: 'auth_required',
                detail: 'OpenAI catalog sync requires API key or OAuth auth.',
            };
        }

        try {
            const response = await fetch(OPENAI_MODELS_ENDPOINT, {
                headers: {
                    Authorization: `Bearer ${input.apiKey}`,
                    Accept: 'application/json',
                },
                signal: AbortSignal.timeout(15_000),
            });

            if (!response.ok) {
                return {
                    ok: false,
                    status: 'error',
                    providerId: this.id,
                    reason: 'sync_failed',
                    detail: `OpenAI models request failed: ${String(response.status)} ${response.statusText}`,
                };
            }

            const payload = (await response.json()) as unknown;
            const data = isRecord(payload) && Array.isArray(payload['data']) ? payload['data'] : [];

            const models: ProviderCatalogModel[] = [];
            for (const item of data) {
                if (!isRecord(item)) {
                    continue;
                }

                const upstreamId = readOptionalString(item['id']);
                if (!upstreamId) {
                    continue;
                }

                models.push({
                    modelId: normalizeOpenAIId(upstreamId),
                    label: upstreamId,
                    upstreamProvider: 'openai',
                    isFree: false,
                    supportsTools: true,
                    supportsReasoning: true,
                    pricing: {},
                    raw: item,
                });
            }
            models.sort((left, right) => left.modelId.localeCompare(right.modelId));

            return {
                ok: true,
                status: 'synced',
                providerId: this.id,
                models,
                providerPayload: {
                    source: 'openai_api',
                },
                modelPayload: isRecord(payload) ? payload : {},
            };
        } catch (error) {
            return {
                ok: false,
                status: 'error',
                providerId: this.id,
                reason: 'sync_failed',
                detail: error instanceof Error ? error.message : String(error),
            };
        }
    }
}

export const openAIProviderAdapter = new OpenAIProviderAdapter();
