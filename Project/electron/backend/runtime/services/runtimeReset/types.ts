import type { DatabaseSchema } from '@/app/backend/persistence/schema';
import type { RuntimeResetCounts } from '@/app/backend/runtime/contracts';

import type { Kysely } from 'kysely';

export type RuntimeResetDatabase = Kysely<DatabaseSchema>;

export const EMPTY_COUNTS: RuntimeResetCounts = {
    settings: 0,
    runtimeEvents: 0,
    sessions: 0,
    runs: 0,
    messages: 0,
    messageParts: 0,
    runUsage: 0,
    permissions: 0,
    conversations: 0,
    threads: 0,
    threadTags: 0,
    tags: 0,
    diffs: 0,
    checkpoints: 0,
    modeDefinitions: 0,
    rulesets: 0,
    skillfiles: 0,
    marketplacePackages: 0,
    marketplaceAssets: 0,
    kiloAccountSnapshots: 0,
    kiloOrgSnapshots: 0,
    secretReferences: 0,
    providerAuthStates: 0,
    providerAuthFlows: 0,
    providerCatalogModels: 0,
    providerDiscoverySnapshots: 0,
    kiloModelRoutingPreferences: 0,
};

export interface PlannedRuntimeResetOperation {
    counts: RuntimeResetCounts;
    secretKeyRefs: string[];
    reseedRuntimeData: boolean;
    apply: (db: RuntimeResetDatabase) => Promise<void>;
}
