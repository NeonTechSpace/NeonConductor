import { describe, expect, it, vi } from 'vitest';

import { buildTinyPngBase64 } from '@/app/backend/trpc/__tests__/runtime-contracts.provider-selection.shared';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    getPersistence,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
    waitForRunStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';


registerRuntimeContractHooks();

describe('runtime contracts: provider selection tool and vision requirements', () => {
    const profileId = runtimeContractProfileId;

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
                `INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
            )
            .run('openai/gpt-5-no-tools', 'openai', 'GPT 5 No Tools', now, now);
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO provider_model_catalog (profile_id, provider_id, model_id, label, upstream_provider, is_free, supports_tools, supports_reasoning, supports_vision, supports_audio_input, supports_audio_output, tool_protocol, api_family, input_modalities_json, output_modalities_json, prompt_family, context_length, pricing_json, raw_json, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                `INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
            )
            .run('openai/gpt-5-no-tools', 'openai', 'GPT 5 No Tools', now, now);
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO provider_model_catalog (profile_id, provider_id, model_id, label, upstream_provider, is_free, supports_tools, supports_reasoning, supports_vision, supports_audio_input, supports_audio_output, tool_protocol, api_family, input_modalities_json, output_modalities_json, prompt_family, context_length, pricing_json, raw_json, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                `INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
            )
            .run('openai/gpt-5-no-vision', 'openai', 'GPT 5 No Vision', now, now);
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO provider_model_catalog (profile_id, provider_id, model_id, label, upstream_provider, is_free, supports_tools, supports_reasoning, supports_vision, supports_audio_input, supports_audio_output, tool_protocol, api_family, input_modalities_json, output_modalities_json, prompt_family, context_length, pricing_json, raw_json, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                choices: [{ message: { content: 'Vision-compatible fallback response' } }],
                usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
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
                `INSERT OR IGNORE INTO provider_models (id, provider_id, label, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`
            )
            .run('openai/a-text-only-default', 'openai', 'A Text Only Default', now, now);
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO provider_model_catalog (profile_id, provider_id, model_id, label, upstream_provider, is_free, supports_tools, supports_reasoning, supports_vision, supports_audio_input, supports_audio_output, tool_protocol, api_family, input_modalities_json, output_modalities_json, prompt_family, context_length, pricing_json, raw_json, source, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
        const runs = await caller.session.listRuns({ profileId, sessionId: created.session.id });
        const selectedModelId = runs.runs[0]?.modelId;
        expect(runs.runs[0]?.providerId).toBe('openai');
        expect(selectedModelId).not.toBe('openai/a-text-only-default');

        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        const selectedModel = models.models.find((model) => model.id === selectedModelId);
        expect(selectedModel?.features.supportsVision).toBe(true);
    });
});

