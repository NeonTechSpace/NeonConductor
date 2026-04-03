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
    }>();
    expectTypeOf<AppRouterInputs['conversation']['readToolArtifact']>().toExtend<{
        profileId: string;
        sessionId: string;
        messagePartId: string;
        startLine?: number;
        lineCount?: number;
    }>();
    expectTypeOf<AppRouterInputs['conversation']['searchToolArtifact']>().toExtend<{
        profileId: string;
        sessionId: string;
        messagePartId: string;
        query: string;
        caseSensitive?: boolean;
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
    expectTypeOf<AppRouterInputs['session']['branchFromMessageWithBranchWorkflow']>().toExtend<{
        profileId: string;
        sessionId: string;
        topLevelTab: 'chat' | 'agent' | 'orchestrator';
        modeKey: string;
        messageId: string;
        branchWorkflowId?: string;
    }>();
    expectTypeOf<AppRouterInputs['branchWorkflow']['list']>().toExtend<{
        profileId: string;
        workspaceFingerprint: string;
    }>();
    expectTypeOf<AppRouterInputs['branchWorkflow']['create']>().toExtend<{
        profileId: string;
        workspaceFingerprint: string;
        label: string;
        command: string;
        enabled: boolean;
    }>();
    expectTypeOf<AppRouterInputs['flow']['createDefinition']>().toExtend<{
        profileId: string;
        label: string;
        enabled: boolean;
        triggerKind: 'manual';
        steps: Array<{ kind: 'legacy_command' | 'mode_run' | 'workflow' | 'approval_gate' }>;
        description?: string;
    }>();
    expectTypeOf<AppRouterInputs['flow']['getInstance']>().toExtend<{
        profileId: string;
        flowInstanceId: string;
    }>();
    expectTypeOf<AppRouterInputs['flow']['listDefinitions']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<AppRouterInputs['flow']['getDefinition']>().toExtend<{
        profileId: string;
        flowDefinitionId: string;
    }>();
        expectTypeOf<AppRouterInputs['flow']['createDefinition']>().toExtend<{
            profileId: string;
            label: string;
            description?: string;
            enabled: boolean;
            triggerKind: 'manual';
            steps: Array<
                | { kind: 'legacy_command'; id: string; label: string; command: string }
                | {
                      kind: 'mode_run';
                      id: string;
                      label: string;
                      topLevelTab: 'chat' | 'agent' | 'orchestrator';
                      modeKey: string;
                      promptMarkdown: string;
                  }
                | {
                      kind: 'workflow';
                      id: string;
                      label: string;
                      workflowCapability: string;
                      promptMarkdown: string;
                      planningDepth?: 'simple' | 'advanced';
                      requireApprovedPlan?: boolean;
                      reuseExistingPlan?: boolean;
                  }
            | { kind: 'approval_gate'; id: string; label: string }
        >;
    }>();
        expectTypeOf<AppRouterInputs['flow']['updateDefinition']>().toExtend<{
            profileId: string;
            flowDefinitionId: string;
            label: string;
            description?: string;
            enabled: boolean;
            triggerKind: 'manual';
            steps: Array<
                | { kind: 'legacy_command'; id: string; label: string; command: string }
                | {
                      kind: 'mode_run';
                      id: string;
                      label: string;
                      topLevelTab: 'chat' | 'agent' | 'orchestrator';
                      modeKey: string;
                      promptMarkdown: string;
                  }
                | {
                      kind: 'workflow';
                      id: string;
                      label: string;
                      workflowCapability: string;
                      promptMarkdown: string;
                      planningDepth?: 'simple' | 'advanced';
                      requireApprovedPlan?: boolean;
                      reuseExistingPlan?: boolean;
                  }
            | { kind: 'approval_gate'; id: string; label: string }
        >;
    }>();
    expectTypeOf<AppRouterInputs['flow']['deleteDefinition']>().toExtend<{
        profileId: string;
        flowDefinitionId: string;
        confirm: boolean;
    }>();
    expectTypeOf<AppRouterInputs['flow']['listInstances']>().toExtend<{
        profileId: string;
    }>();
    expectTypeOf<AppRouterInputs['flow']['getInstance']>().toExtend<{
        profileId: string;
        flowInstanceId: string;
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
    expectTypeOf<AppRouterOutputs['flow']['listDefinitions']>().toExtend<{
        flowDefinitions: Array<{
            originKind: 'canonical' | 'branch_workflow_adapter';
            definition: {
                id: string;
                label: string;
            };
        }>;
    }>();
    expectTypeOf<AppRouterOutputs['flow']['getInstance']>().toExtend<
        | {
              found: false;
          }
        | {
              found: true;
              flowInstance: {
                  originKind: 'canonical' | 'branch_workflow_adapter';
                  instance: {
                      id: string;
                      status: 'queued' | 'running' | 'approval_required' | 'failed' | 'completed' | 'cancelled';
                  };
                  definitionSnapshot: {
                      id: string;
                      steps: Array<{ kind: 'legacy_command' | 'mode_run' | 'workflow' | 'approval_gate' }>;
                  };
                  lifecycleEvents: Array<{
                      kind:
                          | 'flow.started'
                          | 'flow.step_started'
                          | 'flow.step_completed'
                          | 'flow.approval_required'
                          | 'flow.failed'
                          | 'flow.cancelled'
                          | 'flow.completed';
                  }>;
              };
          }
    >();
    expectTypeOf<AppRouterOutputs['flow']['listDefinitions']>().toExtend<{
        flowDefinitions: Array<{
            definition: { id: string; label: string };
            originKind: 'canonical' | 'branch_workflow_adapter';
        }>;
    }>();
    expectTypeOf<AppRouterOutputs['flow']['getDefinition']>().toExtend<
        | { found: false }
        | {
              found: true;
              flowDefinition: {
                  definition: { id: string; label: string };
                  originKind: 'canonical' | 'branch_workflow_adapter';
              };
          }
    >();
    expectTypeOf<AppRouterOutputs['flow']['listInstances']>().toExtend<{
        flowInstances: Array<{
            instance: { id: string; flowDefinitionId: string; status: 'queued' | 'running' | 'approval_required' | 'failed' | 'completed' | 'cancelled' };
            definitionSnapshot: { id: string; label: string };
            lifecycleEvents: Array<{ kind: string; flowDefinitionId: string; flowInstanceId: string }>;
            originKind: 'canonical' | 'branch_workflow_adapter';
        }>;
    }>();
    expectTypeOf<AppRouterOutputs['flow']['getInstance']>().toExtend<
        | { found: false }
        | {
              found: true;
              flowInstance: {
                  instance: { id: string; flowDefinitionId: string; status: 'queued' | 'running' | 'approval_required' | 'failed' | 'completed' | 'cancelled' };
                  definitionSnapshot: { id: string; label: string };
                  lifecycleEvents: Array<{ kind: string; flowDefinitionId: string; flowInstanceId: string }>;
                  originKind: 'canonical' | 'branch_workflow_adapter';
              };
          }
    >();
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
    expectTypeOf<AppRouterOutputs['conversation']['readToolArtifact']>().toExtend<
        | {
              found: false;
          }
        | {
              found: true;
              artifact: {
                  messagePartId: string;
                  toolName: string;
                  artifactKind: 'command_output' | 'file_read' | 'directory_listing' | 'search_results';
                  contentType: string;
                  totalBytes: number;
                  totalLines: number;
                  previewStrategy: 'head_tail' | 'head_only' | 'bounded_list';
                  metadata: Record<string, unknown>;
                  startLine: number;
                  lineCount: number;
                  lines: Array<{
                      lineNumber: number;
                      text: string;
                  }>;
                  hasPrevious: boolean;
                  hasNext: boolean;
              };
          }
    >();
    expectTypeOf<AppRouterOutputs['conversation']['searchToolArtifact']>().toExtend<{
        found: boolean;
        matches: Array<{
            lineNumber: number;
            lineText: string;
            matchStart: number;
            matchEnd: number;
        }>;
        truncated: boolean;
    }>();

    expect(true).toBe(true);
});

