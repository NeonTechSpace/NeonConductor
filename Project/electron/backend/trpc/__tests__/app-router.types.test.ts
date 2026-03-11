import { expect, expectTypeOf, test } from 'vitest';

import type { AppRouter } from '@/app/backend/trpc/router';
import type { BootStatusSnapshot } from '@/app/shared/splashContract';

import type { inferRouterInputs, inferRouterOutputs } from '@trpc/server';

const OPENAI_PROCEDURE_PREFIX = 'getOpenAI';
const OPENAI_USAGE_PROCEDURE = `${OPENAI_PROCEDURE_PREFIX}SubscriptionUsage` as const;
const OPENAI_RATE_LIMITS_PROCEDURE = `${OPENAI_PROCEDURE_PREFIX}SubscriptionRateLimits` as const;

test('AppRouter exposes runtime procedure contracts to clients', () => {
    expect(OPENAI_USAGE_PROCEDURE.startsWith(OPENAI_PROCEDURE_PREFIX)).toBe(true);
    expect(OPENAI_RATE_LIMITS_PROCEDURE.startsWith(OPENAI_PROCEDURE_PREFIX)).toBe(true);

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
        activeTab?: 'chat' | 'agent' | 'orchestrator';
        showAllModes?: boolean;
        groupView?: 'workspace' | 'branch';
        scope?: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        sort?: 'latest' | 'alphabetical';
    }>();

    expectTypeOf<Inputs['conversation']['createThread']>().toExtend<{
        profileId: string;
        topLevelTab?: 'chat' | 'agent' | 'orchestrator';
        scope: 'detached' | 'workspace';
        workspacePath?: string;
        title: string;
    }>();
    expectTypeOf<Inputs['conversation']['getEditPreference']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Inputs['conversation']['setEditPreference']>().toExtend<{
        profileId: string;
        value: 'ask' | 'truncate' | 'branch';
    }>();
    expectTypeOf<Inputs['conversation']['getThreadTitlePreference']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Inputs['conversation']['setThreadTitlePreference']>().toExtend<{
        profileId: string;
        mode: 'template' | 'ai_optional';
        aiModel?: string;
    }>();

    expectTypeOf<Inputs['session']['startRun']>().toExtend<{
        profileId: string;
        sessionId: string;
        prompt: string;
        attachments?: Array<{
            clientId: string;
            mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
            bytesBase64: string;
            width: number;
            height: number;
            sha256: string;
        }>;
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
        providerId?: string;
        modelId?: string;
    }>();
    expectTypeOf<Inputs['session']['revert']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
    }>();
    expectTypeOf<Inputs['session']['edit']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        messageId: string;
        replacementText: string;
        editMode: 'truncate' | 'branch';
        autoStartRun?: boolean;
    }>();
    expectTypeOf<Inputs['session']['getAttachedSkills']>().toExtend<{
        profileId: string;
        sessionId: string;
    }>();
    expectTypeOf<Inputs['session']['setAttachedSkills']>().toExtend<{
        profileId: string;
        sessionId: string;
        assetKeys: string[];
    }>();
    expectTypeOf<Inputs['session']['getMessageMedia']>().toExtend<{
        profileId: string;
        mediaId: string;
    }>();
    expectTypeOf<Outputs['session']['getMessageMedia']>().toExtend<{
        found: boolean;
        mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
        bytes?: {
            readonly length: number;
            readonly byteLength: number;
            readonly buffer: {
                readonly byteLength: number;
            };
            [index: number]: number;
        };
        byteSize?: number;
        width?: number;
        height?: number;
        sha256?: string;
    }>();
    expectTypeOf<Inputs['diff']['listByRun']>().toExtend<{
        profileId: string;
        runId: string;
    }>();
    expectTypeOf<Inputs['diff']['getFilePatch']>().toExtend<{
        profileId: string;
        diffId: string;
        path: string;
    }>();
    expectTypeOf<Inputs['checkpoint']['create']>().toExtend<{
        profileId: string;
        runId: string;
    }>();
    expectTypeOf<Inputs['checkpoint']['list']>().toExtend<{
        profileId: string;
        sessionId: string;
    }>();
    expectTypeOf<Inputs['checkpoint']['rollback']>().toExtend<{
        profileId: string;
        checkpointId: string;
        confirm: boolean;
    }>();

    expectTypeOf<Inputs['mode']['list']>().toExtend<{
        profileId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        workspaceFingerprint?: string;
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
    expectTypeOf<Inputs['provider']['getDefaults']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Inputs['provider'][typeof OPENAI_USAGE_PROCEDURE]>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Inputs['provider'][typeof OPENAI_RATE_LIMITS_PROCEDURE]>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Outputs['provider']['listModels']>().toExtend<{
        models: Array<{
            id: string;
            providerId: string;
            supportsTools: boolean;
            supportsReasoning: boolean;
            supportsVision: boolean;
            inputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
            outputModalities: Array<'text' | 'audio' | 'image' | 'video' | 'pdf'>;
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
    }>();
    expectTypeOf<Outputs['provider'][typeof OPENAI_USAGE_PROCEDURE]>().toExtend<{
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
    expectTypeOf<Outputs['provider'][typeof OPENAI_RATE_LIMITS_PROCEDURE]>().toExtend<{
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
        providerId: string;
        apiKey: string;
    }>();

    expectTypeOf<Inputs['provider']['startAuth']>().toExtend<{
        profileId: string;
        providerId: string;
        method: 'api_key' | 'device_code' | 'oauth_pkce' | 'oauth_device';
    }>();

    expectTypeOf<Inputs['provider']['pollAuth']>().toExtend<{
        profileId: string;
        providerId: string;
        flowId: string;
    }>();

    expectTypeOf<Inputs['provider']['completeAuth']>().toExtend<{
        profileId: string;
        providerId: string;
        flowId: string;
        code?: string;
    }>();

    expectTypeOf<Inputs['provider']['setOrganization']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        organizationId?: string | null;
    }>();
    expectTypeOf<Outputs['provider']['getAccountContext']>().toExtend<{
        profileId: string;
        providerId: string;
        authState: {
            authState: string;
            tokenExpiresAt?: string;
        };
        kiloAccountContext?: {
            balance?: {
                amount: number;
                currency: string;
                updatedAt: string;
            };
        };
    }>();
    expectTypeOf<Inputs['provider']['getEndpointProfile']>().toExtend<{
        profileId: string;
        providerId: string;
    }>();
    expectTypeOf<Inputs['provider']['setEndpointProfile']>().toExtend<{
        profileId: string;
        providerId: string;
        value: string;
    }>();
    expectTypeOf<Inputs['provider']['getModelRoutingPreference']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        modelId: string;
    }>();
    expectTypeOf<Inputs['provider']['setModelRoutingPreference']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        modelId: string;
        routingMode: 'dynamic' | 'pinned';
        sort?: 'default' | 'price' | 'throughput' | 'latency';
        pinnedProviderId?: string;
    }>();
    expectTypeOf<Inputs['provider']['listModelProviders']>().toExtend<{
        profileId: string;
        providerId: 'kilo';
        modelId: string;
    }>();

    expectTypeOf<Inputs['permission']['request']>().toExtend<{
        policy: 'ask' | 'allow' | 'deny';
        resource: string;
        commandText?: string;
        approvalCandidates?: Array<{
            label: string;
            resource: string;
            detail?: string;
        }>;
    }>();
    expectTypeOf<Inputs['permission']['resolve']>().toExtend<{
        profileId: string;
        requestId: string;
        resolution: 'deny' | 'allow_once' | 'allow_profile' | 'allow_workspace';
        selectedApprovalResource?: string;
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
        providerId?: string;
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

    expectTypeOf<Inputs['runtime']['getDiagnosticSnapshot']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Inputs['runtime']['getShellBootstrap']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<Inputs['system']['reportBootStatus']>().toExtend<BootStatusSnapshot>();
    expectTypeOf<Outputs['system']['reportBootStatus']>().toExtend<{
        accepted: boolean;
    }>();
    expectTypeOf<Inputs['system']['openPath']>().toExtend<{
        path: string;
    }>();
    expectTypeOf<Inputs['system']['openExternalUrl']>().toExtend<{
        url: string;
    }>();
    expectTypeOf<Inputs['registry']['refresh']>().toExtend<{
        profileId: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<Inputs['registry']['listResolved']>().toExtend<{
        profileId: string;
        workspaceFingerprint?: string;
    }>();
    expectTypeOf<Inputs['registry']['searchSkills']>().toExtend<{
        profileId: string;
        query?: string;
        workspaceFingerprint?: string;
    }>();

    expectTypeOf<Outputs['runtime']['getDiagnosticSnapshot']>().toExtend<{
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
    expectTypeOf<Outputs['runtime']['getShellBootstrap']>().toExtend<{
        lastSequence: number;
        threadTags: Array<{
            threadId: string;
            tagId: string;
        }>;
        defaults: {
            providerId: string;
            modelId: string;
        };
    }>();
    expectTypeOf<Outputs['registry']['listResolved']>().toExtend<{
        paths: {
            globalAssetsRoot: string;
            workspaceAssetsRoot?: string;
        };
        resolved: {
            modes: Array<{
                modeKey: string;
                scope: 'system' | 'global' | 'workspace' | 'session';
            }>;
            rulesets: Array<{
                assetKey: string;
            }>;
            skillfiles: Array<{
                assetKey: string;
            }>;
        };
    }>();
    expectTypeOf<Outputs['registry']['searchSkills']>().toExtend<{
        skillfiles: Array<{
            name: string;
            tags?: string[];
        }>;
    }>();
    expectTypeOf<Outputs['session']['getAttachedSkills']>().toExtend<{
        sessionId: string;
        skillfiles: Array<{
            assetKey: string;
            name: string;
        }>;
        missingAssetKeys?: string[];
    }>();
    expectTypeOf<Outputs['session']['setAttachedSkills']>().toExtend<{
        sessionId: string;
        skillfiles: Array<{
            assetKey: string;
            name: string;
        }>;
        missingAssetKeys?: string[];
    }>();
    expectTypeOf<Outputs['permission']['listPending']>().toExtend<{
        requests: Array<{
            commandText?: string;
            approvalCandidates?: Array<{
                label: string;
                resource: string;
                detail?: string;
            }>;
            selectedApprovalResource?: string;
        }>;
    }>();
    expectTypeOf<Outputs['diff']['listByRun']>().toExtend<{
        diffs: Array<{
            artifact:
                | {
                      kind: 'git';
                      files: Array<{
                          path: string;
                      }>;
                  }
                | {
                      kind: 'unsupported';
                      detail: string;
                  };
        }>;
        overview?:
            | {
                  kind: 'git';
                  fileCount: number;
                  statusCounts: {
                      added: number;
                  };
                  highlightedFiles: Array<{
                      path: string;
                  }>;
              }
            | {
                  kind: 'unsupported';
                  detail: string;
              };
    }>();
    expectTypeOf<Outputs['checkpoint']['list']>().toExtend<{
        checkpoints: Array<{
            id: string;
            diffId: string;
        }>;
    }>();

    expect(true).toBe(true);
});
