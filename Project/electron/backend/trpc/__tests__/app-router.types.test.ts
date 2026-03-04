import { expect, expectTypeOf, test } from 'vitest';

import type { AppRouter } from '@/app/backend/trpc/router';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

test('AppRouter exposes runtime procedure contracts to clients', () => {
    type Inputs = inferRouterInputs<AppRouter>;
    type Outputs = inferRouterOutputs<AppRouter>;

    expectTypeOf<Inputs['session']['create']>().toExtend<{
        profileId: string;
        threadId: string;
        kind: 'local' | 'worktree' | 'cloud';
    }>();

    expectTypeOf<Inputs['conversation']['listBuckets']>().toExtend<{
        profileId: string;
    }>();

    expectTypeOf<Inputs['conversation']['listThreads']>().toExtend<{
        profileId: string;
        scope?: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        sort?: 'latest' | 'alphabetical';
    }>();

    expectTypeOf<Inputs['conversation']['createThread']>().toExtend<{
        profileId: string;
        scope: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        title: string;
    }>();

    expectTypeOf<Inputs['session']['startRun']>().toExtend<{
        profileId: string;
        sessionId: string;
        prompt: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
        runtimeOptions: {
            reasoning: {
                effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
                summary: 'auto' | 'none';
                includeEncrypted: boolean;
            };
            cache: {
                strategy: 'auto' | 'manual';
                key?: string;
            };
            transport: {
                openai: 'responses' | 'chat' | 'auto';
            };
        };
        providerId?: 'kilo' | 'openai';
        modelId?: string;
    }>();

    expectTypeOf<Inputs['mode']['list']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
    }>();

    expectTypeOf<Inputs['mode']['getActive']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<Inputs['mode']['setActive']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<Inputs['profile']['setActive']>().toExtend<{
        profileId: string;
    }>();

    expectTypeOf<Inputs['profile']['create']>().toExtend<{
        name?: string;
    }>();

    expectTypeOf<Inputs['profile']['rename']>().toExtend<{
        profileId: string;
        name: string;
    }>();

    expectTypeOf<Inputs['profile']['duplicate']>().toExtend<{
        profileId: string;
        name?: string;
    }>();

    expectTypeOf<Inputs['profile']['delete']>().toExtend<{
        profileId: string;
    }>();

    expectTypeOf<Inputs['session']['list']>().toExtend<{
        profileId: string;
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
    expectTypeOf<Inputs['provider']['getOpenAISubscriptionUsage']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Inputs['provider']['getOpenAISubscriptionRateLimits']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Outputs['provider']['listModels']>().toExtend<{
        models: Array<{
            id: string;
            providerId: 'kilo' | 'openai';
            supportsTools: boolean;
            supportsReasoning: boolean;
            supportsVision: boolean;
            inputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
            outputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
            promptFamily?: string;
        }>;
    }>();
    expectTypeOf<Outputs['provider']['getOpenAISubscriptionUsage']>().toExtend<{
        usage: {
            providerId: 'openai';
            billedVia: 'openai_subscription';
            fiveHour: {
                windowLabel: 'last_5_hours' | 'last_7_days';
                runCount: number;
                totalTokens: number;
            };
            weekly: {
                windowLabel: 'last_5_hours' | 'last_7_days';
                runCount: number;
                totalTokens: number;
            };
        };
    }>();
    expectTypeOf<Outputs['provider']['getOpenAISubscriptionRateLimits']>().toExtend<{
        rateLimits: {
            providerId: 'openai';
            source: 'chatgpt_wham' | 'unavailable';
            limits: Array<{
                limitId: string;
                primary?: {
                    usedPercent: number;
                };
                secondary?: {
                    usedPercent: number;
                };
            }>;
        };
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

    expectTypeOf<Inputs['permission']['getEffectivePolicy']>().toExtend<{
        profileId: string;
        resource: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<Inputs['tool']['invoke']>().toExtend<{
        profileId: string;
        toolId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        args?: Record<string, unknown>;
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<Inputs['plan']['start']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        prompt: string;
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<Inputs['orchestrator']['start']>().toExtend<{
        profileId: string;
        planId: string;
        runtimeOptions: {
            reasoning: {
                effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
                summary: 'auto' | 'none';
                includeEncrypted: boolean;
            };
            cache: {
                strategy: 'auto' | 'manual';
                key?: string;
            };
            transport: {
                openai: 'responses' | 'chat' | 'auto';
            };
        };
        providerId?: 'kilo' | 'openai';
        modelId?: string;
        workspaceFingerprint?: string;
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
        activeProfileId: string;
        profiles: Array<{
            id: string;
            isActive: boolean;
        }>;
        sessions: Array<{
            id: string;
            runStatus: 'idle' | 'running' | 'completed' | 'aborted' | 'error';
        }>;
    }>();

    expect(true).toBe(true);
});
