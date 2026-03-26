import { expect, expectTypeOf, test } from 'vitest';

import type { AppRouterInputs, AppRouterOutputs } from '@/app/backend/trpc/__tests__/app-router.types.shared';
import type { BootStatusSnapshot } from '@/app/shared/splashContract';


test('AppRouter exposes system, runtime, tooling, and registry procedure contracts to clients', () => {
    expect.hasAssertions();
    expectTypeOf<AppRouterInputs['permission']['request']>().toExtend<{
        policy: 'ask' | 'allow' | 'deny';
        resource: string;
        commandText?: string;
        approvalCandidates?: Array<{ label: string; resource: string; detail?: string }>;
    }>();
    expectTypeOf<AppRouterInputs['permission']['resolve']>().toExtend<{
        profileId: string;
        requestId: string;
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace';
        selectedApprovalResource?: string;
    }>();
    expectTypeOf<AppRouterInputs['permission']['getEffectivePolicy']>().toExtend<{
        profileId: string;
        resource: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['tool']['invoke']>().toExtend<{
        profileId: string;
        toolId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        args?: Record<string, unknown>;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['plan']['start']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        prompt: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['orchestrator']['start']>().toExtend<{
        profileId: string;
        planId: string;
        runtimeOptions: {
            reasoning: {
                effort: 'none' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
                summary: 'auto' | 'none';
                includeEncrypted: boolean;
            };
            cache: { strategy: 'auto' | 'manual'; key?: string };
            transport: { family: 'auto' | 'openai_responses' | 'openai_chat_completions' };
        };
        providerId?: string;
        modelId?: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterOutputs['mcp']['listServers']>().toExtend<{
        servers: Array<{
            id: string;
            label: string;
            transport: 'stdio';
            command: string;
            args: string[];
            workingDirectoryMode: 'inherit_process' | 'workspace_root' | 'fixed_path';
            fixedWorkingDirectory?: string;
            timeoutMs?: number;
            enabled: boolean;
            connectionState: 'disconnected' | 'connecting' | 'connected' | 'error';
            lastError?: string;
            connectedAt?: string;
            updatedAt: string;
            toolDiscoveryState: 'idle' | 'discovering' | 'ready' | 'error';
            tools: Array<{ name: string; description?: string; inputSchema: Record<string, unknown> }>;
            envKeys: string[];
        }>;
    }>();
    expectTypeOf<AppRouterInputs['runtime']['subscribeEvents']>().toExtend<{ afterSequence?: number }>();
    expectTypeOf<AppRouterInputs['runtime']['subscribeObservability']>().toExtend<{
        afterSequence?: number;
        profileId?: string;
        sessionId?: string;
        runId?: string;
    }>();
    expectTypeOf<AppRouterInputs['runtime']['reset']>().toExtend<{
        target: 'workspace' | 'workspace_all' | 'profile_settings' | 'full';
        profileId?: string;
        workspaceFingerprint?: string;
        dryRun?: boolean;
        confirm?: boolean;
    }>();
    expectTypeOf<AppRouterInputs['runtime']['getDiagnosticSnapshot']>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterInputs['runtime']['getShellBootstrap']>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterInputs['runtime']['inspectWorkspaceEnvironment']>().toExtend<
        { profileId: string; workspaceFingerprint: string } | { profileId: string; absolutePath: string }
    >();
    expectTypeOf<AppRouterInputs['system']['reportBootStatus']>().toExtend<BootStatusSnapshot>();
    expectTypeOf<AppRouterOutputs['system']['reportBootStatus']>().toExtend<{ accepted: boolean }>();
    expectTypeOf<AppRouterInputs['system']['openPath']>().toExtend<{ path: string }>();
    expectTypeOf<AppRouterInputs['system']['openExternalUrl']>().toExtend<{ url: string }>();
    expectTypeOf<AppRouterOutputs['system']['openExternalUrl']>().toExtend<
        { opened: true } | { opened: false; reason: 'unsafe_url' }
    >();
    expectTypeOf<AppRouterInputs['registry']['refresh']>().toExtend<{
        profileId: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['registry']['listResolved']>().toExtend<{
        profileId: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<AppRouterInputs['registry']['searchSkills']>().toExtend<{
        profileId: string;
        query?: string;
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<AppRouterOutputs['runtime']['getDiagnosticSnapshot']>().toExtend<{
        generatedAt: string;
        lastSequence: number;
        activeProfileId: string;
        profiles: Array<{ id: string; isActive: boolean }>;
        sessions: Array<{ id: string; runStatus: 'idle' | 'running' | 'completed' | 'aborted' | 'error' }>;
    }>();
    expectTypeOf<AppRouterOutputs['runtime']['getShellBootstrap']>().toExtend<{
        lastSequence: number;
        providerControl: {
            entries: Array<{
                provider: {
                    executionPreference?: {
                        providerId: string;
                        mode: 'standard_http' | 'realtime_websocket';
                        canUseRealtimeWebSocket: boolean;
                        disabledReason?: 'provider_not_supported' | 'api_key_required' | 'base_url_not_supported';
                    };
                };
                models: Array<{
                    id: string;
                    supportsPromptCache?: boolean;
                    supportsRealtimeWebSocket?: boolean;
                    apiFamily?:
                        | 'openai_compatible'
                        | 'kilo_gateway'
                        | 'provider_native'
                        | 'anthropic_messages'
                        | 'google_generativeai';
                    routedApiFamily?:
                        | 'openai_compatible'
                        | 'provider_native'
                        | 'anthropic_messages'
                        | 'google_generativeai';
                    toolProtocol?:
                        | 'openai_responses'
                        | 'openai_chat_completions'
                        | 'kilo_gateway'
                        | 'provider_native'
                        | 'anthropic_messages'
                        | 'google_generativeai';
                    providerSettings?: Record<string, unknown>;
                }>;
            }>;
            defaults: { providerId: string; modelId: string };
            specialistDefaults: Array<{
                topLevelTab: 'agent' | 'orchestrator';
                modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
                providerId: string;
                modelId: string;
            }>;
        };
        threadTags: Array<{ threadId: string; tagId: string }>;
        workspacePreferences: Array<{
            preferredVcs?: 'auto' | 'jj' | 'git';
            preferredPackageManager?: 'auto' | 'pnpm' | 'npm' | 'yarn' | 'bun';
        }>;
    }>();
    expectTypeOf<AppRouterOutputs['runtime']['inspectWorkspaceEnvironment']>().toExtend<{
        snapshot: {
            platform: 'win32' | 'darwin' | 'linux';
            shellFamily: 'powershell' | 'posix_sh';
            effectivePreferences: {
                vcs: {
                    family: 'jj' | 'git' | 'unknown';
                    source: 'detected' | 'override';
                    requestedOverride: 'auto' | 'jj' | 'git';
                    available: boolean;
                    mismatch: boolean;
                };
                packageManager: {
                    family: 'pnpm' | 'npm' | 'yarn' | 'bun' | 'unknown';
                    source: 'detected' | 'override';
                    requestedOverride: 'auto' | 'pnpm' | 'npm' | 'yarn' | 'bun';
                    available: boolean;
                    mismatch: boolean;
                };
            };
        };
    }>();
    expectTypeOf<AppRouterOutputs['registry']['listResolved']>().toExtend<{
        paths: { globalAssetsRoot: string; workspaceAssetsRoot?: string };
        resolved: {
            modes: Array<{ modeKey: string; scope: 'system' | 'global' | 'workspace' | 'session' }>;
            rulesets: Array<{ assetKey: string }>;
            skillfiles: Array<{ assetKey: string }>;
        };
    }>();
    expectTypeOf<AppRouterOutputs['registry']['searchSkills']>().toExtend<{
        skillfiles: Array<{ name: string; tags?: string[] }>;
    }>();
    expectTypeOf<AppRouterOutputs['permission']['listPending']>().toExtend<{
        requests: Array<{
            commandText?: string;
            approvalCandidates?: Array<{ label: string; resource: string; detail?: string }>;
            selectedApprovalResource?: string;
        }>;
    }>();
});

