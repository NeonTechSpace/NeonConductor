import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { getPersistenceStoragePaths } from '@/app/backend/persistence/db';
import {
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    getPersistence,
    mkdirSync,
    mkdtempSync,
    os,
    path,
    readFileSync,
    registerRuntimeContractHooks,
    requireEntityId,
    resetPersistenceForTests,
    runtimeContractProfileId,
    writeFileSync,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: core flows', () => {
    const profileId = runtimeContractProfileId;

    it('exposes all new runtime domains in root router', async () => {
        const caller = createCaller();

        const snapshot = await caller.runtime.getDiagnosticSnapshot({ profileId });
        const shellBootstrap = await caller.runtime.getShellBootstrap({ profileId });
        const sessions = await caller.session.list({ profileId });
        const providers = await caller.provider.listProviders({ profileId });
        const defaults = await caller.provider.getDefaults({ profileId });
        const modes = await caller.mode.list({ profileId, topLevelTab: 'agent' });
        const activeMode = await caller.mode.getActive({ profileId, topLevelTab: 'agent' });
        const promptLayers = await caller.prompt.getSettings({ profileId });
        const pendingPermissions = await caller.permission.listPending();
        const tools = await caller.tool.list();
        const mcpServers = await caller.mcp.listServers();

        expect(snapshot.lastSequence).toBeGreaterThanOrEqual(0);
        expect(snapshot.activeProfileId).toBe(profileId);
        expect(snapshot.profiles.some((profile) => profile.id === profileId && profile.isActive)).toBe(true);
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
        expect(snapshot.providerSecrets).toEqual([]);
        expect(shellBootstrap.lastSequence).toBeGreaterThanOrEqual(0);
        expect(shellBootstrap.threadTags).toEqual([]);
        expect(shellBootstrap.providerControl.entries.length).toBeGreaterThan(0);
        expect(shellBootstrap.providerControl.entries.flatMap((entry) => entry.models).length).toBeGreaterThan(0);
        expect(shellBootstrap.providerControl.specialistDefaults).toEqual([]);
        expect(defaults.defaults.providerId).toBe('kilo');
        expect(promptLayers.settings.topLevelInstructions.chat).toBe('');
        expect(promptLayers.settings.builtInModes.chat[0]?.modeKey).toBe('chat');
        expect(providers.providers.length).toBeGreaterThan(0);
        expect(modes.modes.some((mode) => mode.modeKey === 'code')).toBe(true);
        expect(activeMode.activeMode.modeKey).toBe('code');
        expect(pendingPermissions.requests).toEqual([]);
        expect(tools.tools.length).toBeGreaterThan(0);
        expect(mcpServers.servers).toEqual([]);
    });

    it('returns a typed not-found error when no enabled modes exist for a tab', async () => {
        const caller = createCaller();
        const { db } = getPersistence();

        await db
            .updateTable('mode_definitions')
            .set({ enabled: 0 })
            .where('profile_id', '=', profileId)
            .where('top_level_tab', '=', 'agent')
            .execute();

        await expect(caller.mode.getActive({ profileId, topLevelTab: 'agent' })).rejects.toMatchObject({
            message: `No enabled modes found for tab "agent" on profile "${profileId}".`,
        });
    });

    it('supports profile lifecycle with active switching, secure duplication, and last-profile guard', async () => {
        const caller = createCaller();

        const initialActive = await caller.profile.getActive();
        expect(initialActive.activeProfileId).toBe(profileId);

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-profile-source-key',
        });
        expect(configured.success).toBe(true);

        const created = await caller.profile.create({
            name: 'Workspace Profile',
        });

        const renamed = await caller.profile.rename({
            profileId: created.profile.id,
            name: 'Workspace Profile Renamed',
        });
        expect(renamed.updated).toBe(true);
        if (!renamed.updated) {
            throw new Error('Expected profile rename to succeed.');
        }
        expect(renamed.profile.name).toBe('Workspace Profile Renamed');

        const duplicated = await caller.profile.duplicate({
            profileId,
            name: 'Source Duplicate',
        });
        expect(duplicated.duplicated).toBe(true);
        if (!duplicated.duplicated) {
            throw new Error('Expected profile duplication to succeed.');
        }

        const duplicatedSnapshot = await caller.runtime.getDiagnosticSnapshot({
            profileId: duplicated.profile.id,
        });
        expect(duplicatedSnapshot.providerSecrets).toEqual([]);
        const duplicatedOpenAiAuth = duplicatedSnapshot.providerAuthStates.find(
            (state) => state.providerId === 'openai'
        );
        expect(duplicatedOpenAiAuth?.authState).toBe('logged_out');
        expect(duplicatedOpenAiAuth?.authMethod).toBe('none');

        const activated = await caller.profile.setActive({
            profileId: duplicated.profile.id,
        });
        expect(activated.updated).toBe(true);
        if (!activated.updated) {
            throw new Error('Expected profile activation to succeed.');
        }
        expect(activated.profile.id).toBe(duplicated.profile.id);

        const activeAfterSwitch = await caller.profile.getActive();
        expect(activeAfterSwitch.activeProfileId).toBe(duplicated.profile.id);

        const deleteDuplicate = await caller.profile.delete({
            profileId: duplicated.profile.id,
        });
        expect(deleteDuplicate.deleted).toBe(true);
        if (!deleteDuplicate.deleted) {
            throw new Error('Expected duplicated profile delete to succeed.');
        }
        expect(deleteDuplicate.activeProfileId).toBeDefined();

        const deleteCreated = await caller.profile.delete({
            profileId: created.profile.id,
        });
        expect(deleteCreated.deleted).toBe(true);

        const deleteLast = await caller.profile.delete({
            profileId,
        });
        expect(deleteLast.deleted).toBe(false);
        if (deleteLast.deleted) {
            throw new Error('Expected last profile deletion to fail.');
        }
        expect(deleteLast.reason).toBe('last_profile');
    });

    it('rejects invalid mode/tab combinations and missing execution context', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'detached',
            title: 'Invalid mode context thread',
            kind: 'local',
        });

        const invalidModeForTab = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Should fail due to tab/mode mismatch',
            topLevelTab: 'chat',
            modeKey: 'code',
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(invalidModeForTab.accepted).toBe(false);
        if (invalidModeForTab.accepted) {
            throw new Error('Expected invalid mode/tab run start to be rejected.');
        }
        expect(invalidModeForTab.code).toBe('invalid_mode');
        expect(invalidModeForTab.message).toContain('invalid for tab');
        expect(invalidModeForTab.action).toEqual({
            code: 'mode_invalid',
            modeKey: 'code',
            topLevelTab: 'chat',
        });

        await expect(
            caller.session.startRun({
                profileId,
                sessionId: created.session.id,
                prompt: 'Should fail due to missing mode key',
                topLevelTab: 'chat',
                runtimeOptions: defaultRuntimeOptions,
            } as unknown as Parameters<typeof caller.session.startRun>[0])
        ).rejects.toThrow('modeKey');
    });

    it('supports workspace-scoped runtime reset dry-run and apply', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            title: 'Workspace Reset Thread',
            kind: 'local',
            workspaceFingerprint: 'wsf_runtime_contracts',
        });
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (
                        id, profile_id, asset_key, scope, workspace_fingerprint, name, body_markdown, source,
                        source_kind, activation_mode, enabled, precedence, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_workspace_target',
                profileId,
                'ruleset.workspace.target',
                'workspace',
                'wsf_runtime_contracts',
                'Workspace Rules',
                '# Rules',
                'user',
                'workspace_file',
                'manual',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO skillfiles (
                        id, profile_id, asset_key, scope, workspace_fingerprint, name, body_markdown, source,
                        source_kind, enabled, precedence, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'skill_workspace_target',
                profileId,
                'skill.workspace.target',
                'workspace',
                'wsf_runtime_contracts',
                'Workspace Skillfile',
                '# Skill',
                'user',
                'workspace_file',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO rulesets (
                        id, profile_id, asset_key, scope, workspace_fingerprint, name, body_markdown, source,
                        source_kind, activation_mode, enabled, precedence, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_workspace_other',
                profileId,
                'ruleset.workspace.other',
                'workspace',
                'wsf_other_workspace',
                'Other Rules',
                '# Rules',
                'user',
                'workspace_file',
                'manual',
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

        const sessions = await caller.session.list({ profileId });
        expect(sessions.sessions.some((item) => item.id === created.session.id)).toBe(false);

        const snapshot = await caller.runtime.getDiagnosticSnapshot({ profileId });
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
                    INSERT INTO rulesets (
                        id, profile_id, asset_key, scope, workspace_fingerprint, name, body_markdown, source,
                        source_kind, activation_mode, enabled, precedence, created_at, updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `
            )
            .run(
                'ruleset_profile_other',
                otherProfileId,
                'ruleset.profile.other',
                'global',
                null,
                'Other Profile Rules',
                '# Rules',
                'user',
                'global_file',
                'manual',
                1,
                100,
                now,
                now
            );
        sqlite
            .prepare(
                `
                    INSERT INTO provider_secrets (id, profile_id, provider_id, secret_kind, secret_value, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `
            )
            .run('provider_secret_profile_other', otherProfileId, 'openai', 'api_key', 'openai-other-key', now);

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

        const otherProfileProviderSecretCount = sqlite
            .prepare('SELECT COUNT(*) AS count FROM provider_secrets WHERE profile_id = ?')
            .get(otherProfileId) as { count: number };
        expect(otherProfileProviderSecretCount.count).toBe(1);
    });

    it('full reset clears parity rows and reseeds baseline modes', async () => {
        const caller = createCaller();
        const { sqlite } = getPersistence();
        const now = new Date().toISOString();

        sqlite
            .prepare(
                `
                    INSERT INTO provider_secrets (id, profile_id, provider_id, secret_kind, secret_value, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                `
            )
            .run('provider_secret_profile_default', profileId, 'kilo', 'api_key', 'kilo-default-key', now);

        const dryRun = await caller.runtime.reset({
            target: 'full',
            profileId,
            dryRun: true,
        });
        expect(dryRun.applied).toBe(false);
        expect(dryRun.counts.modeDefinitions).toBeGreaterThan(0);
        expect(dryRun.counts.providerSecrets).toBe(1);

        const applied = await caller.runtime.reset({
            target: 'full',
            profileId,
            confirm: true,
        });
        expect(applied.applied).toBe(true);

        const snapshot = await caller.runtime.getDiagnosticSnapshot({ profileId });
        expect(snapshot.modeDefinitions.length).toBe(8);
        expect(snapshot.kiloAccountContext.authState).toBe('logged_out');
        expect(snapshot.providerSecrets).toEqual([]);
    });

    it('factory reset removes app-owned data and keeps workspace-local files', async () => {
        const previousUserDataPath = process.env['NEONCONDUCTOR_USER_DATA_PATH'];
        const tempRoot = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-factory-reset-'));
        const userDataPath = path.join(tempRoot, 'userData');
        process.env['NEONCONDUCTOR_USER_DATA_PATH'] = userDataPath;
        resetPersistenceForTests(path.join(userDataPath, 'runtime', 'alpha', 'neonconductor.db'));

        try {
            const caller = createCaller();
            const { sqlite } = getPersistence();
            await caller.profile.create({ name: 'Factory Reset Profile' });
            const workspacePath = mkdtempSync(path.join(os.tmpdir(), 'neonconductor-factory-reset-workspace-'));
            const workspaceLocalRuntimePath = path.join(workspacePath, '.neonconductor');
            mkdirSync(workspaceLocalRuntimePath, { recursive: true });
            const workspaceLocalRuntimeFile = path.join(workspaceLocalRuntimePath, 'keep.md');
            writeFileSync(workspaceLocalRuntimeFile, 'keep me');

            const threadResult = await caller.conversation.createThread({
                profileId,
                topLevelTab: 'agent',
                scope: 'workspace',
                workspacePath,
                title: 'Factory Reset Workspace Thread',
            });
            const threadId = requireEntityId(
                threadResult.thread.id,
                'thr',
                'Expected factory reset thread id with "thr_" prefix.'
            );
            await caller.session.create({
                profileId,
                threadId,
                kind: 'local',
            });

            const storagePaths = getPersistenceStoragePaths();
            mkdirSync(path.join(storagePaths.globalAssetsRoot, 'skills'), { recursive: true });
            writeFileSync(path.join(storagePaths.globalAssetsRoot, 'skills', 'sample.md'), '# skill');
            mkdirSync(storagePaths.logsRoot, { recursive: true });
            writeFileSync(path.join(storagePaths.logsRoot, '2026-03-08.ndjson'), '{"event":"log"}\n');
            const managedSandboxPath = path.join(storagePaths.managedSandboxesRoot, 'workspace', 'feature-reset');
            mkdirSync(managedSandboxPath, { recursive: true });
            writeFileSync(path.join(managedSandboxPath, 'README.md'), 'managed sandbox');

            const now = new Date().toISOString();
            const threadWorkspaceFingerprint = sqlite
                .prepare(
                    `
                        SELECT conversation.workspace_fingerprint AS workspaceFingerprint
                        FROM threads AS thread
                        INNER JOIN conversations AS conversation
                            ON conversation.id = thread.conversation_id
                        WHERE thread.id = ?
                    `
                )
                .get(threadId) as { workspaceFingerprint: string | null };
            if (!threadWorkspaceFingerprint.workspaceFingerprint) {
                throw new Error('Expected factory reset thread to be workspace-bound.');
            }
            sqlite
                .prepare(
                    `
                        INSERT INTO provider_secrets (id, profile_id, provider_id, secret_kind, secret_value, updated_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                    `
                )
                .run('provider_secret_factory_reset', profileId, 'kilo', 'api_key', 'kilo-default-key', now);
            sqlite
                .prepare(
                    `
                        INSERT INTO sandboxes
                            (
                                id,
                                profile_id,
                                workspace_fingerprint,
                                absolute_path,
                                path_key,
                                label,
                                status,
                                creation_strategy,
                                created_at,
                                updated_at,
                                last_used_at
                            )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `
                )
                .run(
                    'sb_factory_reset',
                    profileId,
                    threadWorkspaceFingerprint.workspaceFingerprint,
                    managedSandboxPath,
                    process.platform === 'win32' ? managedSandboxPath.toLowerCase() : managedSandboxPath,
                    'Factory Reset Sandbox',
                    'ready',
                    'copy',
                    now,
                    now,
                    now
                );

            const result = await caller.runtime.factoryReset({
                confirm: true,
                confirmationText: 'RESET APP DATA',
            });
            expect(result.applied).toBe(true);
            expect(result.resetProfileId).toBe(profileId);
            expect(result.counts.profiles).toBe(2);
            expect(result.counts.workspaceRoots).toBe(1);
            expect(result.counts.sandboxes).toBe(1);
            expect(result.cleanupCounts.providerSecrets).toBe(1);
            expect(result.cleanupCounts.globalAssetEntries).toBeGreaterThan(0);
            expect(result.cleanupCounts.logEntries).toBeGreaterThan(0);
            expect(result.cleanupCounts.managedSandboxEntries).toBeGreaterThan(0);

            const snapshot = await caller.runtime.getDiagnosticSnapshot({ profileId: result.resetProfileId });
            expect(snapshot.profiles).toHaveLength(1);
            expect(snapshot.profiles[0]?.id).toBe(profileId);
            expect(snapshot.profiles[0]?.isActive).toBe(true);
            expect(snapshot.conversations).toEqual([]);
            expect(snapshot.providerSecrets).toEqual([]);

            const remainingWorkspaceRoots = sqlite.prepare('SELECT COUNT(*) AS count FROM workspace_roots').get() as {
                count: number;
            };
            const remainingSandboxes = sqlite.prepare('SELECT COUNT(*) AS count FROM sandboxes').get() as {
                count: number;
            };
            const remainingProfiles = sqlite.prepare('SELECT COUNT(*) AS count FROM profiles').get() as {
                count: number;
            };
            expect(remainingWorkspaceRoots.count).toBe(0);
            expect(remainingSandboxes.count).toBe(0);
            expect(remainingProfiles.count).toBe(1);

            expect(existsSync(storagePaths.globalAssetsRoot)).toBe(false);
            expect(existsSync(storagePaths.logsRoot)).toBe(false);
            expect(existsSync(storagePaths.managedSandboxesRoot)).toBe(false);
            expect(readFileSync(workspaceLocalRuntimeFile, 'utf8')).toBe('keep me');
            expect(() => sqlite.prepare('SELECT 1').get()).not.toThrow();
        } finally {
            if (previousUserDataPath === undefined) {
                delete process.env['NEONCONDUCTOR_USER_DATA_PATH'];
            } else {
                process.env['NEONCONDUCTOR_USER_DATA_PATH'] = previousUserDataPath;
            }
        }
    }, 15000);
});
