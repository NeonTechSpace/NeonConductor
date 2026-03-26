import { expect, expectTypeOf, test } from 'vitest';

import { OPENAI_RATE_LIMITS_PROCEDURE, OPENAI_USAGE_PROCEDURE } from '@/app/backend/trpc/__tests__/app-router.types.shared';
import type { AppRouterInputs, AppRouterOutputs } from '@/app/backend/trpc/__tests__/app-router.types.shared';

test('AppRouter exposes prompt and provider procedure contracts to clients', () => {
    expect(OPENAI_USAGE_PROCEDURE.startsWith('getOpenAI')).toBe(true);
    expect(OPENAI_RATE_LIMITS_PROCEDURE.startsWith('getOpenAI')).toBe(true);

    expectTypeOf<AppRouterInputs['prompt']['getSettings']>().toExtend<{
        profileId: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['setAppGlobalInstructions']>().toExtend<{
        profileId: string;
        value: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['setProfileGlobalInstructions']>().toExtend<{
        profileId: string;
        value: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['setTopLevelInstructions']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        value: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['setBuiltInModePrompt']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        roleDefinition: string;
        customInstructions: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['resetBuiltInModePrompt']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['exportCustomMode']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        scope: 'global' | 'workspace';
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['getCustomMode']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        scope: 'global' | 'workspace';
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['createCustomMode']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        scope: 'global' | 'workspace';
        workspaceFingerprint?: string;
        mode: {
            slug: string;
            name: string;
            description?: string;
            roleDefinition?: string;
            customInstructions?: string;
            whenToUse?: string;
            tags?: string[];
            toolCapabilities?: Array<'filesystem_read' | 'filesystem_write' | 'shell' | 'git' | 'mcp'>;
        };
    }>();
    expectTypeOf<AppRouterInputs['prompt']['updateCustomMode']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        scope: 'global' | 'workspace';
        workspaceFingerprint?: string;
        mode: {
            name: string;
            description?: string;
            roleDefinition?: string;
            customInstructions?: string;
            whenToUse?: string;
            tags?: string[];
            toolCapabilities?: Array<'filesystem_read' | 'filesystem_write' | 'shell' | 'git' | 'mcp'>;
        };
    }>();
    expectTypeOf<AppRouterInputs['prompt']['deleteCustomMode']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        scope: 'global' | 'workspace';
        workspaceFingerprint?: string;
        confirm: boolean;
    }>();
    expectTypeOf<AppRouterInputs['prompt']['importCustomMode']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        scope: 'global' | 'workspace';
        workspaceFingerprint?: string;
        jsonText: string;
        overwrite: boolean;
    }>();

    expectTypeOf<AppRouterInputs['provider']['setDefault']>().toExtend<{
        profileId: string;
        providerId: string;
        modelId: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['setSpecialistDefault']>().toExtend<{
        profileId: string;
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: string;
        modelId: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['listModels']>().toExtend<{
        profileId: string;
        providerId: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['getExecutionPreference']>().toExtend<{
        profileId: string;
        providerId: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['getDefaults']>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterInputs['provider'][typeof OPENAI_USAGE_PROCEDURE]>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterInputs['provider'][typeof OPENAI_RATE_LIMITS_PROCEDURE]>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterOutputs['provider']['listModels']>().toExtend<{
        models: Array<{
            id: string;
            providerId: string;
            label: string;
            source?: string;
            sourceProvider?: string;
            updatedAt?: string;
            features: {
                supportsTools: boolean;
                supportsReasoning: boolean;
                supportsVision: boolean;
                supportsPromptCache?: boolean;
                inputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
                outputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
            };
            runtime:
                | {
                      toolProtocol: 'openai_responses';
                      apiFamily: 'openai_compatible';
                      supportsRealtimeWebSocket?: boolean;
                  }
                | {
                      toolProtocol: 'openai_chat_completions';
                      apiFamily: 'openai_compatible';
                  }
                | {
                      toolProtocol: 'kilo_gateway';
                      apiFamily: 'kilo_gateway';
                      routedApiFamily: 'openai_compatible' | 'anthropic_messages' | 'google_generativeai';
                  }
                | {
                      toolProtocol: 'provider_native';
                      apiFamily?:
                          | 'openai_compatible'
                          | 'kilo_gateway'
                          | 'provider_native'
                          | 'anthropic_messages'
                          | 'google_generativeai';
                      providerNativeId: string;
                  }
                | {
                      toolProtocol: 'anthropic_messages';
                      apiFamily: 'anthropic_messages';
                  }
                | {
                      toolProtocol: 'google_generativeai';
                      apiFamily: 'google_generativeai';
                  };
            promptFamily?: string;
            contextLength?: number;
            maxOutputTokens?: number;
            inputPrice?: number;
            outputPrice?: number;
            cacheReadPrice?: number;
            cacheWritePrice?: number;
            latency?: number;
            tps?: number;
        }>;
        reason: 'provider_not_found' | 'catalog_sync_failed' | 'catalog_empty_after_normalization' | null;
        detail?: string;
    }>();
    expectTypeOf<AppRouterOutputs['provider'][typeof OPENAI_USAGE_PROCEDURE]>().toExtend<{
        usage: {
            providerId: 'openai_codex';
            billedVia: 'openai_subscription';
            fiveHour: {
                windowLabel: 'last_5_hours' | 'last_7_days';
                runCount: number;
                totalTokens: number;
                inputTokens: number;
                outputTokens: number;
                cachedTokens: number;
                reasoningTokens: number;
                totalCostMicrounits: number;
                averageLatencyMs?: number;
            };
            weekly: {
                windowLabel: 'last_5_hours' | 'last_7_days';
                runCount: number;
                totalTokens: number;
                inputTokens: number;
                outputTokens: number;
                cachedTokens: number;
                reasoningTokens: number;
                totalCostMicrounits: number;
                averageLatencyMs?: number;
            };
        };
    }>();
    expectTypeOf<AppRouterOutputs['provider'][typeof OPENAI_RATE_LIMITS_PROCEDURE]>().toExtend<{
        rateLimits: {
            providerId: 'openai_codex';
            source: 'chatgpt_wham' | 'unavailable';
            fetchedAt: number;
            planType?: string;
            primary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number };
            secondary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number };
            limits: Array<{
                limitId: string;
                limitName?: string;
                primary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number };
                secondary?: { usedPercent: number; windowMinutes?: number; resetsAt?: number };
            }>;
            reason?:
                | 'oauth_required'
                | 'not_authenticated'
                | 'missing_access_token'
                | 'fetch_failed'
                | 'invalid_payload';
            detail?: string;
        };
    }>();
    expectTypeOf<AppRouterOutputs['provider']['getDefaults']>().toExtend<{
        defaults: { providerId: string; modelId: string };
        specialistDefaults: Array<{
            topLevelTab: 'agent' | 'orchestrator';
            modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
            providerId: string;
            modelId: string;
        }>;
    }>();
    expectTypeOf<AppRouterInputs['provider']['setApiKey']>().toExtend<{
        profileId: string;
        providerId: string;
        apiKey: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['startAuth']>().toExtend<{
        profileId: string;
        providerId: string;
        method: 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';
    }>();
    expectTypeOf<AppRouterInputs['provider']['pollAuth']>().toExtend<{
        profileId: string;
        providerId: string;
        flowId: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['completeAuth']>().toExtend<{
        profileId: string;
        providerId: string;
        flowId: string;
        code?: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['setOrganization']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        organizationId?: string | null;
    }>();
    expectTypeOf<AppRouterOutputs['provider']['getAccountContext']>().toExtend<{
        profileId: string;
        providerId: string;
        authState: { authState: string; tokenExpiresAt?: string };
        kiloAccountContext?: { balance?: { amount: number; currency: string; updatedAt: string } };
    }>();
    expectTypeOf<AppRouterInputs['provider']['getConnectionProfile']>().toExtend<{
        profileId: string;
        providerId: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['setConnectionProfile']>().toExtend<{
        profileId: string;
        providerId: string;
        optionProfileId: string;
        baseUrlOverride?: string | null;
        organizationId?: string | null;
    }>();
    expectTypeOf<AppRouterInputs['provider']['setExecutionPreference']>().toExtend<{
        profileId: string;
        providerId: 'openai';
        mode: 'standard_http' | 'realtime_websocket';
    }>();
    expectTypeOf<AppRouterInputs['provider']['getModelRoutingPreference']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        modelId: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['setModelRoutingPreference']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        modelId: string;
        routingMode: 'dynamic' | 'pinned';
        sort?: 'default' | 'price' | 'throughput' | 'latency';
        pinnedProviderId?: string;
    }>();
    expectTypeOf<AppRouterInputs['provider']['listModelProviders']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        modelId: string;
    }>();

    expectTypeOf<AppRouterOutputs['prompt']['getSettings']>().toExtend<{
        settings: {
            appGlobalInstructions: string;
            profileGlobalInstructions: string;
            topLevelInstructions: Record<'chat' | 'agent' | 'orchestrator', string>;
            builtInModes: Record<
                'chat' | 'agent' | 'orchestrator',
                Array<{
                    topLevelTab: 'chat' | 'agent' | 'orchestrator';
                    modeKey: string;
                    label: string;
                    prompt: { roleDefinition?: string; customInstructions?: string };
                    hasOverride: boolean;
                }>
            >;
            fileBackedCustomModes: {
                global: Record<
                    'chat' | 'agent' | 'orchestrator',
                    Array<{
                        topLevelTab: 'chat' | 'agent' | 'orchestrator';
                        modeKey: string;
                        label: string;
                        description?: string;
                        whenToUse?: string;
                        tags?: string[];
                        toolCapabilities?: Array<'filesystem_read' | 'filesystem_write' | 'shell' | 'git' | 'mcp'>;
                    }>
                >;
                workspace?: Record<
                    'chat' | 'agent' | 'orchestrator',
                    Array<{
                        topLevelTab: 'chat' | 'agent' | 'orchestrator';
                        modeKey: string;
                        label: string;
                        description?: string;
                        whenToUse?: string;
                        tags?: string[];
                        toolCapabilities?: Array<'filesystem_read' | 'filesystem_write' | 'shell' | 'git' | 'mcp'>;
                    }>
                >;
            };
        };
    }>();
    expectTypeOf<AppRouterOutputs['prompt']['exportCustomMode']>().toExtend<{
        modeKey: string;
        scope: 'global' | 'workspace';
        jsonText: string;
    }>();
    expectTypeOf<AppRouterOutputs['prompt']['getCustomMode']>().toExtend<{
        mode: {
            scope: 'global' | 'workspace';
            topLevelTab: 'chat' | 'agent' | 'orchestrator';
            modeKey: string;
            slug: string;
            name: string;
            description?: string;
            roleDefinition?: string;
            customInstructions?: string;
            whenToUse?: string;
            tags?: string[];
            toolCapabilities?: Array<'filesystem_read' | 'filesystem_write' | 'shell' | 'git' | 'mcp'>;
        };
    }>();
});

