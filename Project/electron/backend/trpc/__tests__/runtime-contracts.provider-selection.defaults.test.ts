import { describe, expect, it } from 'vitest';

import { encryptSecretPayload } from '@/app/backend/secrets/secretPayloadCodec';
import {
    createCaller,
    getPersistence,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: provider selection defaults', () => {
    const profileId = runtimeContractProfileId;

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
        expect(firstModel.features.supportsTools).toBeTypeOf('boolean');
        expect(firstModel.features.supportsReasoning).toBeTypeOf('boolean');
        expect(firstModel.features.inputModalities.includes('text')).toBe(true);
        expect(firstModel.features.outputModalities.includes('text')).toBe(true);

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
        expect(shellBootstrap.providerControl.specialistDefaults).toContainEqual({
            topLevelTab: 'agent',
            modeKey: 'code',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
    });

    it('persists planning-first workflow routing preferences independently from specialist defaults', async () => {
        const caller = createCaller();

        const changed = await caller.provider.setWorkflowRoutingPreference({
            profileId,
            targetKey: 'planning',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(changed.success).toBe(true);
        if (!changed.success) {
            throw new Error('Expected workflow routing preference update to succeed.');
        }

        const defaults = await caller.provider.getDefaults({ profileId });
        expect(defaults.workflowRoutingPreferences).toContainEqual({
            targetKey: 'planning',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        expect(shellBootstrap.providerControl.workflowRoutingPreferences).toContainEqual({
            targetKey: 'planning',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        const cleared = await caller.provider.clearWorkflowRoutingPreference({
            profileId,
            targetKey: 'planning',
        });
        expect(cleared.success).toBe(true);
        expect(cleared.workflowRoutingPreferences).toEqual([]);
    });

    it('normalizes only legacy OpenAI OAuth and Codex state into openai_codex', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        sqlite
            .prepare(
                `INSERT OR REPLACE INTO provider_auth_states (profile_id, provider_id, auth_method, auth_state, account_id, organization_id, token_expires_at, last_error_code, last_error_message, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                `INSERT OR REPLACE INTO provider_auth_flows (id, profile_id, provider_id, flow_type, auth_method, nonce, state, code_verifier, redirect_uri, device_code, user_code, verification_uri, poll_interval_seconds, expires_at, status, last_error_code, last_error_message, created_at, updated_at, consumed_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
                `INSERT OR REPLACE INTO provider_secrets (id, profile_id, provider_id, secret_kind, secret_payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(
                'secret_openai_api_key',
                profileId,
                'openai',
                'api_key',
                await encryptSecretPayload('openai-api-key-keep'),
                now
            );
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO provider_secrets (id, profile_id, provider_id, secret_kind, secret_payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(
                'secret_openai_access_token',
                profileId,
                'openai',
                'access_token',
                await encryptSecretPayload('legacy-access-token'),
                now
            );
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO provider_secrets (id, profile_id, provider_id, secret_kind, secret_payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)`
            )
            .run(
                'secret_openai_refresh_token',
                profileId,
                'openai',
                'refresh_token',
                await encryptSecretPayload('legacy-refresh-token'),
                now
            );
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)`
            )
            .run('setting_default_provider_id', profileId, 'default_provider_id', JSON.stringify('openai'), now);
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)`
            )
            .run('setting_default_model_id', profileId, 'default_model_id', JSON.stringify('openai/gpt-5-codex'), now);
        sqlite
            .prepare(
                `INSERT OR REPLACE INTO settings (id, profile_id, key, value_json, updated_at) VALUES (?, ?, ?, ?, ?)`
            )
            .run(
                'setting_specialist_defaults',
                profileId,
                'specialist_defaults',
                JSON.stringify([
                    { topLevelTab: 'agent', modeKey: 'code', providerId: 'openai', modelId: 'openai/gpt-5.1-codex' },
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
