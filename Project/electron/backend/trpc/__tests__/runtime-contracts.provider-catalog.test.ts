import { describe, expect, it, vi } from 'vitest';

import { normalizeCatalogMetadata, toProviderCatalogUpsert } from '@/app/backend/providers/metadata/normalize';
import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
import { listStaticModelDefinitions, toStaticProviderCatalogModel } from '@/app/backend/providers/metadata/staticCatalog/registry';
import { providerCatalogStore, runtimeContractProfileId, registerRuntimeContractHooks, createCaller } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';
import { kiloBalancedModelId, kiloFrontierModelId } from '@/shared/kiloModels';

registerRuntimeContractHooks();

describe('runtime contracts: provider and account flows', () => {
    const profileId = runtimeContractProfileId;
    it('supports provider auth control plane and static catalog sync remains explicit', async () => {
        const caller = createCaller();

        const before = await caller.provider.getAuthState({ profileId, providerId: 'openai' });
        expect(before.found).toBe(true);
        expect(before.state.authState).toBe('logged_out');

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'test-openai-key',
        });
        expect(configured.success).toBe(true);
        if (!configured.success) {
            throw new Error('Expected setApiKey to succeed.');
        }
        expect(configured.state.authState).toBe('configured');

        const snapshotAfterSet = await caller.runtime.getDiagnosticSnapshot({ profileId });
        expect(snapshotAfterSet.providerSecrets.some((providerSecret) => providerSecret.providerId === 'openai')).toBe(
            true
        );

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.status === 'synced' || syncResult.status === 'unchanged').toBe(true);
        expect(syncResult.modelCount).toBeGreaterThan(0);

        const cleared = await caller.provider.clearAuth({
            profileId,
            providerId: 'openai',
        });
        expect(cleared.success).toBe(true);
        if (!cleared.success) {
            throw new Error('Expected clearAuth to succeed.');
        }
        expect(cleared.authState.authState).toBe('logged_out');

        const snapshotAfterClear = await caller.runtime.getDiagnosticSnapshot({ profileId });
        expect(
            snapshotAfterClear.providerSecrets.some((providerSecret) => providerSecret.providerId === 'openai')
        ).toBe(false);
    });

    it('auto-backfills static openai catalogs from the local registry without codex models', async () => {
        const caller = createCaller();

        const staleOnly = listStaticModelDefinitions('openai', 'default')
            .filter((definition) => definition.modelId === 'openai/gpt-5')
            .map((definition) => toStaticProviderCatalogModel(definition, 'default'));
        const normalizedStaleOnly = normalizeCatalogMetadata('openai', staleOnly);
        await providerCatalogStore.replaceModels(
            profileId,
            'openai',
            normalizedStaleOnly.models.map(toProviderCatalogUpsert)
        );

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.some((model) => model.id === 'openai/gpt-5')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5.4')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-nano')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(false);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo-0125')).toBe(false);

        const codexModels = await caller.provider.listModels({ profileId, providerId: 'openai_codex' });
        expect(codexModels.models.some((model) => model.id === 'openai_codex/gpt-5-codex')).toBe(true);
    });

    it('syncs openai api catalog separately from codex model ids', async () => {
        const caller = createCaller();

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-api-key',
        });
        expect(configured.success).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(true);
        expect(syncResult.modelCount).toBeGreaterThanOrEqual(5);

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.some((model) => model.id === 'openai/gpt-5.4')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo-1106')).toBe(false);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-nano')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(false);
        expect(models.models.some((model) => model.id === 'openai/gpt-5' && model.supportsVision)).toBe(true);

        const codexModels = await caller.provider.listModels({ profileId, providerId: 'openai_codex' });
        const codex = codexModels.models.find((model) => model.id === 'openai_codex/gpt-5-codex');
        expect(codex).toBeDefined();
        expect(codex?.promptFamily).toBe('codex');
    });

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
        expect(frontier.supportsTools).toBe(true);
        expect(frontier.supportsReasoning).toBe(true);
        expect(frontier.supportsVision).toBe(true);
        expect(frontier.inputModalities.includes('image')).toBe(true);
        expect(frontier.promptFamily).toBe('anthropic');
        expect(frontier.contextLength).toBe(200000);
        expect(frontier.apiFamily).toBe('kilo_gateway');
        expect(frontier.routedApiFamily).toBe('anthropic_messages');
        expect(models.models.find((model) => model.id === 'moonshotai/kimi-k2.5')?.routedApiFamily).toBe(
            'openai_compatible'
        );
        expect(models.models.find((model) => model.id === 'z-ai/glm-5')?.routedApiFamily).toBe('openai_compatible');
        expect(models.models.find((model) => model.id === 'google/gemini-3.1-pro-preview')?.routedApiFamily).toBe(
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
        expect(models.models.find((model) => model.id === kiloBalancedModelId)?.routedApiFamily).toBe(
            'openai_compatible'
        );
        expect(models.models.find((model) => model.id === kiloFrontierModelId)?.routedApiFamily).toBe(
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

                if (url.endsWith('/providers')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [],
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
        expect(syncResult.modelCount).toBe(1);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        const kimi = models.models.find((model) => model.id === 'moonshot/kimi-k2');
        expect(kimi).toBeDefined();
        expect(kimi?.routedApiFamily).toBe('openai_compatible');
    });

    it('keeps synced Kilo catalog rows discoverable even when their routed family is unknown', async () => {
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
                        json: () => ({
                            data: [],
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
        expect(syncResult.modelCount).toBe(1);

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        const minimax = models.models.find((model) => model.id === 'minimax/minimax-m2.1:free');
        expect(minimax).toBeDefined();
        if (!minimax) {
            throw new Error('Expected minimax/minimax-m2.1:free in the Kilo catalog.');
        }

        expect(minimax.apiFamily).toBe('kilo_gateway');
        expect(minimax.toolProtocol).toBe('kilo_gateway');
        expect(minimax.routedApiFamily).toBeUndefined();

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        const shellMiniMax = shellBootstrap.providerModels.find((model) => model.id === 'minimax/minimax-m2.1:free');
        expect(shellMiniMax).toBeDefined();
        if (!shellMiniMax) {
            throw new Error('Expected minimax/minimax-m2.1:free in runtime shell bootstrap.');
        }

        expect(shellMiniMax.apiFamily).toBe('kilo_gateway');
        expect(shellMiniMax.toolProtocol).toBe('kilo_gateway');
        expect(shellMiniMax.routedApiFamily).toBeUndefined();
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
                            error: {
                                message: 'gateway unavailable',
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

    it('persists kilo browser auth and exposes the stored session token through provider credential queries', async () => {
        const caller = createCaller();
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
                                    deviceCode: 'kilo-device-code-1',
                                    userCode: 'KILO-CODE',
                                    verificationUrl: 'https://kilo.example/verify',
                                    poll_interval_seconds: 5,
                                    expiresIn: 900,
                                },
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/device-auth/codes/kilo-device-code-1')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                status: 'approved',
                                accessToken: 'kilo-session-token',
                                refreshToken: 'kilo-refresh-token',
                                expiresAt: '2026-03-11T16:00:00.000Z',
                                accountId: 'acct_kilo',
                                organizationId: 'org_kilo',
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
                                id: 'acct_kilo',
                                displayName: 'Neon User',
                                emailMasked: 'n***@example.com',
                                organizations: [
                                    {
                                        organization_id: 'org_kilo',
                                        name: 'Kilo Org',
                                        is_active: true,
                                        entitlement: {},
                                    },
                                ],
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/defaults') || url.endsWith('/api/organizations/org_kilo/defaults')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {},
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
                                balance: 18.42,
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
        expect(started.userCode).toBe('KILO-CODE');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'kilo',
            flowId: started.flow.id,
        });
        expect(polled.flow.status).toBe('completed');
        expect(polled.state.authState).toBe('authenticated');

        const credentialSummary = await caller.provider.getCredentialSummary({
            profileId,
            providerId: 'kilo',
        });
        expect(credentialSummary.credential).toMatchObject({
            providerId: 'kilo',
            hasStoredCredential: true,
            credentialSource: 'access_token',
        });
        expect(credentialSummary.credential.maskedValue).toContain('••••');

        const credentialValue = await caller.provider.getCredentialValue({
            profileId,
            providerId: 'kilo',
        });
        expect(credentialValue.credential?.value).toBe('kilo-session-token');

        const accountContext = await caller.provider.getAccountContext({
            profileId,
            providerId: 'kilo',
        });
        expect(accountContext.kiloAccountContext?.displayName).toBe('Neon User');
        expect(accountContext.kiloAccountContext?.organizations.some((organization) => organization.isActive)).toBe(
            true
        );
    });

    it('persists kilo identity from nested user payloads even when defaults sync fails', async () => {
        const caller = createCaller();
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
                                    deviceCode: 'kilo-device-code-nested',
                                    userCode: 'KILO-NESTED',
                                    verificationUrl: 'https://kilo.example/verify',
                                    poll_interval_seconds: 5,
                                    expiresIn: 900,
                                },
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/device-auth/codes/kilo-device-code-nested')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {
                                status: 'approved',
                                accessToken: 'kilo-session-token-nested',
                                refreshToken: 'kilo-refresh-token-nested',
                                expiresAt: '2026-03-11T16:00:00.000Z',
                                accountId: 'acct_nested',
                                organizationId: 'org_nested',
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
                                user: {
                                    id: 'acct_nested',
                                    name: 'Nested User',
                                    email: 'nested@example.com',
                                },
                                organizations: [
                                    {
                                        organization_id: 'org_nested',
                                        name: 'Nested Org',
                                        is_active: true,
                                        entitlement: {},
                                    },
                                ],
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/defaults') || url.endsWith('/api/organizations/org_nested/defaults')) {
                    return Promise.resolve({
                        ok: false,
                        status: 500,
                        statusText: 'Server Error',
                        json: () => ({
                            error: 'defaults unavailable',
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
                                balance: 7.25,
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
        expect(started.userCode).toBe('KILO-NESTED');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'kilo',
            flowId: started.flow.id,
        });
        expect(polled.flow.status).toBe('completed');
        expect(polled.state.authState).toBe('authenticated');

        const accountContext = await caller.provider.getAccountContext({
            profileId,
            providerId: 'kilo',
        });
        expect(accountContext.kiloAccountContext?.displayName).toBe('Nested User');
        expect(accountContext.kiloAccountContext?.emailMasked).toBe('nested@example.com');
        expect(accountContext.kiloAccountContext?.balance?.amount).toBe(7.25);
        expect(accountContext.kiloAccountContext?.organizations.some((organization) => organization.isActive)).toBe(
            true
        );
    });

    it('accepts a Kilo MiniMax default from account sync when that model already exists in the catalog', async () => {
        const caller = createCaller();

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'minimax/minimax-m2.1:free',
                label: 'MiniMax M2.1',
                upstreamProvider: 'minimax',
                isFree: true,
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                inputModalities: ['text'],
                outputModalities: ['text'],
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
