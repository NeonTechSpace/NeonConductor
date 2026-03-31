import { describe, expect, it } from 'vitest';

import { planProfileSettingsReset } from '@/app/backend/runtime/services/runtimeReset/profileSettings';

function createResetDb(input?: {
    counts?: Record<string, number>;
    deletedTables?: string[];
}) {
    const counts = input?.counts ?? {};
    const deletedTables = input?.deletedTables ?? [];

    const createSelectQuery = (table: string) => {
        const query = {
            select: () => query,
            where: () => query,
            executeTakeFirst: async () => ({
                count: counts[table] ?? 0,
            }),
        };
        return query;
    };

    const createDeleteQuery = (table: string) => {
        const query = {
            where: () => query,
            execute: async () => {
                deletedTables.push(table);
            },
        };
        return query;
    };

    return {
        db: {
            selectFrom: (table: string) => createSelectQuery(table),
            deleteFrom: (table: string) => createDeleteQuery(table),
        },
        deletedTables,
    };
}

describe('runtimeReset/profileSettings', () => {
    it('includes preparation rows in profile-settings reset counts', async () => {
        const { db } = createResetDb({
            counts: {
                session_context_compaction_preparations: 3,
            },
        });

        const plan = await planProfileSettingsReset(db as never, 'profile_test');

        expect(plan.counts.sessionContextCompactionPreparations).toBe(3);
    });

    it('deletes preparation rows during profile-settings reset apply', async () => {
        const { db, deletedTables } = createResetDb();
        const plan = await planProfileSettingsReset(db as never, 'profile_test');

        await plan.apply(db as never);

        expect(deletedTables).toContain('session_context_compaction_preparations');
    });
});
