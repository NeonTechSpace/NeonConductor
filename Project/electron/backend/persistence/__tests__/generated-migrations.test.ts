import { describe, expect, it } from 'vitest';

import { runtimeSqlMigrations } from '@/app/backend/persistence/generatedMigrations';
import { runtimeSqlSchemaMetadata } from '@/app/backend/persistence/generatedSchemaMetadata';

describe('generated migrations', () => {
    it('includes ordered sql migrations used by runtime', () => {
        const names = runtimeSqlMigrations.map((migration) => migration.name);
        expect(names).toEqual(['001_runtime_baseline.sql']);
    });

    it('records deterministic baseline schema metadata', () => {
        expect(runtimeSqlSchemaMetadata.baselineMigrationName).toBe('001_runtime_baseline.sql');
        expect(runtimeSqlSchemaMetadata.tables).toEqual(expect.arrayContaining(['profiles', 'runtime_events']));
        expect(runtimeSqlSchemaMetadata.indexes).toContain('idx_permissions_decision_created_at');
    });
});
