import { describe, expect, it, vi } from 'vitest';

import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
import {
    createCaller,
    providerCatalogStore,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import { kiloBalancedModelId, kiloFrontierModelId } from '@/shared/kiloModels';
import type { ProviderModelRecord } from '@/app/backend/persistence/types';

registerRuntimeContractHooks();

function getKiloRoutedApiFamily(
    model: ProviderModelRecord | undefined
): 'openai_compatible' | 'anthropic_messages' | 'google_generativeai' | undefined {
    if (!model || model.runtime.toolProtocol !== 'kilo_gateway') {
        return undefined;
    }

    return model.runtime.routedApiFamily;
}

describe('runtime contracts: provider kilo catalog flows', () => {
    const profileId = runtimeContractProfileId;

    it('syncs kilo catalog with dynamic capability metadata from gateway discovery', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: kiloFrontierModelId,
                                    name: 'Kilo Auto Frontier',
                                    context_length: 200000,
                                    supported_parameters: ['tools', 'reasoning'],
                                    architecture: {
                                        input_modalities: ['text', 'image'],
                                        output_modalities: ['text'],
                                    },
                                    opencode: {
                                        prompt: 'anthropic',
                                    },
                                    pricing: {},
                                },
                                {
                                    id: 'moonshotai/kimi-k2.5',
                                    name: 'Kimi K2.5',
                                    context_length: 128000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                                {
                                    id: 'z-ai/glm-5',
                                    name: 'GLM-5',
                                    context_length: 128000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                                {
                                    id: 'google/gemini-3.1-pro-preview',
                                    name: 'Gemini 3.1 Pro Preview',
                                    context_length: 128000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text', 'image'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/providers')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                { id: 'openai', label: 'OpenAI' },
                                { id: 'anthropic', label: 'Anthropic' },
                                { id: 'google-ai-studio', label: 'Google AI Studio' },
                                { id: 'google-vertex', label: 'Vertex AI' },
                                { id: 'moonshotai', label: 'Moonshot AI' },
                                { id: 'z-ai', label: 'Z.AI' },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                { provider: 'moonshotai', models: ['moonshotai/kimi-k2.5'] },
                                { provider: 'z-ai', models: ['z-ai/glm-5'] },
                                { provider: 'google-ai-studio', models: ['google/gemini-3.1-pro-preview'] },
                            ],
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'kilo',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBe(4);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        const frontier = models.models.find((model) => model.id === kiloFrontierModelId);
        expect(frontier).toBeDefined();
        if (!frontier) {
            throw new Error('Expected Kilo frontier model in synced catalog.');
        }
        expect(frontier.features.supportsTools).toBe(true);
        expect(frontier.features.supportsReasoning).toBe(true);
        expect(frontier.features.supportsVision).toBe(true);
        expect(frontier.features.inputModalities.includes('image')).toBe(true);
        expect(frontier.promptFamily).toBe('anthropic');
        expect(frontier.contextLength).toBe(200000);
        expect(frontier.runtime.apiFamily).toBe('kilo_gateway');
        if (frontier.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected Kilo gateway runtime.');
        }
        expect(frontier.runtime.routedApiFamily).toBe('anthropic_messages');
        expect(getKiloRoutedApiFamily(models.models.find((model) => model.id === 'moonshotai/kimi-k2.5'))).toBe(
            'openai_compatible'
        );
        expect(getKiloRoutedApiFamily(models.models.find((model) => model.id === 'z-ai/glm-5'))).toBe(
            'openai_compatible'
        );
        expect(getKiloRoutedApiFamily(models.models.find((model) => model.id === 'google/gemini-3.1-pro-preview'))).toBe(
            'google_generativeai'
        );
    });

    it('keeps distinct kilo model ids when discovery returns the same visible label twice', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: kiloBalancedModelId,
                                    name: 'Kilo Auto Balanced',
                                    context_length: 200000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                                {
                                    id: kiloFrontierModelId,
                                    name: 'Kilo Auto Balanced',
                                    context_length: 200000,
                                    supported_parameters: ['reasoning'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    opencode: {
                                        prompt: 'anthropic',
                                    },
                                    pricing: {},
                                },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/providers')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                { id: 'anthropic', label: 'Anthropic' },
                                { id: 'openai', label: 'OpenAI' },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                { provider: 'openai', models: [kiloBalancedModelId] },
                                { provider: 'anthropic', models: [kiloFrontierModelId] },
                            ],
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'kilo',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBe(2);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        expect(models.models.some((model) => model.id === kiloBalancedModelId)).toBe(true);
        expect(models.models.some((model) => model.id === kiloFrontierModelId)).toBe(true);
        expect(models.models.filter((model) => model.label === 'Kilo Auto Balanced')).toHaveLength(2);
        expect(getKiloRoutedApiFamily(models.models.find((model) => model.id === kiloBalancedModelId))).toBe(
            'openai_compatible'
        );
        expect(getKiloRoutedApiFamily(models.models.find((model) => model.id === kiloFrontierModelId))).toBe(
            'anthropic_messages'
        );
    });

    it('keeps Kilo models backed by supported Moonshot upstreams instead of dropping them during normalization', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: 'moonshot/kimi-k2',
                                    name: 'Kimi K2',
                                    owned_by: 'moonshot',
                                    context_length: 200000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/providers') || url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({ data: [] }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'kilo',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBe(1);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        const kimi = models.models.find((model) => model.id === 'moonshot/kimi-k2');
        expect(kimi).toBeDefined();
        expect(kimi?.runtime.toolProtocol === 'kilo_gateway' ? kimi.runtime.routedApiFamily : undefined).toBe(
            'openai_compatible'
        );
    });

    it('drops synced Kilo catalog rows when their routed family is unknown', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: 'minimax/minimax-m2.1:free',
                                    name: 'MiniMax M2.1',
                                    owned_by: 'minimax',
                                    context_length: 200000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                            ],
                        }),
                    });
                }

                if (url.endsWith('/providers') || url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({ data: [] }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'kilo',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBe(0);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        const minimax = models.models.find((model) => model.id === 'minimax/minimax-m2.1:free');
        expect(minimax).toBeUndefined();

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        const shellMiniMax = shellBootstrap.providerModels.find((model) => model.id === 'minimax/minimax-m2.1:free');
        expect(shellMiniMax).toBeUndefined();
    });

    it('surfaces catalog sync failure details when the first kilo model sync produces no persisted catalog', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: false,
                        status: 502,
                        statusText: 'Bad Gateway',
                        json: () => ({
                            error: { message: 'gateway unavailable' },
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-api-key',
        });
        expect(configured.success).toBe(true);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        expect(models.models).toHaveLength(0);
        expect(models.reason).toBe('catalog_sync_failed');
        expect(models.detail).toContain('502 Bad Gateway');
    });

    it('accepts a Kilo MiniMax default from account sync when that model already exists in the catalog', async () => {
        const caller = createCaller();

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'minimax/minimax-m2.1:free',
                label: 'MiniMax M2.1',
                upstreamProvider: 'minimax',
                isFree: true,
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'openai_compatible',
                },
                pricing: {},
                raw: {},
                source: 'test',
            },
        ]);
        await providerMetadataOrchestrator.flushProviderScope(profileId, 'kilo');

        vi.stubGlobal(
            'fetch',
            vi.fn((url: string) => {
                if (url.endsWith('/api/device-auth/codes')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            result: {
                                deviceAuth: {
                                    deviceCode: 'kilo-device-code-defaults',
                                    userCode: 'KILO-DEFAULTS',
                                    verificationUrl: 'https://kilo.example/verify',
                                    poll_interval_seconds: 5,
                                    expiresIn: 900,
                                },
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/device-auth/codes/kilo-device-code-defaults')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                status: 'approved',
                                accessToken: 'kilo-session-token-defaults',
                                refreshToken: 'kilo-refresh-token-defaults',
                                expiresAt: '2026-03-11T16:00:00.000Z',
                                accountId: 'acct_defaults',
                                organizationId: 'org_defaults',
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/profile')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                accountId: 'acct_defaults',
                                displayName: 'Defaults User',
                                emailMasked: 'd***@example.com',
                                organizations: [
                                    {
                                        organization_id: 'org_defaults',
                                        name: 'Defaults Org',
                                        is_active: true,
                                        entitlement: {},
                                    },
                                ],
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/defaults') || url.endsWith('/api/organizations/org_defaults/defaults')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                defaultModelId: 'minimax/minimax-m2.1:free',
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/profile/balance')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                balance: 5.5,
                                currency: 'USD',
                            },
                        }),
                    });
                }

                return Promise.resolve({
                    ok: false,
                    status: 404,
                    statusText: 'Not Found',
                    json: () => ({}),
                });
            })
        );

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'kilo',
            method: 'device_code',
        });
        expect(started.flow.flowType).toBe('device_code');
        expect(started.userCode).toBe('KILO-DEFAULTS');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'kilo',
            flowId: started.flow.id,
        });
        expect(polled.flow.status).toBe('completed');
        expect(polled.state.authState).toBe('authenticated');

        const defaults = await caller.provider.getDefaults({ profileId });
        expect(defaults.defaults).toEqual({
            providerId: 'kilo',
            modelId: 'minimax/minimax-m2.1:free',
        });
        expect(defaults.specialistDefaults).toEqual([]);
    });
});
