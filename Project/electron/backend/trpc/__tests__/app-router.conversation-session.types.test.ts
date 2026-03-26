import { expect, expectTypeOf, test } from 'vitest';

import type { AppRouterInputs, AppRouterOutputs } from '@/app/backend/trpc/__tests__/app-router.types.shared';

test('AppRouter exposes conversation and session procedure contracts to clients', () => {
    expectTypeOf<AppRouterInputs['session']['create']>().toExtend<{
        profileId: string;
        threadId: string;
        kind: 'local' | 'sandbox' | 'cloud';
    }>();

    expectTypeOf<AppRouterInputs['conversation']['listBuckets']>().toExtend<{
        profileId: string;
    }>();

    expectTypeOf<AppRouterInputs['conversation']['listThreads']>().toExtend<{
        profileId: string;
        activeTab?: 'chat' | 'agent' | 'orchestrator';
        showAllModes?: boolean;
        groupView?: 'workspace' | 'branch';
        scope?: 'detached' | 'workspace';
        workspaceFingerprint?: string;
        sort?: 'latest' | 'alphabetical';
    }>();

    expectTypeOf<AppRouterInputs['conversation']['createThread']>().toExtend<{
        profileId: string;
        topLevelTab?: 'chat' | 'agent' | 'orchestrator';
        scope: 'detached' | 'workspace';
        workspacePath?: string;
        title: string;
    }>();
    expectTypeOf<AppRouterInputs['conversation']['getEditPreference']>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterInputs['conversation']['setEditPreference']>().toExtend<{
        profileId: string;
        value: 'ask' | 'truncate' | 'branch';
    }>();
    expectTypeOf<AppRouterInputs['conversation']['getThreadTitlePreference']>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterInputs['conversation']['setThreadTitlePreference']>().toExtend<{
        profileId: string;
        mode: 'template' | 'ai_optional';
        aiModel?: string;
    }>();

    expectTypeOf<AppRouterInputs['session']['startRun']>().toExtend<{
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
                family: 'auto' | 'openai_responses' | 'openai_chat_completions';
            };
        };
        providerId?: string;
        modelId?: string;
    }>();
    expectTypeOf<Extract<AppRouterOutputs['session']['startRun'], { accepted: false }>>().toExtend<{
        accepted: false;
        reason: 'not_found' | 'already_running' | 'rejected';
        message?: string;
    }>();
    expectTypeOf<AppRouterInputs['session']['revert']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
    }>();
    expectTypeOf<AppRouterInputs['session']['edit']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        messageId: string;
        replacementText: string;
        editMode: 'truncate' | 'branch';
        autoStartRun?: boolean;
    }>();
    expectTypeOf<AppRouterInputs['session']['branchFromMessage']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        messageId: string;
    }>();
    expectTypeOf<AppRouterInputs['session']['branchFromMessageWithWorkflow']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        messageId: string;
        workflowId?: string;
    }>();
    expectTypeOf<AppRouterInputs['workflow']['list']>().toExtend<{
        profileId: string;
        workspaceFingerprint: string;
    }>();
    expectTypeOf<AppRouterInputs['workflow']['create']>().toExtend<{
        profileId: string;
        workspaceFingerprint: string;
        label: string;
        command: string;
        enabled: boolean;
    }>();
    expectTypeOf<AppRouterInputs['session']['getAttachedSkills']>().toExtend<{
        profileId: string;
        sessionId: string;
    }>();
    expectTypeOf<AppRouterInputs['session']['setAttachedSkills']>().toExtend<{
        profileId: string;
        sessionId: string;
        assetKeys: string[];
    }>();
    expectTypeOf<AppRouterInputs['session']['getMessageMedia']>().toExtend<{
        profileId: string;
        mediaId: string;
    }>();
    expectTypeOf<AppRouterOutputs['session']['getMessageMedia']>().toExtend<{
        found: boolean;
        mimeType?: 'image/jpeg' | 'image/png' | 'image/webp';
        bytes?: {
            readonly length: number;
            readonly byteLength: number;
            readonly buffer: { readonly byteLength: number };
            [index: number]: number;
        };
        byteSize?: number;
        width?: number;
        height?: number;
        sha256?: string;
    }>();
    expectTypeOf<AppRouterInputs['diff']['listByRun']>().toExtend<{
        profileId: string;
        runId: string;
    }>();
    expectTypeOf<AppRouterInputs['diff']['getFilePatch']>().toExtend<{
        profileId: string;
        diffId: string;
        path: string;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['create']>().toExtend<{
        profileId: string;
        runId: string;
        milestoneTitle: string;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['list']>().toExtend<{
        profileId: string;
        sessionId: string;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['forceCompact']>().toExtend<{
        profileId: string;
        sessionId: string;
        confirm: boolean;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['promoteToMilestone']>().toExtend<{
        profileId: string;
        checkpointId: string;
        milestoneTitle: string;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['renameMilestone']>().toExtend<{
        profileId: string;
        checkpointId: string;
        milestoneTitle: string;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['deleteMilestone']>().toExtend<{
        profileId: string;
        checkpointId: string;
        confirm: boolean;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['previewCleanup']>().toExtend<{
        profileId: string;
        sessionId: string;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['applyCleanup']>().toExtend<{
        profileId: string;
        sessionId: string;
        confirm: boolean;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['rollback']>().toExtend<{
        profileId: string;
        checkpointId: string;
        confirm: boolean;
    }>();
    expectTypeOf<AppRouterInputs['checkpoint']['revertChangeset']>().toExtend<{
        profileId: string;
        checkpointId: string;
        confirm: boolean;
    }>();

    expectTypeOf<AppRouterInputs['session']['list']>().toExtend<{ profileId: string }>();
    expectTypeOf<AppRouterOutputs['session']['getAttachedSkills']>().toExtend<{
        sessionId: string;
        skillfiles: Array<{ assetKey: string; name: string }>;
        missingAssetKeys?: string[];
    }>();
    expectTypeOf<AppRouterOutputs['session']['setAttachedSkills']>().toExtend<{
        sessionId: string;
        skillfiles: Array<{ assetKey: string; name: string }>;
        missingAssetKeys?: string[];
    }>();
    expectTypeOf<AppRouterOutputs['diff']['listByRun']>().toExtend<{
        diffs: Array<{
            artifact: { kind: 'git'; files: Array<{ path: string }> } | { kind: 'unsupported'; detail: string };
        }>;
        overview?:
            | {
                  kind: 'git';
                  fileCount: number;
                  statusCounts: { added: number };
                  highlightedFiles: Array<{ path: string }>;
              }
            | { kind: 'unsupported'; detail: string };
    }>();
    expectTypeOf<AppRouterOutputs['checkpoint']['list']>().toExtend<{
        checkpoints: Array<{
            id: string;
            sessionId: string;
            threadId: string;
            topLevelTab: 'chat' | 'agent' | 'orchestrator';
            modeKey: string;
            summary: string;
            executionTargetKey: string;
            executionTargetKind: 'workspace' | 'sandbox';
            executionTargetLabel: string;
            createdByKind: 'system' | 'user';
            checkpointKind: 'auto' | 'safety' | 'named';
            snapshotFileCount: number;
            diffId?: string;
        }>;
        storage: {
            looseReferencedBlobCount: number;
            looseReferencedByteSize: number;
            packedReferencedBlobCount: number;
            packedReferencedByteSize: number;
            totalReferencedBlobCount: number;
            totalReferencedByteSize: number;
            lastCompactionRun?: {
                id: string;
                triggerKind: 'automatic' | 'manual';
                status: 'success' | 'failed' | 'noop';
            };
        };
    }>();

    expect(true).toBe(true);
});

