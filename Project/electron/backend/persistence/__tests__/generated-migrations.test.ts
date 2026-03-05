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
            '006_p2b_auth_flow_rebuild.sql',
            '007_p2c_runtime_transport_and_usage.sql',
            '008_p2_5_reasoning_and_cache_controls.sql',
            '009_p2_6_provider_capability_parity.sql',
            '010_p3b_conversation_graph.sql',
            '011_p4_2_plan_orchestrator_and_permission_overrides.sql',
            '012_p4_3_profile_lifecycle.sql',
            '013_p4_4_kilo_model_routing_preferences.sql',
            '014_p4_5_thread_mode_affinity_and_branching.sql',
        ]);
    });
});
