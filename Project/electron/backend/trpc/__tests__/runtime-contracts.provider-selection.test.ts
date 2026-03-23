import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';

import { runtimeContractProfileId, registerRuntimeContractHooks, createCaller, createSessionInScope, defaultRuntimeOptions, getPersistence, waitForRunStatus } from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

function buildTinyPngBase64(): string {
    return Buffer.from(
        Uint8Array.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00,
            0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x04, 0x00, 0x00, 0x00, 0xb5, 0x1c, 0x0c, 0x02, 0x00, 0x00, 0x00,
            0x0b, 0x49, 0x44, 0x41, 0x54, 0x78, 0xda, 0x63, 0xfc, 0xff, 0x1f, 0x00, 0x02, 0xeb, 0x01, 0xf6, 0xcf, 0x28,
            0x14, 0xac, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
        ])
    ).toString('base64');
}

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

    it('fails closed when an explicit model is unavailable instead of falling back', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-explicit-model-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Explicit unavailable model thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try the missing model',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/not-a-real-model',
        });
        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected explicit unavailable model to be rejected.');
        }
        expect(started.code).toBe('provider_model_not_available');
        expect(started.message).toContain('openai/not-a-real-model');
        expect(started.action).toEqual({
            code: 'model_unavailable',
            providerId: 'openai',
            modelId: 'openai/not-a-real-model',
        });
    });

    it('returns typed provider auth guidance when an explicit provider is not runnable', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Explicit unauthenticated provider thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try the disconnected provider',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected unauthenticated provider to be rejected.');
        }
        expect(started.code).toBe('provider_not_authenticated');
        expect(started.action).toEqual({
            code: 'provider_not_runnable',
            providerId: 'openai',
        });
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
                        family: 'auto',
                    },
                },
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            })
        ).rejects.toThrow('runtimeOptions.cache.key');
    });

    it('rejects tool-capable agent runs when the selected model does not support native tools', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-no-tools-key',
        });
        expect(configured.success).toBe(true);

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('openai/gpt-5-no-tools', 'openai', 'GPT 5 No Tools', now, now);
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
                            tool_protocol,
                            input_modalities_json,
                            output_modalities_json,
                            prompt_family,
                            context_length,
                            pricing_json,
                            raw_json,
                            source,
                            updated_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'openai',
                'openai/gpt-5-no-tools',
                'GPT 5 No Tools',
                'openai',
                0,
                0,
                1,
                0,
                0,
                0,
                'openai_responses',
                JSON.stringify(['text']),
                JSON.stringify(['text']),
                null,
                128000,
                '{}',
                '{}',
                'test',
                now
            );

        const workspaceFingerprint = 'ws_no_tools_agent';
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint,
            title: 'No Tools Agent Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Try to inspect the workspace',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-tools',
        });
        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected tool-capable agent run to be rejected.');
        }
        expect(started.code).toBe('runtime_option_invalid');
        expect(started.message).toContain('does not support native tool calling');
        expect(started.action).toEqual({
            code: 'model_tools_required',
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-tools',
            modeKey: 'code',
        });
    });

    it('rejects ask and orchestrator read modes when the selected model does not support native tools', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-read-modes-no-tools-key',
        });
        expect(configured.success).toBe(true);

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('openai/gpt-5-no-tools', 'openai', 'GPT 5 No Tools', now, now);
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
                            tool_protocol,
                            input_modalities_json,
                            output_modalities_json,
                            prompt_family,
                            context_length,
                            pricing_json,
                            raw_json,
                            source,
                            updated_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'openai',
                'openai/gpt-5-no-tools',
                'GPT 5 No Tools',
                'openai',
                0,
                0,
                1,
                0,
                0,
                0,
                'openai_responses',
                JSON.stringify(['text']),
                JSON.stringify(['text']),
                null,
                128000,
                '{}',
                '{}',
                'test',
                now
            );

        const askSession = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_no_tools_agent_ask',
            title: 'No Tools Agent Ask Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const askStarted = await caller.session.startRun({
            profileId,
            sessionId: askSession.session.id,
            prompt: 'Try to inspect the workspace safely',
            topLevelTab: 'agent',
            modeKey: 'ask',
            workspaceFingerprint: 'ws_no_tools_agent_ask',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-tools',
        });
        expect(askStarted.accepted).toBe(false);
        if (askStarted.accepted) {
            throw new Error('Expected ask mode to reject models without native tools.');
        }
        expect(askStarted.code).toBe('runtime_option_invalid');
        expect(askStarted.action).toEqual({
            code: 'model_tools_required',
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-tools',
            modeKey: 'ask',
        });

        const orchestratorSession = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_no_tools_orchestrator_debug',
            title: 'No Tools Orchestrator Debug Thread',
            kind: 'local',
            topLevelTab: 'orchestrator',
        });
        const orchestratorStarted = await caller.session.startRun({
            profileId,
            sessionId: orchestratorSession.session.id,
            prompt: 'Try to inspect the workspace from orchestrator debug',
            topLevelTab: 'orchestrator',
            modeKey: 'debug',
            workspaceFingerprint: 'ws_no_tools_orchestrator_debug',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-tools',
        });
        expect(orchestratorStarted.accepted).toBe(false);
        if (orchestratorStarted.accepted) {
            throw new Error('Expected orchestrator debug mode to reject models without native tools.');
        }
        expect(orchestratorStarted.code).toBe('runtime_option_invalid');
        expect(orchestratorStarted.action).toEqual({
            code: 'model_tools_required',
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-tools',
            modeKey: 'debug',
        });
    });

    it('rejects explicit non-vision targets when attachments are present', async () => {
        const caller = createCaller();
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-non-vision-key',
        });
        expect(configured.success).toBe(true);

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('openai/gpt-5-no-vision', 'openai', 'GPT 5 No Vision', now, now);
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
                            tool_protocol,
                            input_modalities_json,
                            output_modalities_json,
                            prompt_family,
                            context_length,
                            pricing_json,
                            raw_json,
                            source,
                            updated_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'openai',
                'openai/gpt-5-no-vision',
                'GPT 5 No Vision',
                'openai',
                0,
                1,
                1,
                0,
                0,
                0,
                'openai_responses',
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
            title: 'Explicit non-vision model thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Describe this image',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-vision',
            attachments: [
                {
                    clientId: 'img-no-vision',
                    mimeType: 'image/png',
                    bytesBase64: buildTinyPngBase64(),
                    width: 1,
                    height: 1,
                    sha256: 'no-vision-image',
                },
            ],
        });
        expect(started.accepted).toBe(false);
        if (started.accepted) {
            throw new Error('Expected explicit non-vision model to be rejected.');
        }
        expect(started.code).toBe('runtime_option_invalid');
        expect(started.message).toContain('does not support image input');
        expect(started.action).toEqual({
            code: 'model_vision_required',
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-vision',
        });
    });

    it('skips incompatible omitted-target defaults and selects a compatible vision model for attachments', async () => {
        const caller = createCaller();
        const completionFetchMock = vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content: 'Vision-compatible fallback response',
                        },
                    },
                ],
                usage: {
                    prompt_tokens: 12,
                    completion_tokens: 8,
                    total_tokens: 20,
                },
            }),
        });
        vi.stubGlobal('fetch', completionFetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-vision-fallback-key',
        });
        expect(configured.success).toBe(true);

        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        sqlite
            .prepare(
                `
                    INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('openai/a-text-only-default', 'openai', 'A Text Only Default', now, now);
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
                            tool_protocol,
                            input_modalities_json,
                            output_modalities_json,
                            prompt_family,
                            context_length,
                            pricing_json,
                            raw_json,
                            source,
                            updated_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'openai',
                'openai/a-text-only-default',
                'A Text Only Default',
                'openai',
                0,
                1,
                1,
                0,
                0,
                0,
                'openai_responses',
                JSON.stringify(['text']),
                JSON.stringify(['text']),
                null,
                128000,
                '{}',
                '{}',
                'test',
                now
            );

        const changed = await caller.provider.setDefault({
            profileId,
            providerId: 'openai',
            modelId: 'openai/a-text-only-default',
        });
        expect(changed.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Implicit vision fallback thread',
            kind: 'local',
        });

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Describe this image',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            attachments: [
                {
                    clientId: 'img-implicit-vision',
                    mimeType: 'image/png',
                    bytesBase64: buildTinyPngBase64(),
                    width: 1,
                    height: 1,
                    sha256: 'implicit-vision-image',
                },
            ],
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected compatible vision model to be auto-selected.');
        }

        await waitForRunStatus(caller, profileId, created.session.id, 'completed');
        const runs = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        const selectedModelId = runs.runs[0]?.modelId;
        expect(runs.runs[0]?.providerId).toBe('openai');
        expect(selectedModelId).not.toBe('openai/a-text-only-default');

        const models = await caller.provider.listModels({
            profileId,
            providerId: 'openai',
        });
        const selectedModel = models.models.find((model) => model.id === selectedModelId);
        expect(selectedModel?.supportsVision).toBe(true);
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

    it('persists specialist defaults independently from the shared fallback default', async () => {
        const caller = createCaller();

        const changed = await caller.provider.setSpecialistDefault({
            profileId,
            topLevelTab: 'agent',
            modeKey: 'code',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(changed.success).toBe(true);
        if (!changed.success) {
            throw new Error('Expected specialist default update to succeed.');
        }

        const defaults = await caller.provider.getDefaults({ profileId });
        expect(defaults.specialistDefaults).toContainEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        expect(shellBootstrap.specialistDefaults).toContainEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
    });

    it('normalizes only legacy OpenAI OAuth and Codex state into openai_codex', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO provider_auth_states
                        (
                            profile_id,
                            provider_id,
                            auth_method,
                            auth_state,
                            account_id,
                            organization_id,
                            token_expires_at,
                            last_error_code,
                            last_error_message,
                            updated_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                profileId,
                'openai',
                'oauth_device',
                'authenticated',
                'account_legacy_codex',
                null,
                '2026-03-23T15:00:00.000Z',
                null,
                null,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO provider_auth_flows
                        (
                            id,
                            profile_id,
                            provider_id,
                            flow_type,
                            auth_method,
                            nonce,
                            state,
                            code_verifier,
                            redirect_uri,
                            device_code,
                            user_code,
                            verification_uri,
                            poll_interval_seconds,
                            expires_at,
                            status,
                            last_error_code,
                            last_error_message,
                            created_at,
                            updated_at,
                            consumed_at
                        )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'flow_legacy_openai_oauth',
                profileId,
                'openai',
                'oauth_device',
                'oauth_device',
                null,
                null,
                null,
                null,
                'device_legacy',
                'USER-LEGACY',
                'https://chatgpt.com',
                5,
                '2026-03-23T16:00:00.000Z',
                'pending',
                null,
                null,
                now,
                now,
                null
            );
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO provider_secrets
                        (id, profile_id, provider_id, secret_kind, secret_value, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `
            )
            .run('secret_openai_api_key', profileId, 'openai', 'api_key', 'openai-api-key-keep', now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO provider_secrets
                        (id, profile_id, provider_id, secret_kind, secret_value, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `
            )
            .run('secret_openai_access_token', profileId, 'openai', 'access_token', 'legacy-access-token', now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO provider_secrets
                        (id, profile_id, provider_id, secret_kind, secret_value, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `
            )
            .run('secret_openai_refresh_token', profileId, 'openai', 'refresh_token', 'legacy-refresh-token', now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('setting_default_provider_id', profileId, 'default_provider_id', JSON.stringify('openai'), now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run('setting_default_model_id', profileId, 'default_model_id', JSON.stringify('openai/gpt-5-codex'), now);
        sqlite
            .prepare(
                `
                    INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                `
            )
            .run(
                'setting_specialist_defaults',
                profileId,
                'specialist_defaults',
                JSON.stringify([
                    {
                        topLevelTab: 'agent',
                        modeKey: 'code',
                        providerId: 'openai',
                        modelId: 'openai/gpt-5.1-codex',
                    },
                ]),
                now
            );

        const defaults = await caller.provider.getDefaults({ profileId });
        expect(defaults.defaults.providerId).toBe('openai_codex');
        expect(defaults.defaults.modelId).toBe('openai_codex/gpt-5-codex');
        expect(defaults.specialistDefaults).toContainEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
            providerId: 'openai_codex',
            modelId: 'openai_codex/gpt-5.1-codex',
        });

        const openAIState = await caller.provider.getAuthState({ profileId, providerId: 'openai' });
        expect(openAIState.found).toBe(true);
        expect(openAIState.state.authMethod).toBe('api_key');
        expect(openAIState.state.authState).toBe('configured');

        const codexState = await caller.provider.getAuthState({ profileId, providerId: 'openai_codex' });
        expect(codexState.found).toBe(true);
        expect(codexState.state.authMethod).toBe('oauth_device');
        expect(codexState.state.authState).toBe('authenticated');
        expect(codexState.state.accountId).toBe('account_legacy_codex');

        const snapshot = await caller.runtime.getDiagnosticSnapshot({ profileId });
        expect(
            snapshot.providerSecrets.some(
                (providerSecret) => providerSecret.providerId === 'openai' && providerSecret.secretKind === 'api_key'
            )
        ).toBe(true);
        expect(
            snapshot.providerSecrets.some(
                (providerSecret) =>
                    providerSecret.providerId === 'openai' && providerSecret.secretKind === 'access_token'
            )
        ).toBe(false);
        expect(
            snapshot.providerSecrets.some(
                (providerSecret) =>
                    providerSecret.providerId === 'openai_codex' && providerSecret.secretKind === 'access_token'
            )
        ).toBe(true);
        expect(
            snapshot.providerSecrets.some(
                (providerSecret) =>
                    providerSecret.providerId === 'openai_codex' && providerSecret.secretKind === 'refresh_token'
            )
        ).toBe(true);
        expect(
            snapshot.providerAuthFlows.some(
                (providerAuthFlow) =>
                    providerAuthFlow.providerId === 'openai_codex' &&
                    providerAuthFlow.authMethod === 'oauth_device' &&
                    providerAuthFlow.id === 'flow_legacy_openai_oauth'
            )
        ).toBe(true);
        expect(
            snapshot.providerAuthFlows.some(
                (providerAuthFlow) =>
                    providerAuthFlow.providerId === 'openai' &&
                    providerAuthFlow.authMethod === 'oauth_device' &&
                    providerAuthFlow.id === 'flow_legacy_openai_oauth'
            )
        ).toBe(false);
    });
});
