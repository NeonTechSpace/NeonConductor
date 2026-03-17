import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';

import { normalizeCatalogMetadata, toProviderCatalogUpsert } from '@/app/backend/providers/metadata/normalize';
import { providerMetadataOrchestrator } from '@/app/backend/providers/metadata/orchestrator';
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
import { kiloBalancedModelId, kiloFrontierModelId } from '@/shared/kiloModels';

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
        expect(models.models.some((model) => model.id === 'openai/gpt-5.4')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-nano')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-5-codex')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo-0125')).toBe(false);
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
        expect(models.models.some((model) => model.id === 'openai/gpt-5.4')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo')).toBe(true);
        expect(models.models.some((model) => model.id === 'openai/gpt-3.5-turbo-1106')).toBe(false);
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

    it('round-trips provider metadata fields through provider.listModels and runtime.getShellBootstrap', async () => {
        const caller = createCaller();

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        const gpt54 = models.models.find((model) => model.id === 'openai/gpt-5.4');
        expect(gpt54).toBeDefined();
        if (!gpt54) {
            throw new Error('Expected openai/gpt-5.4 in the OpenAI catalog.');
        }

        expect(gpt54.supportsPromptCache).toBe(true);
        expect(gpt54.supportsRealtimeWebSocket).toBe(true);
        expect(gpt54.apiFamily).toBe('openai_compatible');
        expect(gpt54.toolProtocol).toBe('openai_responses');

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        const shellGpt54 = shellBootstrap.providerModels.find((model) => model.id === 'openai/gpt-5.4');
        expect(shellGpt54).toBeDefined();
        if (!shellGpt54) {
            throw new Error('Expected openai/gpt-5.4 in runtime shell bootstrap.');
        }

        expect(shellGpt54.supportsPromptCache).toBe(true);
        expect(shellGpt54.supportsRealtimeWebSocket).toBe(true);
        expect(shellGpt54.apiFamily).toBe('openai_compatible');
        expect(shellGpt54.toolProtocol).toBe('openai_responses');
    });

    it('round-trips Kilo routed upstream family metadata through provider.listModels and runtime.getShellBootstrap', async () => {
        const caller = createCaller();

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'anthropic/claude-sonnet-4.5',
                label: 'Claude Sonnet 4.5',
                upstreamProvider: 'anthropic',
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: 'anthropic_messages',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
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

        expect(claude.apiFamily).toBe('kilo_gateway');
        expect(claude.routedApiFamily).toBe('anthropic_messages');
        expect(claude.toolProtocol).toBe('kilo_gateway');

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        const shellClaude = shellBootstrap.providerModels.find((model) => model.id === 'anthropic/claude-sonnet-4.5');
        expect(shellClaude).toBeDefined();
        if (!shellClaude) {
            throw new Error('Expected anthropic/claude-sonnet-4.5 in runtime shell bootstrap.');
        }

        expect(shellClaude.apiFamily).toBe('kilo_gateway');
        expect(shellClaude.routedApiFamily).toBe('anthropic_messages');
        expect(shellClaude.toolProtocol).toBe('kilo_gateway');
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
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: 'google_generativeai',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
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

    it('refreshes the Kilo catalog during shell bootstrap after app startup', async () => {
        const caller = createCaller();

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'kilo',
            apiKey: 'kilo-startup-refresh-key',
        });
        expect(configured.success).toBe(true);

        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'stale/startup-model',
                label: 'Stale Startup Model',
                upstreamProvider: 'openai',
                isFree: false,
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: 'openai_compatible',
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

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        expect(shellBootstrap.providerModels.some((model) => model.id === 'minimax/minimax-m2.1:free')).toBe(true);
        expect(shellBootstrap.providerModels.some((model) => model.id === 'stale/startup-model')).toBe(false);
    });

    it('persists the resolved native transport selected from model protocol metadata', async () => {
        const caller = createCaller();
        const fetchMock = vi.fn((url: string) => {
            if (url.includes('/responses')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        output: [
                            {
                                type: 'message',
                                content: [
                                    {
                                        type: 'output_text',
                                        text: 'Responses protocol path',
                                    },
                                ],
                            },
                        ],
                        usage: {
                            input_tokens: 10,
                            output_tokens: 12,
                            total_tokens: 22,
                        },
                    }),
                });
            }

            if (url.includes('/chat/completions')) {
                return Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'Chat completions protocol path',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 10,
                            completion_tokens: 12,
                            total_tokens: 22,
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
        });
        vi.stubGlobal('fetch', fetchMock);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-protocol-key',
        });
        expect(configured.success).toBe(true);

        const openAiSession = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Responses protocol thread',
            kind: 'local',
        });
        const openAiStart = await caller.session.startRun({
            profileId,
            sessionId: openAiSession.session.id,
            prompt: 'Use responses protocol',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(openAiStart.accepted).toBe(true);
        if (!openAiStart.accepted) {
            throw new Error('Expected OpenAI run to start.');
        }
        await waitForRunStatus(caller, profileId, openAiSession.session.id, 'completed');
        const openAiRuns = await caller.session.listRuns({
            profileId,
            sessionId: openAiSession.session.id,
        });
        expect(openAiRuns.runs[0]?.transport?.selected).toBe('openai_responses');

        const moonshotConfigured = await caller.provider.setApiKey({
            profileId,
            providerId: 'moonshot',
            apiKey: 'moonshot-protocol-key',
        });
        expect(moonshotConfigured.success).toBe(true);

        const moonshotSession = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Chat completions protocol thread',
            kind: 'local',
        });
        const moonshotStart = await caller.session.startRun({
            profileId,
            sessionId: moonshotSession.session.id,
            prompt: 'Use chat completions protocol',
            topLevelTab: 'chat',
            modeKey: 'chat',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'moonshot',
            modelId: 'moonshot/kimi-latest',
        });
        expect(moonshotStart.accepted).toBe(true);
        if (!moonshotStart.accepted) {
            throw new Error('Expected Moonshot run to start.');
        }
        await waitForRunStatus(caller, profileId, moonshotSession.session.id, 'completed');
        const moonshotRuns = await caller.session.listRuns({
            profileId,
            sessionId: moonshotSession.session.id,
        });
        expect(moonshotRuns.runs[0]?.transport?.selected).toBe('openai_chat_completions');
    });

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
