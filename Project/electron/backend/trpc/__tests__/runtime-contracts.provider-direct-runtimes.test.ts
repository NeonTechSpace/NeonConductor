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
    it('skips prompt cache application when the selected kilo model does not support it', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn((_url: string) =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'Kilo no-cache response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 12,
                            total_tokens: 22,
                        },
                    }),
                })
            )
        );

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-no-cache-key',
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
                            routed_api_family,
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
                'kilo',
                'kilo/no-cache',
                'Kilo No Cache',
                'openai',
                0,
                1,
                1,
                0,
                0,
                0,
                0,
                'kilo_gateway',
                'kilo_gateway',
                'openai_compatible',
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
            title: 'Kilo no-cache thread',
            kind: 'local',
        });
        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Run without prompt cache support',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'kilo',
            modelId: 'kilo/no-cache',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected Kilo no-cache run to start.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        const runs = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        expect(runs.runs[0]?.cache?.applied).toBe(false);
        expect(runs.runs[0]?.cache?.reason).toBe('model_unsupported');
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

    it('starts direct Anthropic models on an Anthropic-compatible custom provider path', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    id: 'msg_direct_claude',
                    type: 'message',
                    content: [
                        {
                            type: 'text',
                            text: 'Direct Anthropic response',
                        },
                    ],
                    usage: {
                        input_tokens: 12,
                        output_tokens: 9,
                    },
                }),
                headers: {
                    get: () => 'application/json',
                },
            })
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-direct-anthropic-key',
        });
        expect(configured.success).toBe(true);
        const connectionProfileUpdated = await caller.provider.setConnectionProfile({
            profileId,
            providerId: 'openai',
            optionProfileId: 'default',
            baseUrlOverride: 'https://api.anthropic.com/v1',
        });
        expect(connectionProfileUpdated.connectionProfile.resolvedBaseUrl).toBe('https://api.anthropic.com/v1');

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('openai/claude-custom', 'openai', 'Claude Custom', now, now);
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
                            provider_settings_json,
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
                'openai/claude-custom',
                'Claude Custom',
                'anthropic',
                0,
                1,
                1,
                1,
                0,
                0,
                0,
                'anthropic_messages',
                'anthropic_messages',
                JSON.stringify(['text', 'image']),
                JSON.stringify(['text']),
                null,
                JSON.stringify({}),
                200000,
                '{}',
                '{}',
                'test',
                now
            );

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Direct anthropic thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try the direct anthropic runtime',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/claude-custom',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected direct Anthropic model to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        const runs = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        expect(runs.runs[0]?.transport?.selected).toBe('anthropic_messages');
        expect(runs.runs[0]?.errorCode).toBeUndefined();
    });

    it('starts direct Gemini models on a Gemini-compatible custom provider path', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn().mockResolvedValue({
                ok: true,
                status: 200,
                statusText: 'OK',
                json: () => ({
                    candidates: [
                        {
                            content: {
                                parts: [
                                    {
                                        text: 'Direct Gemini response',
                                    },
                                ],
                            },
                        },
                    ],
                    usageMetadata: {
                        promptTokenCount: 12,
                        candidatesTokenCount: 9,
                        totalTokenCount: 21,
                    },
                }),
                headers: {
                    get: () => 'application/json',
                },
            })
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-direct-gemini-key',
        });
        expect(configured.success).toBe(true);
        const connectionProfileUpdated = await caller.provider.setConnectionProfile({
            profileId,
            providerId: 'openai',
            optionProfileId: 'default',
            baseUrlOverride: 'https://generativelanguage.googleapis.com/v1beta',
        });
        expect(connectionProfileUpdated.connectionProfile.resolvedBaseUrl).toBe(
            'https://generativelanguage.googleapis.com/v1beta'
        );

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('openai/gemini-custom', 'openai', 'Gemini Custom', now, now);
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
                'openai/gemini-custom',
                'Gemini Custom',
                'google',
                0,
                1,
                1,
                1,
                0,
                0,
                0,
                'google_generativeai',
                'google_generativeai',
                JSON.stringify({ runtime: 'google_generativeai' }),
                JSON.stringify(['text', 'image']),
                JSON.stringify(['text']),
                null,
                200000,
                '{}',
                '{}',
                'test',
                now
            );

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Direct Gemini thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try the direct Gemini runtime',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gemini-custom',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected direct Gemini model to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        const runs = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        expect(runs.runs[0]?.transport?.selected).toBe('google_generativeai');
        expect(runs.runs[0]?.errorCode).toBeUndefined();
    });
});
