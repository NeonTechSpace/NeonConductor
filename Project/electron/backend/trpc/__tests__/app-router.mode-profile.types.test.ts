import { expectTypeOf, test } from 'vitest';

import type { AppRouterInputs } from '@/app/backend/trpc/__tests__/app-router.types.shared';

test('AppRouter exposes mode and profile procedure contracts to clients', () => {
    expectTypeOf<AppRouterInputs['mode']['list']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<AppRouterInputs['mode']['getActive']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<AppRouterInputs['mode']['setActive']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<AppRouterInputs['profile']['setActive']>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterInputs['profile']['create']>().toExtend<{ name?: string }>();
    expectTypeOf<AppRouterInputs['profile']['rename']>().toExtend<{
        profileId: string;
        name: string;
    }>();
    expectTypeOf<AppRouterInputs['profile']['duplicate']>().toExtend<{
        profileId: string;
        name?: string;
    }>();
    expectTypeOf<AppRouterInputs['profile']['delete']>().toExtend<{
        profileId: string;
    }>();
});

