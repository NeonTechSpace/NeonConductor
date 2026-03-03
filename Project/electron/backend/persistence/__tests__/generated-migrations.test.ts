import { describe, expect, it } from 'vitest';

import { runtimeSqlMigrations } from '@/app/backend/persistence/generatedMigrations';

describe('generated migrations', () => {
    it('includes ordered sql migrations used by runtime', () => {
        const names = runtimeSqlMigrations.map((migration) => migration.name);
        expect(names).toEqual([
            '001_init.sql',
            '002_core_runtime.sql',
            '003_p1c_runtime_foundation.sql',
            '004_p1d_kilo_parity.sql',
            '005_p2a_provider_auth_foundation.sql',
        ]);
    });
});
