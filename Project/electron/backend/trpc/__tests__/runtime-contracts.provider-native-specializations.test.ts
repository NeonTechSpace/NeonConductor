import { describe, expect, it, vi } from 'vitest';

import {
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
    it('fails closed for provider-native models on incompatible provider paths', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-native-specialization-key',
        });
        expect(configured.success).toBe(true);

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO provider_model_catalog
                        (
                            profile_id,
                            provider_id,
                            model_id,
                            label,
                            upstream_provider,
                            is_free,
                            supports_tools,
                            supports_reasoning,
                            supports_vision,
                            supports_audio_input,
                            supports_audio_output,
                            supports_prompt_cache,
                            tool_protocol,
                            api_family,
                            provider_settings_json,
                            input_modalities_json,
                            output_modalities_json,
                            prompt_family,
                            context_length,
                            pricing_json,
                            raw_json,
                            source,
                            updated_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'openai',
                'openai/minimax-native',
                'MiniMax Native',
                'minimax',
                0,
                1,
                1,
                0,
                0,
                0,
                0,
                'provider_native',
                'provider_native',
                JSON.stringify({ providerNativeId: 'minimax_openai_compat' }),
                JSON.stringify(['text']),
                JSON.stringify(['text']),
                null,
                128000,
                '{}',
                '{}',
                'test',
                now
            );

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Provider native protocol thread',
            kind: 'local',
        });
        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try the provider native model',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/minimax-native',
        });

        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected provider-native model to be rejected without specialization.');
        }
        expect(started.code).toBe('runtime_option_invalid');
        expect(started.message).toContain('provider-native runtime specialization');
        expect(started.action).toEqual({
            code: 'provider_native_unsupported',
            providerId: 'openai',
            modelId: 'openai/minimax-native',
        });
    });

    it('executes provider-native models through the registered MiniMax specialization', async () => {
        const caller = createCaller();
        const originalOpenAIBaseUrl = process.env['OPENAI_BASE_URL'];
        process.env['OPENAI_BASE_URL'] = 'https://api.minimax.io/v1';

        try {
            const fetchMock = vi.fn((_url: string, _init?: RequestInit) =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'MiniMax provider-native response',
                                    reasoning_details: [
                                        {
                                            type: 'reasoning.text',
                                            text: 'Reasoning block',
                                        },
                                    ],
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 11,
                            completion_tokens: 7,
                            total_tokens: 18,
                        },
                    }),
                })
            );
            vi.stubGlobal('fetch', fetchMock);

            const configured = await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-minimax-compatible-key',
            });
            expect(configured.success).toBe(true);

            const { sqlite } = getPersistence();
            const now = new Date().toISOString();
            sqlite
                .prepare(
                    `
                        INSERT OR REPLACE INTO provider_model_catalog
                            (
                                profile_id,
                                provider_id,
                                model_id,
                                label,
                                upstream_provider,
                                is_free,
                                supports_tools,
                                supports_reasoning,
                                supports_vision,
                                supports_audio_input,
                                supports_audio_output,
                                supports_prompt_cache,
                                tool_protocol,
                                api_family,
                                provider_settings_json,
                                input_modalities_json,
                                output_modalities_json,
                                prompt_family,
                                context_length,
                                pricing_json,
                                raw_json,
                                source,
                                updated_at
                            )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `
                )
                .run(
                    profileId,
                    'openai',
                    'openai/minimax-native',
                    'MiniMax Native',
                    'minimax',
                    0,
                    1,
                    1,
                    0,
                    0,
                    0,
                    0,
                    'provider_native',
                    'provider_native',
                    JSON.stringify({ providerNativeId: 'minimax_openai_compat' }),
                    JSON.stringify(['text']),
                    JSON.stringify(['text']),
                    null,
                    128000,
                    '{}',
                    '{}',
                    'test',
                    now
                );

            const created = await createSessionInScope(caller, profileId, {
                scope: 'detached',
                title: 'Provider native specialization thread',
                kind: 'local',
            });
            const started = await caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Use the provider native specialization',
                topLevelTab: 'chat',
                modeKey: 'chat',
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/minimax-native',
            });

            expect(started.accepted).toBe(true);
            if (!started.accepted) {
                throw new Error('Expected provider-native specialization run to start.');
            }

            await waitForRunStatus(caller, profileId, created.session.id, 'completed');
            const runs = await caller.session.listRuns({
                profileId,
                sessionId: created.session.id,
            });
            expect(runs.runs[0]?.transport?.selected).toBe('provider_native');

            const firstRequestInit = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
            expect(firstRequestInit).toBeDefined();
            const firstRequestBody =
                firstRequestInit && typeof firstRequestInit.body === 'string'
                    ? JSON.parse(firstRequestInit.body)
                    : undefined;
            expect(firstRequestBody?.['reasoning_split']).toBe(true);
        } finally {
            if (originalOpenAIBaseUrl === undefined) {
                delete process.env['OPENAI_BASE_URL'];
            } else {
                process.env['OPENAI_BASE_URL'] = originalOpenAIBaseUrl;
            }
        }
    });

    it('rejects MiniMax-looking provider-native models that lack trusted specialization metadata', async () => {
        const caller = createCaller();
        const originalOpenAIBaseUrl = process.env['OPENAI_BASE_URL'];
        process.env['OPENAI_BASE_URL'] = 'https://api.minimax.io/v1';

        try {
            const configured = await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-minimax-untrusted-key',
            });
            expect(configured.success).toBe(true);

            const { sqlite } = getPersistence();
            const now = new Date().toISOString();
            sqlite
                .prepare(
                    `
                        INSERT OR REPLACE INTO provider_model_catalog
                            (
                                profile_id,
                                provider_id,
                                model_id,
                                label,
                                upstream_provider,
                                is_free,
                                supports_tools,
                                supports_reasoning,
                                supports_vision,
                                supports_audio_input,
                                supports_audio_output,
                                supports_prompt_cache,
                                tool_protocol,
                                api_family,
                                input_modalities_json,
                                output_modalities_json,
                                prompt_family,
                                context_length,
                                pricing_json,
                                raw_json,
                                source,
                                updated_at
                            )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `
                )
                .run(
                    profileId,
                    'openai',
                    'openai/minimax-legacy',
                    'MiniMax Legacy',
                    'minimax',
                    0,
                    1,
                    1,
                    0,
                    0,
                    0,
                    0,
                    'provider_native',
                    'provider_native',
                    JSON.stringify(['text']),
                    JSON.stringify(['text']),
                    null,
                    128000,
                    '{}',
                    '{}',
                    'test',
                    now
                );

            const created = await createSessionInScope(caller, profileId, {
                scope: 'detached',
                title: 'Untrusted provider native thread',
                kind: 'local',
            });
            const started = await caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Try the untrusted provider native model',
                topLevelTab: 'chat',
                modeKey: 'chat',
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/minimax-legacy',
            });

            expect(started.accepted).toBe(false);
            if (started.accepted) {
                throw new Error('Expected untrusted provider-native model to be rejected.');
            }
            expect(started.code).toBe('runtime_option_invalid');
            expect(started.action).toEqual({
                code: 'provider_native_unsupported',
                providerId: 'openai',
                modelId: 'openai/minimax-legacy',
            });
        } finally {
            if (originalOpenAIBaseUrl === undefined) {
                delete process.env['OPENAI_BASE_URL'];
            } else {
                process.env['OPENAI_BASE_URL'] = originalOpenAIBaseUrl;
            }
        }
    });

    it('fails provider-native runs closed when MiniMax native stream frames are malformed', async () => {
        const caller = createCaller();
        const originalOpenAIBaseUrl = process.env['OPENAI_BASE_URL'];
        process.env['OPENAI_BASE_URL'] = 'https://api.minimax.io/v1';

        try {
            vi.stubGlobal(
                'fetch',
                vi.fn().mockResolvedValue(
                    new Response('data: {"choices":[}\n\ndata: [DONE]\n\n', {
                        headers: {
                            'content-type': 'text/event-stream',
                        },
                    })
                )
            );

            const configured = await caller.provider.setApiKey({
                profileId,
                providerId: 'openai',
                apiKey: 'openai-minimax-malformed-stream-key',
            });
            expect(configured.success).toBe(true);

            const { sqlite } = getPersistence();
            const now = new Date().toISOString();
            sqlite
                .prepare(
                    `
                        INSERT OR REPLACE INTO provider_model_catalog
                            (
                                profile_id,
                                provider_id,
                                model_id,
                                label,
                                upstream_provider,
                                is_free,
                                supports_tools,
                                supports_reasoning,
                                supports_vision,
                                supports_audio_input,
                                supports_audio_output,
                                supports_prompt_cache,
                                tool_protocol,
                                api_family,
                                provider_settings_json,
                                input_modalities_json,
                                output_modalities_json,
                                prompt_family,
                                context_length,
                                pricing_json,
                                raw_json,
                                source,
                                updated_at
                            )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `
                )
                .run(
                    profileId,
                    'openai',
                    'openai/minimax-native',
                    'MiniMax Native',
                    'minimax',
                    0,
                    1,
                    1,
                    0,
                    0,
                    0,
                    0,
                    'provider_native',
                    'provider_native',
                    JSON.stringify({ providerNativeId: 'minimax_openai_compat' }),
                    JSON.stringify(['text']),
                    JSON.stringify(['text']),
                    null,
                    128000,
                    '{}',
                    '{}',
                    'test',
                    now
                );

            const created = await createSessionInScope(caller, profileId, {
                scope: 'detached',
                title: 'Provider native malformed stream thread',
                kind: 'local',
            });
            const started = await caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Use the provider native specialization with malformed frames',
                topLevelTab: 'chat',
                modeKey: 'chat',
                runtimeOptions: defaultRuntimeOptions,
                providerId: 'openai',
                modelId: 'openai/minimax-native',
            });

            expect(started.accepted).toBe(true);
            if (!started.accepted) {
                throw new Error('Expected malformed provider-native run to start and then fail closed.');
            }

            await waitForRunStatus(caller, profileId, created.session.id, 'error');
            const runs = await caller.session.listRuns({
                profileId,
                sessionId: created.session.id,
            });
            expect(runs.runs[0]?.errorCode).toBe('invalid_payload');
            expect(runs.runs[0]?.errorMessage).toContain('invalid JSON payload');
        } finally {
            if (originalOpenAIBaseUrl === undefined) {
                delete process.env['OPENAI_BASE_URL'];
            } else {
                process.env['OPENAI_BASE_URL'] = originalOpenAIBaseUrl;
            }
        }
    });

});
