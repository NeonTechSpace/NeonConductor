import { expect, expectTypeOf, test } from 'vitest';

import type { AppRouter } from '@/app/backend/trpc/router';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

test('AppRouter exposes runtime procedure contracts to clients', () => {
    type Inputs = inferRouterInputs<AppRouter>;
    type Outputs = inferRouterOutputs<AppRouter>;

    expectTypeOf<Inputs['session']['create']>().toExtend<{
        scope: 'detached' | 'workspace';
        kind: 'local' | 'worktree' | 'cloud';
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<Inputs['session']['prompt']>().toExtend<{
        sessionId: string;
        prompt: string;
    }>();

    expectTypeOf<Inputs['provider']['setDefault']>().toExtend<{
        profileId: string;
        providerId: string;
        modelId: string;
    }>();

    expectTypeOf<Inputs['provider']['listModels']>().toExtend<{
        profileId: string;
        providerId: string;
    }>();

    expectTypeOf<Inputs['provider']['setApiKey']>().toExtend<{
        profileId: string;
        providerId: 'kilo' | 'openai';
        apiKey: string;
    }>();

    expectTypeOf<Inputs['provider']['startAuth']>().toExtend<{
        profileId: string;
        providerId: 'kilo' | 'openai';
        method: 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';
    }>();

    expectTypeOf<Inputs['provider']['pollAuth']>().toExtend<{
        profileId: string;
        providerId: 'kilo' | 'openai';
        flowId: string;
    }>();

    expectTypeOf<Inputs['provider']['completeAuth']>().toExtend<{
        profileId: string;
        providerId: 'kilo' | 'openai';
        flowId: string;
        code?: string;
    }>();

    expectTypeOf<Inputs['provider']['setOrganization']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        organizationId?: string | null;
    }>();

    expectTypeOf<Inputs['permission']['request']>().toExtend<{
        policy: 'ask' | 'allow' | 'deny';
        resource: string;
    }>();

    expectTypeOf<Outputs['mcp']['listServers']>().toExtend<{
        servers: Array<{
            id: string;
            label: string;
            authMode: 'none' | 'token';
            connectionState: 'disconnected' | 'connected';
            authState: 'unauthenticated' | 'authenticated';
        }>;
    }>();

    expectTypeOf<Inputs['runtime']['subscribeEvents']>().toExtend<{
        afterSequence?: number;
    }>();

    expectTypeOf<Inputs['runtime']['reset']>().toExtend<{
        target: 'workspace' | 'workspace_all' | 'profile_settings' | 'full';
        profileId?: string;
        workspaceFingerprint?: string;
        dryRun?: boolean;
        confirm?: boolean;
    }>();

    expectTypeOf<Inputs['runtime']['getSnapshot']>().toExtend<{
        profileId: string;
    }>();

    expectTypeOf<Outputs['runtime']['getSnapshot']>().toExtend<{
        generatedAt: string;
        lastSequence: number;
        sessions: Array<{
            id: string;
            runStatus: 'idle' | 'running' | 'completed' | 'aborted' | 'error';
        }>;
    }>();

    expect(true).toBe(true);
});
