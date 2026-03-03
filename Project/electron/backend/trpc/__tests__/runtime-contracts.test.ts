import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, getPersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import type { Context } from '@/app/backend/trpc/context';
import { appRouter } from '@/app/backend/trpc/router';

function createCaller() {
    const context: Context = {
        senderId: 1,
        win: null,
    };

    return appRouter.createCaller(context);
}

beforeEach(() => {
    resetPersistenceForTests();
});

describe('runtime contracts', () => {
    const profileId = getDefaultProfileId();

    it('exposes all new runtime domains in root router', async () => {
        const caller = createCaller();

        const snapshot = await caller.runtime.getSnapshot({ profileId });
        const sessions = await caller.session.list();
        const providers = await caller.provider.listProviders({ profileId });
        const pendingPermissions = await caller.permission.listPending();
        const tools = await caller.tool.list();
        const mcpServers = await caller.mcp.listServers();

        expect(snapshot.lastSequence).toBeGreaterThanOrEqual(0);
        expect(sessions.sessions).toEqual([]);
        expect(snapshot.conversations).toEqual([]);
        expect(snapshot.threads).toEqual([]);
        expect(snapshot.tags).toEqual([]);
        expect(snapshot.threadTags).toEqual([]);
        expect(snapshot.diffs).toEqual([]);
        expect(snapshot.modeDefinitions.some((mode) => mode.topLevelTab === 'chat' && mode.modeKey === 'chat')).toBe(
            true
        );
        expect(snapshot.kiloAccountContext.authState).toBe('logged_out');
        expect(snapshot.providerAuthStates.length).toBeGreaterThan(0);
        expect(snapshot.secretReferences).toEqual([]);
        expect(providers.providers.length).toBeGreaterThan(0);
        expect(pendingPermissions.requests).toEqual([]);
        expect(tools.tools.length).toBeGreaterThan(0);
        expect(mcpServers.servers.length).toBeGreaterThan(0);
    });

    it('supports session lifecycle including completion, abort, and revert', async () => {
        const caller = createCaller();

        const created = await caller.session.create({
            scope: 'detached',
            kind: 'local',
        });
        const sessionId = created.session.id;

        const initialStatus = await caller.session.status({ sessionId });
        expect(initialStatus.found).toBe(true);
        if (!initialStatus.found) {
            throw new Error('Expected session to exist.');
        }
        expect(initialStatus.session.runStatus).toBe('idle');

        const firstPrompt = await caller.session.prompt({
            sessionId,
            prompt: 'First prompt',
        });
        expect(firstPrompt.accepted).toBe(true);

        const completedStatus = await caller.session.status({ sessionId });
        expect(completedStatus.found).toBe(true);
        if (!completedStatus.found) {
            throw new Error('Expected session to exist after prompt.');
        }
        expect(completedStatus.session.runStatus).toBe('completed');
        expect(completedStatus.session.turnCount).toBe(1);

        const secondPrompt = await caller.session.prompt({
            sessionId,
            prompt: 'Second prompt',
        });
        expect(secondPrompt.accepted).toBe(true);

        const aborted = await caller.session.abort({ sessionId });
        expect(aborted.aborted).toBe(true);

        const afterAbort = await caller.session.status({ sessionId });
        expect(afterAbort.found).toBe(true);
        if (!afterAbort.found) {
            throw new Error('Expected session to exist after abort.');
        }
        expect(afterAbort.session.runStatus).toBe('aborted');
        expect(afterAbort.session.turnCount).toBe(2);

        const reverted = await caller.session.revert({ sessionId });
        expect(reverted.reverted).toBe(true);
        if (!reverted.reverted) {
            throw new Error('Expected revert to succeed.');
        }
        expect(reverted.session.turnCount).toBe(1);
        expect(reverted.session.runStatus).toBe('completed');
    });

    it('handles permission request, grant, deny, and idempotency', async () => {
        const caller = createCaller();

        const requested = await caller.permission.request({
            policy: 'ask',
            resource: 'tool:run_command',
            rationale: 'Need shell command access',
        });
        const requestId = requested.request.id;

        const pending = await caller.permission.listPending();
        expect(pending.requests.some((item) => item.id === requestId)).toBe(true);

        const granted = await caller.permission.grant({ requestId });
        expect(granted.updated).toBe(true);

        const grantedAgain = await caller.permission.grant({ requestId });
        expect(grantedAgain.updated).toBe(false);
        expect(grantedAgain.reason).toBe('already_granted');

        const deniedAfterGrant = await caller.permission.deny({ requestId });
        expect(deniedAfterGrant.updated).toBe(true);

        const deniedAgain = await caller.permission.deny({ requestId });
        expect(deniedAgain.updated).toBe(false);
        expect(deniedAgain.reason).toBe('already_denied');
    });

    it('persists provider default in memory and lists models', async () => {
        const caller = createCaller();

        const providersBefore = await caller.provider.listProviders({ profileId });
        const models = await caller.provider.listModels({ profileId, providerId: 'openai' });
        expect(models.models.length).toBeGreaterThan(0);

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

    it('supports provider auth control plane and sync failure is explicit for unimplemented adapter paths', async () => {
        const caller = createCaller();

        const before = await caller.provider.getAuthState({ profileId, providerId: 'openai' });
        expect(before.found).toBe(true);
        if (!before.found) {
            throw new Error('Expected auth state lookup to succeed.');
        }
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

        const snapshotAfterSet = await caller.runtime.getSnapshot({ profileId });
        expect(snapshotAfterSet.secretReferences.some((ref) => ref.providerId === 'openai')).toBe(true);

        const syncResult = await caller.provider.syncCatalog({
            profileId,
            providerId: 'openai',
        });
        expect(syncResult.ok).toBe(false);
        expect(syncResult.reason).toBe('not_implemented');

        const cleared = await caller.provider.clearAuth({
            profileId,
            providerId: 'openai',
        });
        expect(cleared.success).toBe(true);
        if (!cleared.success) {
            throw new Error('Expected clearAuth to succeed.');
        }
        expect(cleared.authState.authState).toBe('logged_out');

        const snapshotAfterClear = await caller.runtime.getSnapshot({ profileId });
        expect(snapshotAfterClear.secretReferences.some((ref) => ref.providerId === 'openai')).toBe(false);
    });

    it('rejects unsupported provider ids and allows anthropic models through supported providers', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        const unsupported = await caller.provider.listModels({
            profileId,
            providerId: 'anthropic',
        });
        expect(unsupported.reason).toBe('provider_not_found');

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

    it('fails closed for unimplemented tool and mcp mutations', async () => {
        const caller = createCaller();

        const tools = await caller.tool.list();
        expect(tools.tools.map((item) => item.id)).toContain('read_file');

        const toolInvocation = await caller.tool.invoke({
            toolId: 'read_file',
            args: {
                path: '/tmp/file.txt',
            },
        });
        expect(toolInvocation.ok).toBe(false);
        expect(toolInvocation.error).toBe('not_implemented');

        const mcpServers = await caller.mcp.listServers();
        expect(mcpServers.servers.map((item) => item.id)).toContain('github');

        const connected = await caller.mcp.connect({ serverId: 'github' });
        expect(connected.connected).toBe(false);
        expect(connected.reason).toBe('not_implemented');

        const authStatus = await caller.mcp.authStatus({ serverId: 'github' });
        expect(authStatus.found).toBe(true);
        if (!authStatus.found) {
            throw new Error('Expected MCP auth status result.');
        }
        expect(authStatus.connectionState).toBe('disconnected');

        const disconnected = await caller.mcp.disconnect({ serverId: 'github' });
        expect(disconnected.disconnected).toBe(false);
        expect(disconnected.reason).toBe('not_implemented');
    });

    it('supports workspace-scoped runtime reset dry-run and apply', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        const created = await caller.session.create({
            scope: 'workspace',
            kind: 'local',
            workspaceFingerprint: 'wsf_runtime_contracts',
        });
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_workspace_target',
                profileId,
                'wsf_runtime_contracts',
                'Workspace Rules',
                '# Rules',
                'user',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO skillfiles (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'skill_workspace_target',
                profileId,
                'wsf_runtime_contracts',
                'Workspace Skillfile',
                '# Skill',
                'user',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_workspace_other',
                profileId,
                'wsf_other_workspace',
                'Other Rules',
                '# Rules',
                'user',
                1,
                100,
                now,
                now
            );

        const dryRun = await caller.runtime.reset({
            target: 'workspace',
            workspaceFingerprint: 'wsf_runtime_contracts',
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.sessions).toBe(1);
        expect(dryRun.counts.rulesets).toBe(1);
        expect(dryRun.counts.skillfiles).toBe(1);

        const applied = await caller.runtime.reset({
            target: 'workspace',
            workspaceFingerprint: 'wsf_runtime_contracts',
            confirm: true,
        });
        expect(applied.applied).toBe(true);
        expect(applied.counts.sessions).toBe(1);

        const sessions = await caller.session.list();
        expect(sessions.sessions.some((item) => item.id === created.session.id)).toBe(false);

        const snapshot = await caller.runtime.getSnapshot({ profileId });
        expect(snapshot.lastSequence).toBeGreaterThan(0);

        const remainingRulesetCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM rulesets WHERE workspace_fingerprint = ?')
            .get('wsf_other_workspace') as { count: number };
        expect(remainingRulesetCount.count).toBe(1);
    });

    it('resets only targeted profile-scoped parity rows for profile_settings', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();
        const otherProfileId = 'profile_other';

        sqlite
            .prepare('INSERT INTO profiles (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
            .run(otherProfileId, 'Other Profile', now, now);

        sqlite
            .prepare(
                `
                    INSERT INTO mode_definitions (id, profile_id, top_level_tab, mode_key, label, prompt_json, execution_policy_json, source, enabled, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'mode_profile_other_agent_code',
                otherProfileId,
                'agent',
                'code',
                'Other Agent Code',
                '{}',
                '{}',
                'user',
                1,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (id, profile_id, workspace_fingerprint, name, body_markdown, source, enabled, precedence, created_at, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_profile_other',
                otherProfileId,
                null,
                'Other Profile Rules',
                '# Rules',
                'user',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO secret_references (id, profile_id, provider_id, secret_key_ref, secret_kind, status, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'secret_ref_profile_other',
                otherProfileId,
                'openai',
                'provider/openai/other',
                'api_key',
                'active',
                now
            );

        const dryRun = await caller.runtime.reset({
            target: 'profile_settings',
            profileId,
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.modeDefinitions).toBeGreaterThan(0);
        expect(dryRun.counts.kiloAccountSnapshots).toBeGreaterThan(0);

        const applied = await caller.runtime.reset({
            target: 'profile_settings',
            profileId,
            confirm: true,
        });
        expect(applied.applied).toBe(true);

        const defaultProfileModeCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM mode_definitions WHERE profile_id = ?')
            .get(profileId) as { count: number };
        expect(defaultProfileModeCount.count).toBe(0);

        const otherProfileModeCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM mode_definitions WHERE profile_id = ?')
            .get(otherProfileId) as { count: number };
        expect(otherProfileModeCount.count).toBe(1);

        const otherProfileSecretRefCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM secret_references WHERE profile_id = ?')
            .get(otherProfileId) as { count: number };
        expect(otherProfileSecretRefCount.count).toBe(1);
    });

    it('full reset clears parity rows and reseeds baseline modes', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        sqlite
            .prepare(
                `
                    INSERT INTO secret_references (id, profile_id, provider_id, secret_key_ref, secret_kind, status, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run('secret_ref_profile_default', profileId, 'kilo', 'provider/kilo/default', 'api_key', 'active', now);

        const dryRun = await caller.runtime.reset({
            target: 'full',
            profileId,
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.modeDefinitions).toBeGreaterThan(0);
        expect(dryRun.counts.secretReferences).toBe(1);

        const applied = await caller.runtime.reset({
            target: 'full',
            profileId,
            confirm: true,
        });
        expect(applied.applied).toBe(true);

        const snapshot = await caller.runtime.getSnapshot({ profileId });
        expect(snapshot.modeDefinitions.length).toBe(8);
        expect(snapshot.kiloAccountContext.authState).toBe('logged_out');
        expect(snapshot.secretReferences).toEqual([]);
    });
});
