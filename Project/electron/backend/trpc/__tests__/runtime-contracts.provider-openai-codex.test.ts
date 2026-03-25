import { describe, expect, it, vi } from 'vitest';

import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
import { providerCatalogStore, runtimeContractProfileId, registerRuntimeContractHooks, createCaller, createSessionInScope, defaultRuntimeOptions, getPersistence, waitForRunStatus } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: provider and account flows', () => {
    const profileId = runtimeContractProfileId;
    it('supports openai codex oauth device auth start and pending polling', async () => {
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
            providerId: 'openai_codex',
            method: 'oauth_device',
        });

        expect(started.flow.flowType).toBe('oauth_device');
        expect(started.flow.status).toBe('pending');

        const polled = await caller.provider.pollAuth({
            profileId,
            providerId: 'openai_codex',
            flowId: started.flow.id,
        });

        expect(polled.flow.status).toBe('pending');
        expect(polled.state.authState).toBe('pending');
    });

    it('supports openai codex oauth pkce completion and refresh', async () => {
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
            providerId: 'openai_codex',
            method: 'oauth_pkce',
        });

        const completed = await caller.provider.completeAuth({
            profileId,
            providerId: 'openai_codex',
            flowId: started.flow.id,
            code: 'authorization-code',
        });
        expect(completed.flow.status).toBe('completed');
        expect(completed.state.authState).toBe('authenticated');

        const refreshed = await caller.provider.refreshAuth({
            profileId,
            providerId: 'openai_codex',
        });
        expect(refreshed.state.authState).toBe('authenticated');

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai_codex',
        });
        expect(syncResult.ok).toBe(true);
        const models = await caller.provider.listModels({ profileId, providerId: 'openai_codex' });
        expect(models.models.some((model) => model.id === 'openai_codex/gpt-5-codex')).toBe(true);
    });

    it('reads openai codex subscription rate limits from wham usage for oauth sessions', async () => {
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
            providerId: 'openai_codex',
            method: 'oauth_device',
        });
        const completed = await caller.provider.pollAuth({
            profileId,
            providerId: 'openai_codex',
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

    it('round-trips provider metadata fields through provider.listModels and runtime.getShellBootstrap', async () => {
        const caller = createCaller();

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        const gpt54 = models.models.find((model) => model.id === 'openai/gpt-5.4');
        expect(gpt54).toBeDefined();
        if (!gpt54) {
            throw new Error('Expected openai/gpt-5.4 in the OpenAI catalog.');
        }

        expect(gpt54.features.supportsPromptCache).toBe(true);
        expect(gpt54.runtime.toolProtocol).toBe('openai_responses');
        if (gpt54.runtime.toolProtocol !== 'openai_responses') {
            throw new Error('Expected OpenAI responses runtime.');
        }
        expect(gpt54.runtime.supportsRealtimeWebSocket).toBe(true);
        expect(gpt54.runtime.apiFamily).toBe('openai_compatible');

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        const shellGpt54 = shellBootstrap.providerModels.find((model) => model.id === 'openai/gpt-5.4');
        expect(shellGpt54).toBeDefined();
        if (!shellGpt54) {
            throw new Error('Expected openai/gpt-5.4 in runtime shell bootstrap.');
        }

        expect(shellGpt54.features.supportsPromptCache).toBe(true);
        expect(shellGpt54.runtime.toolProtocol).toBe('openai_responses');
        if (shellGpt54.runtime.toolProtocol !== 'openai_responses') {
            throw new Error('Expected OpenAI responses runtime.');
        }
        expect(shellGpt54.runtime.supportsRealtimeWebSocket).toBe(true);
        expect(shellGpt54.runtime.apiFamily).toBe('openai_compatible');
    });

    it('round-trips Kilo routed upstream family metadata through provider.listModels and runtime.getShellBootstrap', async () => {
        const caller = createCaller();

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'anthropic/claude-sonnet-4.5',
                label: 'Claude Sonnet 4.5',
                upstreamProvider: 'anthropic',
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: true,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text', 'image'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'anthropic_messages',
                },
                pricing: {},
                raw: {},
                source: 'test',
            },
        ]);
        await providerMetadataOrchestrator.flushProviderScope(profileId, 'kilo');

        const models = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        const claude = models.models.find((model) => model.id === 'anthropic/claude-sonnet-4.5');
        expect(claude).toBeDefined();
        if (!claude) {
            throw new Error('Expected anthropic/claude-sonnet-4.5 in the Kilo catalog.');
        }

        expect(claude.runtime.apiFamily).toBe('kilo_gateway');
        expect(claude.runtime.toolProtocol).toBe('kilo_gateway');
        if (claude.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected Kilo gateway runtime.');
        }
        expect(claude.runtime.routedApiFamily).toBe('anthropic_messages');

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        const shellClaude = shellBootstrap.providerModels.find((model) => model.id === 'anthropic/claude-sonnet-4.5');
        expect(shellClaude).toBeDefined();
        if (!shellClaude) {
            throw new Error('Expected anthropic/claude-sonnet-4.5 in runtime shell bootstrap.');
        }

        expect(shellClaude.runtime.apiFamily).toBe('kilo_gateway');
        expect(shellClaude.runtime.toolProtocol).toBe('kilo_gateway');
        if (shellClaude.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected Kilo gateway runtime.');
        }
        expect(shellClaude.runtime.routedApiFamily).toBe('anthropic_messages');
    });

    it('executes Kilo-routed Gemini models on the Kilo transport and preserves routed reasoning parts', async () => {
        const caller = createCaller();
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            reasoning_details: [
                                {
                                    type: 'reasoning.summary',
                                    summary: 'Need the README first',
                                    id: 'call_readme',
                                    format: 'google-gemini-v1',
                                    index: 0,
                                },
                            ],
                            content: 'Gemini via Kilo',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 10,
                    completion_tokens: 8,
                    total_tokens: 18,
                },
            }),
        });
        vi.stubGlobal('fetch', fetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-gemini-routed-key',
        });
        expect(configured.success).toBe(true);

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'google/gemini-2.5-pro',
                label: 'Gemini 2.5 Pro',
                upstreamProvider: 'google',
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: true,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text', 'image'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'google_generativeai',
                },
                pricing: {},
                raw: {},
                source: 'test',
            },
        ]);
        await providerMetadataOrchestrator.flushProviderScope(profileId, 'kilo');

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Kilo routed Gemini thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Explain the plan',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'kilo',
            modelId: 'google/gemini-2.5-pro',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected Kilo-routed Gemini run to start.');
        }
        expect(
            started.initialMessages.messageParts.some(
                (part) =>
                    part.partType === 'status' &&
                    part.payload['code'] === 'received' &&
                    part.payload['label'] === 'Agent received message'
            )
        ).toBe(true);

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        const runs = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        expect(runs.runs[0]?.providerId).toBe('kilo');
        expect(runs.runs[0]?.transport?.selected).toBe('kilo_gateway');

        const { sqlite } = getPersistence();
        const assistantParts = sqlite
            .prepare(
                `
                    SELECT mp.part_type AS partType, mp.payload_json AS payloadJson
                    FROM message_parts mp
                    INNER JOIN messages m ON m.id = mp.message_id
                    WHERE m.session_id = ? AND m.role = 'assistant'
                    ORDER BY mp.sequence ASC
                `
            )
            .all(created.session.id) as Array<{
            partType: string;
            payloadJson: string;
        }>;

        expect(assistantParts[0]?.partType).toBe('status');
        expect(JSON.parse(assistantParts[0]?.payloadJson ?? '{}')).toMatchObject({
            code: 'received',
            label: 'Agent received message',
        });
        expect(assistantParts.some((part) => part.partType === 'reasoning_summary')).toBe(true);
        const reasoningSummaryPart = assistantParts.find((part) => part.partType === 'reasoning_summary');
        expect(reasoningSummaryPart).toBeDefined();
        if (!reasoningSummaryPart) {
            throw new Error('Expected a persisted Gemini reasoning summary part.');
        }
        expect(JSON.parse(reasoningSummaryPart.payloadJson)).toMatchObject({
            text: 'Need the README first',
            detailType: 'reasoning.summary',
            detailId: 'call_readme',
            detailFormat: 'google-gemini-v1',
            detailIndex: 0,
        });
    });

    it('fails runs that never stream a first output chunk and persists stalled lifecycle status parts', async () => {
        const caller = createCaller();
        vi.useFakeTimers();

        try {
            vi.stubGlobal(
                'fetch',
                vi.fn((_input: unknown, init?: RequestInit) => {
                    return new Promise<Response>((_resolve, reject) => {
                        const signal = init?.signal;
                        if (!signal) {
                            return;
                        }

                        if (signal.aborted) {
                            reject(new DOMException('Aborted', 'AbortError'));
                            return;
                        }

                        signal.addEventListener(
                            'abort',
                            () => {
                                reject(new DOMException('Aborted', 'AbortError'));
                            },
                            { once: true }
                        );
                    });
                })
            );

            const configured = await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-no-output-timeout-key',
            });
            expect(configured.success).toBe(true);

            const created = await createSessionInScope(caller, profileId, {
                scope: 'detached',
                title: 'No output timeout thread',
                kind: 'local',
            });

            const started = await caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Start but never respond',
                topLevelTab: 'chat',
                modeKey: 'chat',
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            });
            expect(started.accepted).toBe(true);
            if (!started.accepted) {
                throw new Error('Expected no-output run to be accepted before timing out.');
            }

            expect(
                started.initialMessages.messageParts.some(
                    (part) =>
                        part.partType === 'status' &&
                        part.payload['code'] === 'received' &&
                        part.payload['label'] === 'Agent received message'
                )
            ).toBe(true);

            await vi.advanceTimersByTimeAsync(10_000);

            const stalledMessages = await caller.session.listMessages({
                profileId,
                sessionId: created.session.id,
            });
            expect(
                stalledMessages.messageParts.some(
                    (part) =>
                        part.partType === 'status' &&
                        part.payload['code'] === 'stalled' &&
                        part.payload['label'] === 'Still waiting for the first response chunk...'
                )
            ).toBe(true);

            await vi.advanceTimersByTimeAsync(20_000);

            const runs = await caller.session.listRuns({
                profileId,
                sessionId: created.session.id,
            });
            expect(runs.runs[0]?.status).toBe('error');
            expect(runs.runs[0]?.errorCode).toBe('provider_first_output_timeout');
            expect(runs.runs[0]?.errorMessage).toContain('30 seconds');

            const timedOutMessages = await caller.session.listMessages({
                profileId,
                sessionId: created.session.id,
            });
            expect(
                timedOutMessages.messageParts.some(
                    (part) =>
                        part.partType === 'status' &&
                        part.payload['code'] === 'failed_before_output' &&
                        part.payload['label'] === 'Agent timed out before sending the first response chunk.'
                )
            ).toBe(true);

            const status = await caller.session.status({
                profileId,
                sessionId: created.session.id,
            });
            expect(status.found).toBe(true);
            if (!status.found) {
                throw new Error('Expected session status to be available after timeout.');
            }
            expect(status.session.runStatus).toBe('error');
        } finally {
            vi.useRealTimers();
        }
    });

    it('round-trips connection profile base URL overrides through provider settings contracts', async () => {
        const caller = createCaller();

        const updated = await caller.provider.setConnectionProfile({
            profileId,
            providerId: 'openai',
            optionProfileId: 'default',
            baseUrlOverride: 'https://custom-openai-gateway.example/v1',
        });
        expect(updated.connectionProfile.baseUrlOverride).toBe('https://custom-openai-gateway.example/v1');
        expect(updated.connectionProfile.resolvedBaseUrl).toBe('https://custom-openai-gateway.example/v1');

        const fetched = await caller.provider.getConnectionProfile({
            profileId,
            providerId: 'openai',
        });
        expect(fetched.connectionProfile.baseUrlOverride).toBe('https://custom-openai-gateway.example/v1');
        expect(fetched.connectionProfile.resolvedBaseUrl).toBe('https://custom-openai-gateway.example/v1');

        const providers = await caller.provider.listProviders({ profileId });
        const openAiProvider = providers.providers.find((provider) => provider.id === 'openai');
        expect(openAiProvider?.connectionProfile.baseUrlOverride).toBe('https://custom-openai-gateway.example/v1');
        expect(openAiProvider?.connectionProfile.resolvedBaseUrl).toBe('https://custom-openai-gateway.example/v1');
    });

    it('persists OpenAI execution preference and projects eligibility through provider settings contracts', async () => {
        const caller = createCaller();

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-realtime-key',
        });
        expect(configured.success).toBe(true);

        const initialPreference = await caller.provider.getExecutionPreference({
            profileId,
            providerId: 'openai',
        });
        expect(initialPreference.executionPreference.canUseRealtimeWebSocket).toBe(true);
        expect(initialPreference.executionPreference.mode).toBe('standard_http');

        const updatedPreference = await caller.provider.setExecutionPreference({
            profileId,
            providerId: 'openai',
            mode: 'realtime_websocket',
        });
        expect(updatedPreference.executionPreference).toEqual({
            providerId: 'openai',
            mode: 'realtime_websocket',
            canUseRealtimeWebSocket: true,
        });

        const providers = await caller.provider.listProviders({ profileId });
        const openAiProvider = providers.providers.find((provider) => provider.id === 'openai');
        expect(openAiProvider?.executionPreference).toEqual({
            providerId: 'openai',
            mode: 'realtime_websocket',
            canUseRealtimeWebSocket: true,
        });
    });

    it('rejects chat runs when OpenAI realtime websocket mode is selected', async () => {
        const caller = createCaller();

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-realtime-chat-key',
        });
        expect(configured.success).toBe(true);

        const preference = await caller.provider.setExecutionPreference({
            profileId,
            providerId: 'openai',
            mode: 'realtime_websocket',
        });
        expect(preference.executionPreference.mode).toBe('realtime_websocket');

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Realtime websocket chat thread',
            kind: 'local',
            topLevelTab: 'chat',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try realtime in chat',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
        });

        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected chat-mode realtime websocket run to be rejected.');
        }
        expect(started.code).toBe('runtime_option_invalid');
        expect(started.action).toEqual({
            code: 'runtime_options_invalid',
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
            detail: 'chat_mode_not_supported',
        });
    });

    it('rejects realtime websocket mode when the OpenAI provider uses a custom base URL override', async () => {
        const caller = createCaller();

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-realtime-custom-base-url-key',
        });
        expect(configured.success).toBe(true);

        const updatedProfile = await caller.provider.setConnectionProfile({
            profileId,
            providerId: 'openai',
            optionProfileId: 'default',
            baseUrlOverride: 'https://custom-openai-gateway.example/v1',
        });
        expect(updatedProfile.connectionProfile.resolvedBaseUrl).toBe('https://custom-openai-gateway.example/v1');

        const preference = await caller.provider.setExecutionPreference({
            profileId,
            providerId: 'openai',
            mode: 'realtime_websocket',
        });
        expect(preference.executionPreference).toEqual({
            providerId: 'openai',
            mode: 'realtime_websocket',
            canUseRealtimeWebSocket: false,
            disabledReason: 'base_url_not_supported',
        });

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_realtime_custom_base_url',
            title: 'Realtime websocket custom base URL thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try realtime on a custom base URL',
            topLevelTab: 'agent',
            modeKey: 'code',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
        });

        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected custom-base URL realtime websocket run to fail closed.');
        }
        expect(started.code).toBe('runtime_option_invalid');
        expect(started.action).toEqual({
            code: 'runtime_options_invalid',
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
            detail: 'base_url_not_supported',
        });
    });

    it('returns the correct moonshot model set immediately after endpoint profile changes', async () => {
        const caller = createCaller();

        const standardModels = await caller.provider.listModels({ profileId, providerId: 'moonshot' });
        expect(standardModels.models.some((model) => model.id === 'moonshot/kimi-for-coding')).toBe(false);

        const codingProfile = await caller.provider.setConnectionProfile({
            profileId,
            providerId: 'moonshot',
            optionProfileId: 'coding_plan',
        });
        expect(codingProfile.models.some((model) => model.id === 'moonshot/kimi-for-coding')).toBe(true);

        const standardProfile = await caller.provider.setConnectionProfile({
            profileId,
            providerId: 'moonshot',
            optionProfileId: 'standard_api',
        });
        expect(standardProfile.models.some((model) => model.id === 'moonshot/kimi-for-coding')).toBe(false);
    });

    it('refreshes kilo organization-scoped catalogs instead of reusing stale models', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((url: string, init?: RequestInit) => {
                const headers = (init?.headers ?? {}) as Record<string, string>;
                const organizationId = headers['X-KiloCode-OrganizationId'] ?? null;
                const modelId = organizationId === 'org_b' ? 'kilo/org-b' : 'kilo/org-a';
                const label = organizationId === 'org_b' ? 'Kilo Org B' : 'Kilo Org A';

                if (url.endsWith('/models')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: [
                                {
                                    id: modelId,
                                    name: label,
                                    owned_by: 'openai',
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
                            data: [{ provider: 'openai', models: [modelId] }],
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
                                        organization_id: 'org_a',
                                        name: 'Org A',
                                        is_active: organizationId !== 'org_b',
                                        entitlement: {},
                                    },
                                    {
                                        organization_id: 'org_b',
                                        name: 'Org B',
                                        is_active: organizationId === 'org_b',
                                        entitlement: {},
                                    },
                                ],
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
                                balance: 18.42,
                                currency: 'USD',
                            },
                        }),
                    });
                }

                if (url.endsWith('/api/defaults') || url.endsWith('/api/organizations/org_b/defaults')) {
                    return Promise.resolve({
                        ok: true,
                        status: 200,
                        statusText: 'OK',
                        json: () => ({
                            data: {},
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

        const initialModels = await caller.provider.listModels({ profileId, providerId: 'kilo' });
        expect(initialModels.models.some((model) => model.id === 'kilo/org-a')).toBe(true);
        expect(initialModels.models.some((model) => model.id === 'kilo/org-b')).toBe(false);

        const organizationResult = await caller.provider.setOrganization({
            profileId,
            providerId: 'kilo',
            organizationId: 'org_b',
        });
        expect(organizationResult.models.some((model) => model.id === 'kilo/org-b')).toBe(true);
        expect(organizationResult.models.some((model) => model.id === 'kilo/org-a')).toBe(false);
    });
});
