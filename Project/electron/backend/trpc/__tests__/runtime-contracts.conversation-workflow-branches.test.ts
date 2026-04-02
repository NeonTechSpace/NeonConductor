import { describe, expect, it, vi } from 'vitest';

import { permissionStore, threadStore } from '@/app/backend/persistence/stores';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import {
    runtimeContractProfileId,
    registerRuntimeContractHooks,
    createCaller,
    createSessionInScope,
    defaultRuntimeOptions,
    waitForRunStatus,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

describe('runtime contracts: conversation and runs', () => {
    const profileId = runtimeContractProfileId;
    it('creates an isolated fresh sandbox target for workflow-capable branches even with no workflow selected', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'assistant response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 8,
                            completion_tokens: 12,
                            total_tokens: 20,
                        },
                    }),
                })
            )
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-branch-workflow-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_branch_workflow_noop',
            title: 'Workflow Branch Agent Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const workspaceFingerprint = 'ws_branch_workflow_noop';

        const started = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Create branchable history',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(started.accepted).toBe(true);
        if (!started.accepted) {
            throw new Error('Expected source run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const sourceThreadRecord = await threadStore.getBySessionId(profileId, created.session.id);
        expect(sourceThreadRecord?.thread.sandboxId).toBeDefined();
        const sourceMessages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
        });
        const branchMessage = sourceMessages.messages.filter((message) => message.role === 'assistant').at(-1);
        if (!branchMessage) {
            throw new Error('Expected assistant message for branch target.');
        }

        const branched = await caller.session.branchFromMessageWithBranchWorkflow({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: branchMessage.id,
        });
        expect(branched.branched).toBe(true);
        if (!branched.branched) {
            throw new Error(`Expected workflow branch to succeed, received "${branched.reason}".`);
        }
        expect(branched.branchWorkflowExecution.status).toBe('not_requested');
        expect(branched.thread.sandboxId).toBeDefined();
        expect(branched.thread.sandboxId).not.toBe(sourceThreadRecord?.thread.sandboxId);
    });

    it('creates a permission request for branch workflows that need shell approval and keeps the branch', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'assistant response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 8,
                            completion_tokens: 12,
                            total_tokens: 20,
                        },
                    }),
                })
            )
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-branch-workflow-approval-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_branch_workflow_approval',
            title: 'Workflow Branch Approval Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const workspaceFingerprint = 'ws_branch_workflow_approval';

        const run = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Need a workflow branch',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(run.accepted).toBe(true);
        if (!run.accepted) {
            throw new Error('Expected source run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const branchWorkflow = await caller.branchWorkflow.create({
            profileId,
            workspaceFingerprint,
            label: 'Install deps',
            command: 'pnpm install',
            enabled: true,
        });
        const messages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
        });
        const branchMessage = messages.messages.filter((message) => message.role === 'assistant').at(-1);
        if (!branchMessage) {
            throw new Error('Expected assistant message for branch target.');
        }

        const branched = await caller.session.branchFromMessageWithBranchWorkflow({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: branchMessage.id,
            branchWorkflowId: branchWorkflow.branchWorkflow.id,
        });
        expect(branched.branched).toBe(true);
        if (!branched.branched) {
            throw new Error(`Expected workflow branch to succeed, received "${branched.reason}".`);
        }
        expect(branched.branchWorkflowExecution.status).toBe('approval_required');
        if (branched.branchWorkflowExecution.status !== 'approval_required') {
            throw new Error('Expected workflow approval requirement.');
        }
        const permissionRequestId = branched.branchWorkflowExecution.requestId;
        const pendingPermissions = await caller.permission.listPending();
        expect(pendingPermissions.requests.some((request) => request.id === permissionRequestId)).toBe(true);

        const branchStatus = await caller.session.status({
            profileId,
            sessionId: branched.sessionId,
        });
        expect(branchStatus.found).toBe(true);
    });

    it('keeps the new branch and leaves source state untouched when workflow execution fails', async () => {
        const caller = createCaller();
        vi.stubGlobal(
            'fetch',
            vi.fn(() =>
                Promise.resolve({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    json: () => ({
                        choices: [
                            {
                                message: {
                                    content: 'assistant response',
                                },
                            },
                        ],
                        usage: {
                            prompt_tokens: 8,
                            completion_tokens: 12,
                            total_tokens: 20,
                        },
                    }),
                })
            )
        );
        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-branch-workflow-failure-key',
        });
        expect(configured.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_branch_workflow_failure',
            title: 'Workflow Branch Failure Thread',
            kind: 'local',
            topLevelTab: 'agent',
        });
        const workspaceFingerprint = 'ws_branch_workflow_failure';

        const run = await caller.session.startRun({
            profileId,
            sessionId: created.session.id,
            prompt: 'Run a workflow after branching',
            topLevelTab: 'agent',
            modeKey: 'code',
            workspaceFingerprint,
            runtimeOptions: defaultRuntimeOptions,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(run.accepted).toBe(true);
        if (!run.accepted) {
            throw new Error('Expected source run to start.');
        }
        await waitForRunStatus(caller, profileId, created.session.id, 'completed');

        const sourceThreadRecord = await threadStore.getBySessionId(profileId, created.session.id);
        const sourceSandboxId = sourceThreadRecord?.thread.sandboxId;
        const sourceRuns = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });

        const shellApprovalContext = buildShellApprovalContext('definitely_missing_workflow_command');
        const workspaceResource = shellApprovalContext.approvalCandidates[0]?.resource;
        if (!workspaceResource) {
            throw new Error('Expected shell approval prefix resource.');
        }
        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint,
            resource: workspaceResource,
            policy: 'allow',
        });

        const branchWorkflow = await caller.branchWorkflow.create({
            profileId,
            workspaceFingerprint,
            label: 'Broken workflow',
            command: 'definitely_missing_workflow_command',
            enabled: true,
        });
        const messages = await caller.session.listMessages({
            profileId,
            sessionId: created.session.id,
        });
        const branchMessage = messages.messages.filter((message) => message.role === 'assistant').at(-1);
        if (!branchMessage) {
            throw new Error('Expected assistant message for branch target.');
        }

        const branched = await caller.session.branchFromMessageWithBranchWorkflow({
            profileId,
            sessionId: created.session.id,
            topLevelTab: 'agent',
            modeKey: 'code',
            messageId: branchMessage.id,
            branchWorkflowId: branchWorkflow.branchWorkflow.id,
        });
        expect(branched.branched).toBe(true);
        if (!branched.branched) {
            throw new Error(`Expected workflow branch to succeed, received "${branched.reason}".`);
        }
        expect(branched.branchWorkflowExecution.status).toBe('failed');
        expect(branched.sessionId).not.toBe(created.session.id);

        const sourceRunsAfterBranch = await caller.session.listRuns({
            profileId,
            sessionId: created.session.id,
        });
        expect(sourceRunsAfterBranch.runs.map((item) => item.id)).toEqual(sourceRuns.runs.map((item) => item.id));

        const sourceThreadAfterBranch = await threadStore.getBySessionId(profileId, created.session.id);
        expect(sourceThreadAfterBranch?.thread.sandboxId).toBe(sourceSandboxId);

        const branchStatus = await caller.session.status({
            profileId,
            sessionId: branched.sessionId,
        });
        expect(branchStatus.found).toBe(true);
        expect((await permissionStore.listPending()).length).toBe(0);
    });
});
