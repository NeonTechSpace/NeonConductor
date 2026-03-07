import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, getPersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    accountSnapshotStore,
    checkpointStore,
    conversationStore,
    diffStore,
    marketplaceStore,
    mcpStore,
    modeStore,
    permissionStore,
    profileStore,
    providerCatalogStore,
    providerStore,
    runStore,
    runUsageStore,
    secretReferenceStore,
    sessionStore,
    skillfileStore,
    tagStore,
    threadStore,
    toolStore,
} from '@/app/backend/persistence/stores';
import { sessionHistoryService } from '@/app/backend/runtime/services/sessionHistory/service';

describe('persistence stores', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('supports session store lifecycle CRUD-style flows', async () => {
        const profileId = getDefaultProfileId();
        const bucket = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'detached',
            title: 'Detached',
        });
        if (bucket.isErr()) {
            throw new Error(bucket.error.message);
        }
        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.value.id,
            title: 'Main',
            topLevelTab: 'chat',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }
        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }
        expect(session.session.turnCount).toBe(0);

        const run = await runStore.create({
            profileId,
            sessionId: session.session.id,
            prompt: 'hello',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    openai: 'auto',
                },
            },
            cache: {
                applied: false,
                key: 'store-test',
                reason: 'unsupported_transport',
            },
            transport: {
                selected: 'responses',
            },
        });
        await sessionStore.markRunPending(profileId, session.session.id, run.id);
        await runStore.finalize(run.id, { status: 'completed' });
        await sessionStore.markRunTerminal(profileId, session.session.id, 'completed');

        const status = await sessionStore.status(profileId, session.session.id);
        expect(status.found).toBe(true);
        if (!status.found) {
            throw new Error('Expected session to exist.');
        }
        expect(status.session.runStatus).toBe('completed');

        const reverted = await sessionHistoryService.revert(profileId, session.session.id);
        expect(reverted.reverted).toBe(true);
    });

    it('supports permission store decision transitions', async () => {
        const profileId = getDefaultProfileId();
        const created = await permissionStore.create({
            profileId,
            policy: 'ask',
            resource: 'tool:run_command',
            toolId: 'run_command',
            scopeKind: 'tool',
            summary: {
                title: 'Run Command Request',
                detail: 'Need shell command access.',
            },
            commandText: 'node --version',
            approvalCandidates: [
                {
                    label: 'node --version',
                    resource: 'tool:run_command:prefix:node --version',
                },
                {
                    label: 'node',
                    resource: 'tool:run_command:prefix:node',
                },
            ],
        });
        expect(created.decision).toBe('pending');
        expect(created.commandText).toBe('node --version');
        expect(created.approvalCandidates?.map((candidate) => candidate.label)).toEqual(['node --version', 'node']);

        const granted = await permissionStore.resolve(created.id, 'allow_once');
        expect(granted?.decision).toBe('granted');
        expect(granted?.resolvedScope).toBe('once');

        const denied = await permissionStore.resolve(created.id, 'deny');
        expect(denied?.decision).toBe('denied');
    });

    it('supports provider defaults and seeded catalogs', async () => {
        const profileId = getDefaultProfileId();
        const providers = await providerStore.listProviders();
        const models = await providerStore.listModels(profileId, 'openai');
        expect(providers.length).toBeGreaterThan(0);
        expect(models.length).toBeGreaterThan(0);
        const firstModel = models.at(0);
        expect(firstModel).toBeDefined();
        if (!firstModel) {
            throw new Error('Expected at least one model in provider catalog.');
        }
        expect(firstModel.supportsTools).toBeTypeOf('boolean');
        expect(firstModel.supportsReasoning).toBeTypeOf('boolean');
        expect(firstModel.inputModalities.includes('text')).toBe(true);
        expect(firstModel.outputModalities.includes('text')).toBe(true);

        await providerStore.setDefaults(profileId, 'openai', 'openai/gpt-5');
        const defaults = await providerStore.getDefaults(profileId);
        expect(defaults.providerId).toBe('openai');
    });

    it('persists and rehydrates kilo balance snapshots across updates', async () => {
        const profileId = getDefaultProfileId();

        await accountSnapshotStore.upsertAccount({
            profileId,
            accountId: 'acct_kilo_primary',
            displayName: 'Neon',
            emailMasked: 'neon@example.test',
            authState: 'authenticated',
            tokenExpiresAt: '2026-03-07T16:00:00.000Z',
            balance: {
                amount: 42.75,
                currency: 'USD',
                updatedAt: '2026-03-07T15:30:00.000Z',
            },
        });

        const initial = await accountSnapshotStore.getByProfile(profileId);
        expect(initial.balance).toEqual({
            amount: 42.75,
            currency: 'USD',
            updatedAt: '2026-03-07T15:30:00.000Z',
        });

        await accountSnapshotStore.upsertAccount({
            profileId,
            accountId: 'acct_kilo_primary',
            displayName: 'Neon',
            emailMasked: 'neon@example.test',
            authState: 'authenticated',
            tokenExpiresAt: '2026-03-07T16:00:00.000Z',
            balance: {
                amount: 18.5,
                currency: 'EUR',
                updatedAt: '2026-03-07T15:45:00.000Z',
            },
        });

        const refreshed = await accountSnapshotStore.getByProfile(profileId);
        expect(refreshed.balance).toEqual({
            amount: 18.5,
            currency: 'EUR',
            updatedAt: '2026-03-07T15:45:00.000Z',
        });
    });

    it('returns typed errors for invalid tag writes and missing session refreshes', async () => {
        const profileId = getDefaultProfileId();

        const invalidTag = await tagStore.upsert(profileId, '   ');
        expect(invalidTag.isErr()).toBe(true);
        if (invalidTag.isOk()) {
            throw new Error('Expected empty tag label to fail.');
        }
        expect(invalidTag.error.code).toBe('invalid_input');

        const missingRefresh = await sessionStore.refreshStatus(profileId, 'sess_missing' as `sess_${string}`);
        expect(missingRefresh.isErr()).toBe(true);
        if (missingRefresh.isOk()) {
            throw new Error('Expected missing session refresh to fail.');
        }
        expect(missingRefresh.error.code).toBe('not_found');
    });

    it('summarizes OpenAI subscription usage in 5h and 7d rolling windows', async () => {
        const profileId = getDefaultProfileId();
        const { db } = getPersistence();
        const now = new Date('2026-03-04T12:00:00.000Z');

        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'detached',
            title: 'Usage Test',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }
        const thread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Usage Thread',
            topLevelTab: 'chat',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }
        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }
        const usageSessionId = session.session.id;

        async function createRun(prompt: string) {
            return runStore.create({
                profileId,
                sessionId: usageSessionId,
                prompt,
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                authMethod: 'oauth_device',
                runtimeOptions: {
                    reasoning: {
                        effort: 'none',
                        summary: 'none',
                        includeEncrypted: false,
                    },
                    cache: {
                        strategy: 'auto',
                    },
                    transport: {
                        openai: 'auto',
                    },
                },
                cache: {
                    applied: false,
                    key: 'usage-window-test',
                    reason: 'unsupported_transport',
                },
                transport: {
                    selected: 'responses',
                },
            });
        }

        const recentRun = await createRun('recent');
        await runUsageStore.upsert({
            runId: recentRun.id,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            inputTokens: 100,
            outputTokens: 50,
            cachedTokens: 10,
            reasoningTokens: 5,
            totalTokens: 165,
            latencyMs: 1200,
            costMicrounits: 0,
            billedVia: 'openai_subscription',
        });
        await db
            .updateTable('run_usage')
            .set({ recorded_at: '2026-03-04T11:00:00.000Z' })
            .where('run_id', '=', recentRun.id)
            .execute();

        const weeklyRun = await createRun('weekly');
        await runUsageStore.upsert({
            runId: weeklyRun.id,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            inputTokens: 200,
            outputTokens: 70,
            cachedTokens: 0,
            reasoningTokens: 0,
            totalTokens: 270,
            latencyMs: 800,
            costMicrounits: 0,
            billedVia: 'openai_subscription',
        });
        await db
            .updateTable('run_usage')
            .set({ recorded_at: '2026-03-04T04:00:00.000Z' })
            .where('run_id', '=', weeklyRun.id)
            .execute();

        const staleRun = await createRun('stale');
        await runUsageStore.upsert({
            runId: staleRun.id,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            inputTokens: 300,
            outputTokens: 80,
            cachedTokens: 0,
            reasoningTokens: 0,
            totalTokens: 380,
            latencyMs: 900,
            costMicrounits: 0,
            billedVia: 'openai_subscription',
        });
        await db
            .updateTable('run_usage')
            .set({ recorded_at: '2026-02-24T12:00:00.000Z' })
            .where('run_id', '=', staleRun.id)
            .execute();

        const byokRun = await createRun('byok');
        await runUsageStore.upsert({
            runId: byokRun.id,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            inputTokens: 400,
            outputTokens: 90,
            cachedTokens: 0,
            reasoningTokens: 0,
            totalTokens: 490,
            latencyMs: 700,
            costMicrounits: 0,
            billedVia: 'openai_api',
        });
        await db
            .updateTable('run_usage')
            .set({ recorded_at: '2026-03-04T10:00:00.000Z' })
            .where('run_id', '=', byokRun.id)
            .execute();

        const summary = await runUsageStore.summarizeOpenAISubscriptionUsage(profileId, now);

        expect(summary.providerId).toBe('openai');
        expect(summary.billedVia).toBe('openai_subscription');
        expect(summary.fiveHour.runCount).toBe(1);
        expect(summary.fiveHour.totalTokens).toBe(165);
        expect(summary.fiveHour.inputTokens).toBe(100);
        expect(summary.fiveHour.outputTokens).toBe(50);
        expect(summary.fiveHour.cachedTokens).toBe(10);
        expect(summary.fiveHour.reasoningTokens).toBe(5);
        expect(summary.fiveHour.averageLatencyMs).toBe(1200);

        expect(summary.weekly.runCount).toBe(2);
        expect(summary.weekly.totalTokens).toBe(435);
        expect(summary.weekly.inputTokens).toBe(300);
        expect(summary.weekly.outputTokens).toBe(120);
        expect(summary.weekly.cachedTokens).toBe(10);
        expect(summary.weekly.reasoningTokens).toBe(5);
        expect(summary.weekly.averageLatencyMs).toBe(1000);
    });

    it('supports profile lifecycle with last-profile delete guard and secure duplication baseline', async () => {
        const profileId = getDefaultProfileId();

        const createdResult = await profileStore.create('Workspace Profile');
        expect(createdResult.isOk()).toBe(true);
        if (createdResult.isErr()) {
            throw new Error(createdResult.error.message);
        }
        const created = createdResult.value;
        expect(created.isActive).toBe(false);

        const renamed = await profileStore.rename(created.id, 'Workspace Profile Renamed');
        expect(renamed?.name).toBe('Workspace Profile Renamed');

        await secretReferenceStore.upsert({
            profileId,
            providerId: 'openai',
            secretKind: 'api_key',
            secretKeyRef: 'secret://openai/source',
            status: 'configured',
        });

        const duplicatedResult = await profileStore.duplicate(profileId, 'Profile Duplicate');
        expect(duplicatedResult.isOk()).toBe(true);
        if (duplicatedResult.isErr()) {
            throw new Error(duplicatedResult.error.message);
        }
        const duplicated = duplicatedResult.value;
        expect(duplicated).not.toBeNull();
        if (!duplicated) {
            throw new Error('Expected profile duplication to succeed.');
        }

        const duplicatedSecrets = await secretReferenceStore.listByProfile(duplicated.id);
        expect(duplicatedSecrets).toEqual([]);

        const activatedResult = await profileStore.setActive(duplicated.id);
        expect(activatedResult.isOk()).toBe(true);
        if (activatedResult.isErr()) {
            throw new Error(activatedResult.error.message);
        }
        const activated = activatedResult.value;
        expect(activated?.id).toBe(duplicated.id);
        expect(activated?.isActive).toBe(true);

        const deletedDuplicate = await profileStore.delete(duplicated.id);
        expect(deletedDuplicate.deleted).toBe(true);
        if (!deletedDuplicate.deleted) {
            throw new Error('Expected duplicate profile deletion to succeed.');
        }
        expect(deletedDuplicate.activeProfileId).toBeDefined();

        const deletedCreated = await profileStore.delete(created.id);
        expect(deletedCreated.deleted).toBe(true);

        const lastProfileDelete = await profileStore.delete(profileId);
        expect(lastProfileDelete.deleted).toBe(false);
        if (lastProfileDelete.deleted) {
            throw new Error('Expected last profile deletion to be rejected.');
        }
        expect(lastProfileDelete.reason).toBe('last_profile');
    });

    it('returns typed profile-store errors when no profiles remain', async () => {
        const { db } = getPersistence();

        await db.deleteFrom('profiles').execute();

        const activeResult = await profileStore.getActive();
        expect(activeResult.isErr()).toBe(true);
        if (activeResult.isOk()) {
            throw new Error('Expected active profile resolution to fail without profiles.');
        }
        expect(activeResult.error.code).toBe('not_found');

        const createResult = await profileStore.create('Recovered Profile');
        expect(createResult.isErr()).toBe(true);
        if (createResult.isOk()) {
            throw new Error('Expected create to fail without a template profile.');
        }
        expect(createResult.error.code).toBe('not_found');
    });

    it('applies Kilo-only ranking policy when ranking metadata exists', async () => {
        const profileId = getDefaultProfileId();
        await providerCatalogStore.replaceModels(profileId, 'kilo', [
            {
                modelId: 'kilo/model_fast',
                label: 'Kilo Fast',
                source: 'test',
                pricing: { price: 0.3 },
                raw: {
                    latency_ms: 180,
                    tps: 55,
                },
            },
            {
                modelId: 'kilo/model_balanced',
                label: 'Kilo Balanced',
                source: 'test',
                pricing: { price: 0.1 },
                raw: {
                    latency_ms: 120,
                    tps: 40,
                },
            },
        ]);

        const rankedKiloModels = await providerStore.listModels(profileId, 'kilo');
        expect(rankedKiloModels[0]?.id).toBe('kilo/model_balanced');
        expect(rankedKiloModels[1]?.id).toBe('kilo/model_fast');
        expect(rankedKiloModels[0]?.price).toBe(0.1);
        expect(rankedKiloModels[0]?.latency).toBe(120);
        expect(rankedKiloModels[0]?.tps).toBe(40);
    });

    it('supports mcp and tool seed stores', async () => {
        const tools = await toolStore.list();
        expect(tools.some((tool) => tool.id === 'read_file')).toBe(true);

        const servers = await mcpStore.listServers();
        expect(servers.some((server) => server.id === 'github')).toBe(true);

        const connected = await mcpStore.connect('github');
        expect(connected?.connectionState).toBe('connected');
    });

    it('seeds parity baseline stores', async () => {
        const profileId = getDefaultProfileId();

        const [modes, skillfiles, account, marketplacePackages, secretReferences] = await Promise.all([
            modeStore.listByProfile(profileId),
            skillfileStore.listByProfile(profileId),
            accountSnapshotStore.getByProfile(profileId),
            marketplaceStore.listPackages(),
            secretReferenceStore.listByProfile(profileId),
        ]);

        expect(modes.some((mode) => mode.topLevelTab === 'chat' && mode.modeKey === 'chat')).toBe(true);
        expect(modes.some((mode) => mode.topLevelTab === 'agent' && mode.modeKey === 'ask')).toBe(true);
        expect(skillfiles).toEqual([]);
        expect(account.authState).toBe('logged_out');
        expect(account.profileId).toBe(profileId);
        expect(marketplacePackages).toEqual([]);
        expect(secretReferences).toEqual([]);
    });

    it('supports conversations, threads, tags, diffs, and checkpoints', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_workspace_a',
            title: 'Workspace Chat',
        });
        if (conversation.isErr()) {
            throw new Error(conversation.error.message);
        }
        const thread = await threadStore.create({
            profileId,
            conversationId: conversation.value.id,
            title: 'Thread A',
            topLevelTab: 'chat',
        });
        if (thread.isErr()) {
            throw new Error(thread.error.message);
        }
        const tagResult = await tagStore.upsert(profileId, 'backend');
        expect(tagResult.isOk()).toBe(true);
        if (tagResult.isErr()) {
            throw new Error(tagResult.error.message);
        }
        const tag = tagResult.value;
        const linkedResult = await tagStore.setThreadTags(profileId, thread.value.id, [tag.id]);
        expect(linkedResult.isOk()).toBe(true);
        if (linkedResult.isErr()) {
            throw new Error(linkedResult.error.message);
        }
        const linked = linkedResult.value;

        const session = await sessionStore.create(profileId, thread.value.id, 'local');
        if (!session.created) {
            throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
        }
        const run = await runStore.create({
            profileId,
            sessionId: session.session.id,
            prompt: 'first',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    openai: 'auto',
                },
            },
            cache: {
                applied: false,
                key: 'store-test',
                reason: 'unsupported_transport',
            },
            transport: {
                selected: 'responses',
            },
        });
        await sessionStore.markRunPending(profileId, session.session.id, run.id);
        await runStore.finalize(run.id, { status: 'completed' });
        await sessionStore.markRunTerminal(profileId, session.session.id, 'completed');

        const diff = await diffStore.create({
            profileId,
            sessionId: session.session.id,
            runId: run.id,
            summary: 'created patch',
            artifact: {
                kind: 'git',
                workspaceRootPath: 'M:\\workspace',
                workspaceLabel: 'workspace',
                baseRef: 'HEAD',
                fileCount: 1,
                files: [{ path: 'README.md', status: 'modified' }],
                fullPatch: 'diff --git a/README.md b/README.md\n',
                patchesByPath: {
                    'README.md': 'diff --git a/README.md b/README.md\n',
                },
            },
        });
        const checkpoint = await checkpointStore.create({
            profileId,
            sessionId: session.session.id,
            runId: run.id,
            diffId: diff.id,
            workspaceFingerprint: 'wsf_workspace_a',
            topLevelTab: 'agent',
            modeKey: 'code',
            summary: 'created checkpoint',
        });

        const conversations = await conversationStore.listBuckets(profileId);
        const threads = await threadStore.list({
            profileId,
            activeTab: 'chat',
            showAllModes: true,
            groupView: 'workspace',
            scope: 'workspace',
            workspaceFingerprint: 'wsf_workspace_a',
            sort: 'latest',
        });
        const tags = await tagStore.listByProfile(profileId);
        const threadTags = await tagStore.listThreadTagsByProfile(profileId);
        const diffs = await diffStore.listBySession(profileId, session.session.id);
        const checkpoints = await checkpointStore.listBySession(profileId, session.session.id);
        const firstLinked = linked[0];
        if (!firstLinked) {
            throw new Error('Expected at least one linked thread tag.');
        }

        expect(conversations.some((item) => item.id === conversation.value.id)).toBe(true);
        expect(threads.some((item) => item.id === thread.value.id)).toBe(true);
        expect(tags.some((item) => item.id === tag.id)).toBe(true);
        expect(
            threadTags.some((item) => item.threadId === firstLinked.threadId && item.tagId === firstLinked.tagId)
        ).toBe(true);
        expect(diffs.some((item) => item.id === diff.id)).toBe(true);
        expect(checkpoints.some((item) => item.id === checkpoint.id)).toBe(true);
    });
});
