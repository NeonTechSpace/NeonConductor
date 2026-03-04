import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, getPersistence, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    accountSnapshotStore,
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
        const thread = await threadStore.create({
            profileId,
            conversationId: bucket.id,
            title: 'Main',
        });
        const session = await sessionStore.create(profileId, thread.id, 'local');
        expect(session.turnCount).toBe(0);

        const run = await runStore.create({
            profileId,
            sessionId: session.id,
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
        await sessionStore.markRunPending(profileId, session.id, run.id);
        await runStore.finalize(run.id, { status: 'completed' });
        await sessionStore.markRunTerminal(profileId, session.id, 'completed');

        const status = await sessionStore.status(profileId, session.id);
        expect(status.found).toBe(true);
        if (!status.found) {
            throw new Error('Expected session to exist.');
        }
        expect(status.session.runStatus).toBe('completed');

        const reverted = await sessionStore.revert(profileId, session.id);
        expect(reverted.reverted).toBe(true);
    });

    it('supports permission store decision transitions', async () => {
        const created = await permissionStore.create({
            policy: 'ask',
            resource: 'tool:run_command',
        });
        expect(created.decision).toBe('pending');

        const granted = await permissionStore.setDecision(created.id, 'granted');
        expect(granted?.decision).toBe('granted');

        const denied = await permissionStore.setDecision(created.id, 'denied');
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

    it('summarizes OpenAI subscription usage in 5h and 7d rolling windows', async () => {
        const profileId = getDefaultProfileId();
        const { db } = getPersistence();
        const now = new Date('2026-03-04T12:00:00.000Z');

        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'detached',
            title: 'Usage Test',
        });
        const thread = await threadStore.create({
            profileId,
            conversationId: conversation.id,
            title: 'Usage Thread',
        });
        const session = await sessionStore.create(profileId, thread.id, 'local');

        async function createRun(prompt: string) {
            return runStore.create({
                profileId,
                sessionId: session.id,
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

        const created = await profileStore.create('Workspace Profile');
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

        const duplicated = await profileStore.duplicate(profileId, 'Profile Duplicate');
        expect(duplicated).not.toBeNull();
        if (!duplicated) {
            throw new Error('Expected profile duplication to succeed.');
        }

        const duplicatedSecrets = await secretReferenceStore.listByProfile(duplicated.id);
        expect(duplicatedSecrets).toEqual([]);

        const activated = await profileStore.setActive(duplicated.id);
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

    it('supports conversations, threads, tags, and diffs', async () => {
        const profileId = getDefaultProfileId();
        const conversation = await conversationStore.createOrGetBucket({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_workspace_a',
            title: 'Workspace Chat',
        });
        const thread = await threadStore.create({
            profileId,
            conversationId: conversation.id,
            title: 'Thread A',
        });
        const tag = await tagStore.upsert(profileId, 'backend');
        const linked = await tagStore.setThreadTags(profileId, thread.id, [tag.id]);

        const session = await sessionStore.create(profileId, thread.id, 'local');
        const run = await runStore.create({
            profileId,
            sessionId: session.id,
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
        await sessionStore.markRunPending(profileId, session.id, run.id);
        await runStore.finalize(run.id, { status: 'completed' });
        await sessionStore.markRunTerminal(profileId, session.id, 'completed');

        const diff = await diffStore.create({
            profileId,
            sessionId: session.id,
            runId: run.id,
            summary: 'created patch',
            payload: { files: ['README.md'] },
        });

        const conversations = await conversationStore.listBuckets(profileId);
        const threads = await threadStore.list({
            profileId,
            scope: 'workspace',
            workspaceFingerprint: 'wsf_workspace_a',
            sort: 'latest',
        });
        const tags = await tagStore.listByProfile(profileId);
        const threadTags = await tagStore.listThreadTagsByProfile(profileId);
        const diffs = await diffStore.listBySession(profileId, session.id);
        const firstLinked = linked[0];
        if (!firstLinked) {
            throw new Error('Expected at least one linked thread tag.');
        }

        expect(conversations.some((item) => item.id === conversation.id)).toBe(true);
        expect(threads.some((item) => item.id === thread.id)).toBe(true);
        expect(tags.some((item) => item.id === tag.id)).toBe(true);
        expect(
            threadTags.some((item) => item.threadId === firstLinked.threadId && item.tagId === firstLinked.tagId)
        ).toBe(true);
        expect(diffs.some((item) => item.id === diff.id)).toBe(true);
    });
});
