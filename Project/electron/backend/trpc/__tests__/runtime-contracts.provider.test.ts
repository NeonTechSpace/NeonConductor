import { describe, expect, it, vi } from 'vitest';


import { normalizeCatalogMetadata, toProviderCatalogUpsert } from '@/app/backend/providers/metadata/normalize';
import {
    listStaticModelDefinitions,
    toStaticProviderCatalogModel,
} from '@/app/backend/providers/metadata/staticCatalog/registry';
import {
    providerCatalogStore,
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    getPersistence,
    waitForRunStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: provider and account flows', () => {
    const profileId = runtimeContractProfileId;

    it('falls back to first runnable provider/model when defaults are not runnable', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Fallback provider response',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 14,
                    total_tokens: 24,
                },
            }),
        });
        vi.stubGlobal('fetch', completionFetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Provider fallback thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Fallback provider run',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected run start to be accepted.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        const runs = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        const latestRun = runs.runs.at(0);
        expect(latestRun).toBeDefined();
        if (!latestRun) {
            throw new Error('Expected fallback run.');
        }
        expect(latestRun.providerId).toBe('openai');
    });


    it('fails closed on invalid runtime options combinations', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-test-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Invalid Runtime Options Thread',
            kind: 'local',
        });

        await expect(
            caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Invalid manual cache',
                topLevelTab: 'chat',
                modeKey: 'chat',
                runtimeOptions: {
                    reasoning: {
                        effort: 'none',
                        summary: 'none',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'manual',
                    },
                    transport: {
                        openai: 'auto',
                    },
                },
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow('runtimeOptions.cache.key');
    });


    it('persists provider default in memory and lists models', async () => {
        const caller = createCaller();

        const providersBefore = await caller.provider.listProviders({ profileId });
        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.length).toBeGreaterThan(0);
        const firstModel = models.models.at(0);
        expect(firstModel).toBeDefined();
        if (!firstModel) {
            throw new Error('Expected openai model listing to include at least one model.');
        }
        expect(firstModel.supportsTools).toBeTypeOf('boolean');
        expect(firstModel.supportsReasoning).toBeTypeOf('boolean');
        expect(firstModel.inputModalities.includes('text')).toBe(true);
        expect(firstModel.outputModalities.includes('text')).toBe(true);

        const changed = await caller.provider.setDefault({
            profileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(changed.success).toBe(true);

        const providersAfter = await caller.provider.listProviders({ profileId });
        const defaultProvider = providersAfter.providers.find((item) => item.isDefault);

        expect(defaultProvider?.id).toBe('openai');
        expect(providersBefore.providers.some((item) => item.id === 'kilo')).toBe(true);
    });


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


    it('auto-backfills static openai catalogs from the local registry', async () => {
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
        expect(models.models.some((model) => model.id === 'openai/gpt-5-nano')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(true);
    });

    it('syncs openai api catalog and keeps codex model ids', async () => {
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
        expect(models.models.some((model) => model.id === 'openai/gpt-5-nano')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(true);
        const codex = models.models.find((model) => model.id === 'openai/gpt-5-codex');
        expect(codex?.promptFamily).toBe('codex');
        expect(models.models.some((model) => model.id === 'openai/gpt-5' && model.supportsVision)).toBe(true);
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
                                    id: 'kilo/auto',
                                    name: 'Kilo Auto',
                                    owned_by: 'kilo',
                                    context_length: 200000,
                                    supported_parameters: ['tools', 'reasoning'],
                                    architecture: {
                                        input_modalities: ['text', 'image'],
                                        output_modalities: ['text'],
                                    },
                                    opencode: {
                                        prompt: 'codex',
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
                            data: [{ id: 'openai', label: 'OpenAI' }],
                        }),
                    });
                }

                if (url.endsWith('/models-by-provider')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [{ provider: 'openai', models: ['openai/gpt-5-codex'] }],
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
        const kiloAuto = models.models.find((model) => model.id === 'kilo/auto');
        expect(kiloAuto).toBeDefined();
        if (!kiloAuto) {
            throw new Error('Expected kilo/auto model in synced catalog.');
        }
        expect(kiloAuto.supportsTools).toBe(true);
        expect(kiloAuto.supportsReasoning).toBe(true);
        expect(kiloAuto.supportsVision).toBe(true);
        expect(kiloAuto.inputModalities.includes('image')).toBe(true);
        expect(kiloAuto.promptFamily).toBe('codex');
        expect(kiloAuto.contextLength).toBe(200000);
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
                                    id: 'kilo/auto-openai',
                                    name: 'Kilo Auto Free',
                                    owned_by: 'openai',
                                    context_length: 200000,
                                    supported_parameters: ['tools'],
                                    architecture: {
                                        input_modalities: ['text'],
                                        output_modalities: ['text'],
                                    },
                                    pricing: {},
                                },
                                {
                                    id: 'kilo/auto-anthropic',
                                    name: 'Kilo Auto Free',
                                    owned_by: 'anthropic',
                                    context_length: 200000,
                                    supported_parameters: ['reasoning'],
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
                            data: [
                                { id: 'openai', label: 'OpenAI' },
                                { id: 'anthropic', label: 'Anthropic' },
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
                                { provider: 'openai', models: ['kilo/auto-openai'] },
                                { provider: 'anthropic', models: ['kilo/auto-anthropic'] },
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
        expect(models.models.some((model) => model.id === 'kilo/auto-openai')).toBe(true);
        expect(models.models.some((model) => model.id === 'kilo/auto-anthropic')).toBe(true);
        expect(models.models.filter((model) => model.label === 'Kilo Auto Free')).toHaveLength(2);
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


    it('supports openai oauth device auth start and pending polling', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    json: () => ({
                        device_code: 'device-code-1',
                        user_code: 'USER-CODE',
                        verification_uri: 'https://openai.example/verify',
                        interval: 5,
                        expires_in: 900,
                    }),
                })
                .mockResolvedValueOnce({
                    ok: false,
                    status: 400,
                    json: () => ({
                        error: 'authorization_pending',
                    }),
                })
        );

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'openai',
            method: 'oauth_device',
        });

        expect(started.flow.flowType).toBe('oauth_device');
        expect(started.flow.status).toBe('pending');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'openai',
            flowId: started.flow.id,
        });

        expect(polled.flow.status).toBe('pending');
        expect(polled.state.authState).toBe('pending');
    });


    it('supports openai oauth pkce completion and refresh', async () => {
        const caller = createCaller();
        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                access_token: 'aaa.bbb.ccc',
                refresh_token: 'refresh-token-1',
                expires_in: 1200,
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                access_token: 'ddd.eee.fff',
                refresh_token: 'refresh-token-2',
                expires_in: 1300,
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'openai',
            method: 'oauth_pkce',
        });

        const completed = await caller.provider.completeAuth({
            profileId,
            providerId: 'openai',
            flowId: started.flow.id,
            code: 'authorization-code',
        });
        expect(completed.flow.status).toBe('completed');
        expect(completed.state.authState).toBe('authenticated');

        const refreshed = await caller.provider.refreshAuth({
            profileId,
            providerId: 'openai',
        });
        expect(refreshed.state.authState).toBe('authenticated');

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(true);
        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(true);
    });


    it('reads openai subscription rate limits from wham usage for oauth sessions', async () => {
        const caller = createCaller();
        const fetchMock = vi.fn();
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                device_code: 'device-code-2',
                user_code: 'USER-DEVICE',
                verification_uri: 'https://openai.example/verify',
                interval: 5,
                expires_in: 900,
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            json: () => ({
                access_token: 'aaa.bbb.ccc',
                refresh_token: 'refresh-token-wham',
                expires_in: 1200,
                account_id: 'account_wham',
            }),
        });
        fetchMock.mockResolvedValueOnce({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                plan_type: 'pro',
                rate_limit: {
                    primary_window: {
                        used_percent: 42,
                        limit_window_seconds: 18_000,
                        reset_at: 1_763_000_000,
                    },
                    secondary_window: {
                        used_percent: 68,
                        limit_window_seconds: 604_800,
                        reset_at: 1_763_500_000,
                    },
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const started = await caller.provider.startAuth({
            profileId,
            providerId: 'openai',
            method: 'oauth_device',
        });
        const completed = await caller.provider.pollAuth({
            profileId,
            providerId: 'openai',
            flowId: started.flow.id,
        });
        expect(completed.flow.status).toBe('completed');
        expect(completed.state.authState).toBe('authenticated');

        const result = await caller.provider.getOpenAISubscriptionRateLimits({ profileId });
        expect(result.rateLimits.source).toBe('chatgpt_wham');
        expect(result.rateLimits.planType).toBe('pro');
        expect(result.rateLimits.primary?.windowMinutes).toBe(300);
        expect(result.rateLimits.secondary?.windowMinutes).toBe(10080);
        expect(result.rateLimits.primary?.usedPercent).toBe(42);
        expect(result.rateLimits.secondary?.usedPercent).toBe(68);

        const whamCall = fetchMock.mock.calls.at(2);
        expect(whamCall).toBeDefined();
        if (!whamCall) {
            throw new Error('Expected WHAM usage fetch call.');
        }
        const init = whamCall[1] as RequestInit;
        const headers = init.headers as Record<string, string>;
        expect(headers['Authorization']).toContain('Bearer');
        expect(headers['ChatGPT-Account-Id']).toBe('account_wham');
    });


    it('returns unavailable openai subscription rate limits for api-key auth', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-api-key-only',
        });
        expect(configured.success).toBe(true);

        const result = await caller.provider.getOpenAISubscriptionRateLimits({ profileId });
        expect(result.rateLimits.source).toBe('unavailable');
        expect(result.rateLimits.reason).toBe('oauth_required');
        expect(result.rateLimits.limits).toEqual([]);
    });


    it('rejects unsupported provider ids at contract boundaries and allows anthropic models through supported providers', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        await expect(
            caller.provider.listModels({
                profileId,
                providerId: 'anthropic' as unknown as 'kilo',
            })
        ).rejects.toThrow('Invalid "providerId"');

        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_model_catalog
                        (profile_id, provider_id, model_id, label, upstream_provider, is_free, supports_tools, supports_reasoning, context_length, pricing_json, raw_json, source, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'kilo',
                'anthropic/claude-sonnet-4.5',
                'Claude Sonnet 4.5',
                'anthropic',
                0,
                1,
                1,
                200000,
                '{}',
                '{}',
                'test',
                now
            );

        const setDefault = await caller.provider.setDefault({
            profileId,
            providerId: 'kilo',
            modelId: 'anthropic/claude-sonnet-4.5',
        });
        expect(setDefault.success).toBe(true);
    });

});
