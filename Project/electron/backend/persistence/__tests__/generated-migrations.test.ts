import { describe, expect, it } from 'vitest';

import { runtimeSqlMigrations } from '@/app/backend/persistence/generatedMigrations';

describe('generated migrations', () => {
    it('includes ordered sql migrations used by runtime', () => {
        const names = runtimeSqlMigrations.map((migration) => migration.name);
        expect(names).toEqual([
            '001_runtime_baseline_v4.sql',
            '002_kilo_account_balance.sql',
            '003_runtime_safety_foundation.sql',
            '004_registry_metadata.sql',
            '005_registry_precedence_indexes.sql',
            '006_session_attached_skills.sql',
            '007_run_command_shell_approvals.sql',
            '008_diff_checkpoints.sql',
            '009_managed_worktrees.sql',
            '010_provider_secrets.sql',
            '011_drop_legacy_secret_references.sql',
            '012_context_management.sql',
            '013_static_model_limits.sql',
            '014_model_limit_overrides.sql',
        ]);
    });
});
