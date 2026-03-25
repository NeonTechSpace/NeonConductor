import { describe, expect, it } from 'vitest';

import {
    registerPersistenceStoreHooks,
    accountSnapshotStore,
    conversationStore,
    getDefaultProfileId,
    getPersistence,
    profileStore,
    providerCatalogStore,
    providerSecretStore,
    providerStore,
    runStore,
    runUsageStore,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/__tests__/stores.shared';

registerPersistenceStoreHooks();

describe('persistence stores: profile and provider domain', () => {
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
        expect(firstModel.features.supportsTools).toBeTypeOf('boolean');
        expect(firstModel.features.supportsReasoning).toBeTypeOf('boolean');
        expect(firstModel.features.inputModalities.includes('text')).toBe(true);
        expect(firstModel.features.outputModalities.includes('text')).toBe(true);

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
                        family: 'auto',
                    },
                },
                cache: {
                    applied: false,
                    key: 'usage-window-test',
                    reason: 'unsupported_transport',
                },
                transport: {
                    selected: 'openai_responses',
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

        expect(summary.providerId).toBe('openai_codex');
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

        await providerSecretStore.upsertValue({
            profileId,
            providerId: 'openai',
            secretKind: 'api_key',
            secretValue: 'openai-profile-source-key',
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

        const duplicatedSecrets = await providerSecretStore.listByProfile(duplicated.id);
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
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'openai_compatible',
                },
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
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'openai_compatible',
                },
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

});
