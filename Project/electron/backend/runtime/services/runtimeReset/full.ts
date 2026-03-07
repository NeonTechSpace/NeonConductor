import type { RuntimeResetCounts } from '@/app/backend/runtime/contracts';
import { listAllSecretKeyRefs } from '@/app/backend/runtime/services/runtimeReset/secrets';
import type {
    PlannedRuntimeResetOperation,
    RuntimeResetDatabase,
} from '@/app/backend/runtime/services/runtimeReset/types';

async function resolveFullCounts(db: RuntimeResetDatabase): Promise<RuntimeResetCounts> {
    const [
        settings,
        runtimeEvents,
        sessions,
        runs,
        messages,
        messageParts,
        runUsage,
        permissions,
        conversations,
        threads,
        threadTags,
        tags,
        diffs,
        checkpoints,
        modeDefinitions,
        rulesets,
        skillfiles,
        marketplacePackages,
        marketplaceAssets,
        kiloAccountSnapshots,
        kiloOrgSnapshots,
        secretReferences,
        providerAuthStates,
        providerAuthFlows,
        providerCatalogModels,
        providerDiscoverySnapshots,
        kiloModelRoutingPreferences,
    ] = await Promise.all([
        db.selectFrom('settings').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('runtime_events').select((eb) => eb.fn.count<number>('sequence').as('count')).executeTakeFirst(),
        db.selectFrom('sessions').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('runs').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('messages').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('message_parts').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('run_usage').select((eb) => eb.fn.count<number>('run_id').as('count')).executeTakeFirst(),
        db.selectFrom('permissions').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('conversations').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('threads').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('thread_tags').select((eb) => eb.fn.count<number>('thread_id').as('count')).executeTakeFirst(),
        db.selectFrom('tags').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('diffs').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('checkpoints').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('mode_definitions').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('rulesets').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('skillfiles').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db
            .selectFrom('marketplace_packages')
            .select((eb) => eb.fn.count<number>('id').as('count'))
            .executeTakeFirst(),
        db
            .selectFrom('marketplace_assets')
            .select((eb) => eb.fn.count<number>('package_id').as('count'))
            .executeTakeFirst(),
        db
            .selectFrom('kilo_account_snapshots')
            .select((eb) => eb.fn.count<number>('profile_id').as('count'))
            .executeTakeFirst(),
        db.selectFrom('kilo_org_snapshots').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db.selectFrom('secret_references').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db
            .selectFrom('provider_auth_states')
            .select((eb) => eb.fn.count<number>('provider_id').as('count'))
            .executeTakeFirst(),
        db.selectFrom('provider_auth_flows').select((eb) => eb.fn.count<number>('id').as('count')).executeTakeFirst(),
        db
            .selectFrom('provider_model_catalog')
            .select((eb) => eb.fn.count<number>('model_id').as('count'))
            .executeTakeFirst(),
        db
            .selectFrom('provider_discovery_snapshots')
            .select((eb) => eb.fn.count<number>('kind').as('count'))
            .executeTakeFirst(),
        db
            .selectFrom('kilo_model_routing_preferences')
            .select((eb) => eb.fn.count<number>('model_id').as('count'))
            .executeTakeFirst(),
    ]);

    return {
        settings: settings?.count ?? 0,
        runtimeEvents: runtimeEvents?.count ?? 0,
        sessions: sessions?.count ?? 0,
        runs: runs?.count ?? 0,
        messages: messages?.count ?? 0,
        messageParts: messageParts?.count ?? 0,
        runUsage: runUsage?.count ?? 0,
        permissions: permissions?.count ?? 0,
        conversations: conversations?.count ?? 0,
        threads: threads?.count ?? 0,
        threadTags: threadTags?.count ?? 0,
        tags: tags?.count ?? 0,
        diffs: diffs?.count ?? 0,
        checkpoints: checkpoints?.count ?? 0,
        modeDefinitions: modeDefinitions?.count ?? 0,
        rulesets: rulesets?.count ?? 0,
        skillfiles: skillfiles?.count ?? 0,
        marketplacePackages: marketplacePackages?.count ?? 0,
        marketplaceAssets: marketplaceAssets?.count ?? 0,
        kiloAccountSnapshots: kiloAccountSnapshots?.count ?? 0,
        kiloOrgSnapshots: kiloOrgSnapshots?.count ?? 0,
        secretReferences: secretReferences?.count ?? 0,
        providerAuthStates: providerAuthStates?.count ?? 0,
        providerAuthFlows: providerAuthFlows?.count ?? 0,
        providerCatalogModels: providerCatalogModels?.count ?? 0,
        providerDiscoverySnapshots: providerDiscoverySnapshots?.count ?? 0,
        kiloModelRoutingPreferences: kiloModelRoutingPreferences?.count ?? 0,
    };
}

async function applyFullReset(db: RuntimeResetDatabase): Promise<void> {
    await db.deleteFrom('runtime_events').execute();
    await db.deleteFrom('permissions').execute();
    await db.deleteFrom('sessions').execute();
    await db.deleteFrom('checkpoints').execute();
    await db.deleteFrom('conversations').execute();
    await db.deleteFrom('tags').execute();
    await db.deleteFrom('settings').execute();
    await db.deleteFrom('mode_definitions').execute();
    await db.deleteFrom('rulesets').execute();
    await db.deleteFrom('skillfiles').execute();
    await db.deleteFrom('kilo_account_snapshots').execute();
    await db.deleteFrom('kilo_org_snapshots').execute();
    await db.deleteFrom('secret_references').execute();
    await db.deleteFrom('provider_auth_states').execute();
    await db.deleteFrom('provider_auth_flows').execute();
    await db.deleteFrom('provider_model_catalog').execute();
    await db.deleteFrom('provider_discovery_snapshots').execute();
    await db.deleteFrom('kilo_model_routing_preferences').execute();
    await db.deleteFrom('permission_policy_overrides').execute();
    await db.deleteFrom('marketplace_packages').execute();
    await db.deleteFrom('provider_models').execute();
    await db.deleteFrom('providers').execute();
    await db.deleteFrom('tools_catalog').execute();
    await db.deleteFrom('mcp_servers').execute();
}

export async function planFullReset(db: RuntimeResetDatabase): Promise<PlannedRuntimeResetOperation> {
    const [counts, secretKeyRefs] = await Promise.all([resolveFullCounts(db), listAllSecretKeyRefs(db)]);

    return {
        counts,
        secretKeyRefs,
        reseedRuntimeData: true,
        apply: async (applyDb) => {
            await applyFullReset(applyDb);
        },
    };
}
