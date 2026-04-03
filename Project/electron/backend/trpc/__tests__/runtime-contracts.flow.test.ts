import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import {
    createCaller,
    createSessionInScope,
    type EntityId,
    registerRuntimeContractHooks,
    runtimeContractProfileId,
} from '@/app/backend/trpc/__tests__/runtime-contracts.shared';

registerRuntimeContractHooks();

async function seedWorkspaceRoot(profileId: string, workspaceFingerprint: string): Promise<string> {
    const workspacePath = mkdtempSync(join(tmpdir(), `${workspaceFingerprint}-`));
    const now = new Date().toISOString();

    const { getPersistence } = await import('@/app/backend/trpc/__tests__/runtime-contracts.shared');
    getPersistence()
        .sqlite.prepare(
            `
                INSERT OR IGNORE INTO workspace_roots
                    (fingerprint, profile_id, absolute_path, path_key, label, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            `
        )
        .run(
            workspaceFingerprint,
            profileId,
            workspacePath,
            process.platform === 'win32' ? workspacePath.toLowerCase() : workspacePath,
            basename(workspacePath),
            now,
            now
        );

    return workspacePath;
}

async function waitForFlowInstanceStatus(input: {
    caller: ReturnType<typeof createCaller>;
    profileId: string;
    flowInstanceId: string;
    expectedStatus: 'approval_required' | 'running' | 'failed' | 'completed' | 'cancelled';
}) {
    for (let attempt = 0; attempt < 120; attempt += 1) {
        const found = await input.caller.flow.getInstance({
            profileId: input.profileId,
            flowInstanceId: input.flowInstanceId,
        });
        if (found.found && found.flowInstance.instance.status === input.expectedStatus) {
            return found.flowInstance;
        }

        await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(
        `Timed out waiting for flow instance "${input.flowInstanceId}" to reach status "${input.expectedStatus}".`
    );
}

async function waitForFlowInstanceByDefinition(input: {
    profileId: string;
    flowDefinitionId: string;
    expectedStatus: 'running' | 'approval_required';
}) {
    const { getPersistence } = await import('@/app/backend/trpc/__tests__/runtime-contracts.shared');

    for (let attempt = 0; attempt < 120; attempt += 1) {
        const flowInstance = await getPersistence().db
            .selectFrom('flow_instances')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('flow_definition_id', '=', input.flowDefinitionId)
            .orderBy('created_at', 'desc')
            .executeTakeFirst();
        if (flowInstance && flowInstance.status === input.expectedStatus) {
            return flowInstance;
        }

        await new Promise((resolve) => setTimeout(resolve, 25));
    }

    throw new Error(
        `Timed out waiting for a flow instance from "${input.flowDefinitionId}" to reach status "${input.expectedStatus}".`
    );
}

async function answerRequiredPlanQuestions(input: {
    caller: ReturnType<typeof createCaller>;
    profileId: string;
    planId: EntityId<'plan'>;
}) {
    const found = await input.caller.plan.get({
        profileId: input.profileId,
        planId: input.planId,
    });
    if (!found.found) {
        throw new Error(`Expected plan "${input.planId}" to exist.`);
    }

    let latestPlan = found.plan;
    for (const question of latestPlan.questions.filter((candidate) => candidate.required && !candidate.answer)) {
        const answered = await input.caller.plan.answerQuestion({
            profileId: input.profileId,
            planId: input.planId,
            questionId: question.id,
            answer: `Answer for ${question.id}.`,
        });
        if (!answered.found) {
            throw new Error(`Expected question "${question.id}" to be answerable.`);
        }

        latestPlan = answered.plan;
    }

    return latestPlan;
}

function stubOpenAiCompletionFetch(content: string) {
    vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
            ok: true,
            status: 200,
            statusText: 'OK',
            json: () => ({
                choices: [
                    {
                        message: {
                            content,
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
    );
}

describe('runtime contracts: flow', () => {
    const profileId = runtimeContractProfileId;

    it('creates, updates, lists, gets, and deletes canonical flow definitions', async () => {
        const caller = createCaller();

        const created = await caller.flow.createDefinition({
            profileId,
            label: 'Ship flow',
            description: 'Release flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'approval_gate',
                    id: 'step_gate',
                    label: 'Approve',
                },
            ],
        });
        expect(created.flowDefinition.originKind).toBe('canonical');

        const listed = await caller.flow.listDefinitions({ profileId });
        expect(listed.flowDefinitions.map((flowDefinition) => flowDefinition.definition.id)).toContain(
            created.flowDefinition.definition.id
        );

        const found = await caller.flow.getDefinition({
            profileId,
            flowDefinitionId: created.flowDefinition.definition.id,
        });
        expect(found.found).toBe(true);
        if (!found.found) {
            throw new Error('Expected canonical flow definition to be found.');
        }
        expect(found.flowDefinition.definition.label).toBe('Ship flow');

        const updated = await caller.flow.updateDefinition({
            profileId,
            flowDefinitionId: created.flowDefinition.definition.id,
            label: 'Ship flow updated',
            enabled: false,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run',
                    command: 'pnpm test',
                },
            ],
        });
        expect(updated.updated).toBe(true);
        if (!updated.updated) {
            throw new Error('Expected canonical flow definition to update.');
        }
        expect(updated.flowDefinition.definition.label).toBe('Ship flow updated');

        const deleted = await caller.flow.deleteDefinition({
            profileId,
            flowDefinitionId: created.flowDefinition.definition.id,
            confirm: true,
        });
        expect(deleted.deleted).toBe(true);
    });

    it('lists and reads persisted flow instances with lifecycle history', async () => {
        const caller = createCaller();
        const created = await caller.flow.createDefinition({
            profileId,
            label: 'Inspect flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run',
                    command: 'pnpm test',
                },
            ],
        });

        const directStore = await import('@/app/backend/persistence/stores/runtime/flowStore');
        const persistedInstance = await directStore.flowStore.createFlowInstance({
            profileId,
            flowDefinitionId: created.flowDefinition.definition.id,
            definitionSnapshot: created.flowDefinition.definition,
        });
        if (!persistedInstance) {
            throw new Error('Expected persisted flow instance.');
        }

        const runtimeStores = await import('@/app/backend/persistence/stores');
        await runtimeStores.runtimeEventStore.append({
            entityType: 'flow',
            domain: 'flow',
            operation: 'status',
            entityId: persistedInstance.instance.id,
            eventType: 'flow.completed',
            payload: {
                completedStepCount: 1,
                status: 'completed',
            },
        });
        await directStore.flowStore.updateFlowInstance({
            profileId,
            flowInstanceId: persistedInstance.instance.id,
            status: 'completed',
            currentStepIndex: 1,
            startedAt: '2026-04-02T10:00:00.000Z',
            finishedAt: '2026-04-02T10:01:00.000Z',
        });

        const listed = await caller.flow.listInstances({ profileId });
        expect(listed.flowInstances.map((flowInstance) => flowInstance.instance.id)).toContain(
            persistedInstance.instance.id
        );

        const found = await caller.flow.getInstance({
            profileId,
            flowInstanceId: persistedInstance.instance.id,
        });
        expect(found.found).toBe(true);
        if (!found.found) {
            throw new Error('Expected persisted flow instance to be found.');
        }
        expect(found.flowInstance.lifecycleEvents.at(-1)?.kind).toBe('flow.completed');
        expect(found.flowInstance.originKind).toBe('canonical');
    });

    it('starts approval-gated flows, resumes them, and projects execution-aware instance state', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'ws_flow_gate_resume';
        await seedWorkspaceRoot(profileId, workspaceFingerprint);
        const resumedCommand = 'node -e "process.exit(0)"';
        const resumedCommandResource = buildShellApprovalContext(resumedCommand).approvalCandidates[0]?.resource;
        if (!resumedCommandResource) {
            throw new Error('Expected shell approval prefix resource for approval-gated flow test.');
        }
        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint,
            resource: resumedCommandResource,
            policy: 'allow',
        });

        const created = await caller.flow.createDefinition({
            profileId,
            label: 'Approval flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'approval_gate',
                    id: 'step_gate',
                    label: 'Approve',
                },
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run',
                    command: resumedCommand,
                },
            ],
        });

        const started = await caller.flow.startInstance({
            profileId,
            flowDefinitionId: created.flowDefinition.definition.id,
            executionContext: {
                workspaceFingerprint,
            },
        });
        expect(started.found).toBe(true);
        if (!started.found) {
            throw new Error('Expected approval-gated flow instance to start.');
        }
        expect(started.flowInstance.instance.status).toBe('approval_required');
        expect(started.flowInstance.currentStep).toEqual({
            stepIndex: 0,
            step: {
                kind: 'approval_gate',
                id: 'step_gate',
                label: 'Approve',
            },
        });
        expect(started.flowInstance.awaitingApproval).toMatchObject({
            kind: 'flow_gate',
            stepIndex: 0,
            stepId: 'step_gate',
        });
        expect(started.flowInstance.availableActions).toEqual({
            canResume: true,
            canCancel: true,
            canRetry: false,
        });

        const resumed = await caller.flow.resumeInstance({
            profileId,
            flowInstanceId: started.flowInstance.instance.id,
            expectedStepIndex: 0,
            expectedStepId: 'step_gate',
        });
        expect(resumed.found).toBe(true);
        if (!resumed.found) {
            throw new Error('Expected approval-gated flow instance to resume.');
        }
        expect(resumed.flowInstance.instance.status).toBe('completed');
        expect(resumed.flowInstance.awaitingApproval).toBeUndefined();
        expect(resumed.flowInstance.executionContext).toEqual({
            workspaceFingerprint,
        });
        expect(resumed.flowInstance.lifecycleEvents.map((event) => event.kind)).toEqual([
            'flow.started',
            'flow.step_started',
            'flow.approval_required',
            'flow.step_completed',
            'flow.step_started',
            'flow.step_completed',
            'flow.completed',
        ]);
    });

    it('auto-resumes permission-blocked legacy-command flows after approval and persists permission provenance', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'ws_flow_permission_resume';
        await seedWorkspaceRoot(profileId, workspaceFingerprint);
        const command = 'node -e "process.exit(0)"';
        const commandResource = buildShellApprovalContext(command).approvalCandidates[0]?.resource;
        if (!commandResource) {
            throw new Error('Expected shell approval prefix resource for permission-resume test.');
        }

        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint,
            resource: commandResource,
            policy: 'ask',
        });

        const created = await caller.flow.createDefinition({
            profileId,
            label: 'Shell approval flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run',
                    command,
                },
            ],
        });

        const started = await caller.flow.startInstance({
            profileId,
            flowDefinitionId: created.flowDefinition.definition.id,
            executionContext: {
                workspaceFingerprint,
            },
        });
        expect(started.found).toBe(true);
        if (!started.found || !started.flowInstance.awaitingApproval?.permissionRequestId) {
            throw new Error('Expected permission-blocked flow instance.');
        }
        expect(started.flowInstance.instance.status).toBe('approval_required');
        expect(started.flowInstance.awaitingApproval).toMatchObject({
            kind: 'tool_permission',
            stepIndex: 0,
            stepId: 'step_run',
        });
        expect(started.flowInstance.availableActions).toEqual({
            canResume: false,
            canCancel: true,
            canRetry: false,
        });

        const permissionRequestId = started.flowInstance.awaitingApproval.permissionRequestId;
        const { getPersistence } = await import('@/app/backend/trpc/__tests__/runtime-contracts.shared');
        const permissionRow = await getPersistence().db
            .selectFrom('permissions')
            .selectAll()
            .where('id', '=', permissionRequestId)
            .executeTakeFirstOrThrow();
        expect(permissionRow.flow_instance_id).toBe(started.flowInstance.instance.id);
        expect(permissionRow.flow_step_index).toBe(0);
        expect(permissionRow.flow_step_id).toBe('step_run');

        const resolved = await caller.permission.resolve({
            profileId,
            requestId: permissionRequestId,
            resolution: 'allow_once',
        });
        expect(resolved.updated).toBe(true);

        const completed = await waitForFlowInstanceStatus({
            caller,
            profileId,
            flowInstanceId: started.flowInstance.instance.id,
            expectedStatus: 'completed',
        });
        expect(completed.awaitingApproval).toBeUndefined();
        expect(completed.instance.status).toBe('completed');
        expect(completed.lifecycleEvents.map((event) => event.kind)).toEqual([
            'flow.started',
            'flow.step_started',
            'flow.approval_required',
            'flow.step_completed',
            'flow.completed',
        ]);
    });

    it('marks permission-blocked flows failed when shell approval is denied', async () => {
        const caller = createCaller();
        const workspaceFingerprint = 'ws_flow_permission_deny';
        await seedWorkspaceRoot(profileId, workspaceFingerprint);
        const command = 'node -e "process.exit(0)"';
        const commandResource = buildShellApprovalContext(command).approvalCandidates[0]?.resource;
        if (!commandResource) {
            throw new Error('Expected shell approval prefix resource for permission-denial test.');
        }

        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint,
            resource: commandResource,
            policy: 'ask',
        });

        const created = await caller.flow.createDefinition({
            profileId,
            label: 'Denied approval flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run',
                    command,
                },
            ],
        });

        const started = await caller.flow.startInstance({
            profileId,
            flowDefinitionId: created.flowDefinition.definition.id,
            executionContext: {
                workspaceFingerprint,
            },
        });
        expect(started.found).toBe(true);
        if (!started.found || !started.flowInstance.awaitingApproval?.permissionRequestId) {
            throw new Error('Expected permission-blocked flow instance for denial test.');
        }

        const denied = await caller.permission.resolve({
            profileId,
            requestId: started.flowInstance.awaitingApproval.permissionRequestId,
            resolution: 'deny',
        });
        expect(denied.updated).toBe(true);

        const failed = await waitForFlowInstanceStatus({
            caller,
            profileId,
            flowInstanceId: started.flowInstance.instance.id,
            expectedStatus: 'failed',
        });
        expect(failed.lastErrorMessage).toContain('approval was denied');
        expect(failed.availableActions.canRetry).toBe(true);
    });

    it('executes mode-run steps through delegated child lanes and persists child provenance', async () => {
        const caller = createCaller();
        stubOpenAiCompletionFetch('Child mode completed.');

        const configured = await caller.provider.setApiKey({
            profileId,
            providerId: 'openai',
            apiKey: 'openai-test-key',
        });
        expect(configured.success).toBe(true);

        const defaultChanged = await caller.provider.setDefault({
            profileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });
        expect(defaultChanged.success).toBe(true);

        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_flow_mode_run',
            title: 'Flow Mode Root',
            kind: 'local',
            topLevelTab: 'chat',
        });

        const definition = await caller.flow.createDefinition({
            profileId,
            label: 'Mode-run flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'mode_run',
                    id: 'step_mode_run',
                    label: 'Run child chat mode',
                    topLevelTab: 'chat',
                    modeKey: 'chat',
                    promptMarkdown: 'Say hello from the child lane.',
                },
            ],
        });

        const started = await caller.flow.startInstance({
            profileId,
            flowDefinitionId: definition.flowDefinition.definition.id,
            executionContext: {
                sessionId: created.session.id,
                workspaceFingerprint: 'ws_flow_mode_run',
            },
        });
        expect(started.found).toBe(true);
        if (!started.found) {
            throw new Error('Expected mode-run flow instance to start.');
        }
        expect(started.flowInstance.instance.status).toBe('completed');
        expect(started.flowInstance.currentRunId).toMatch(/^run_/);
        expect(started.flowInstance.currentChildThreadId).toMatch(/^thr_/);
        expect(started.flowInstance.currentChildSessionId).toMatch(/^sess_/);

        const { getPersistence } = await import('@/app/backend/trpc/__tests__/runtime-contracts.shared');
        const childThread = await getPersistence()
            .db.selectFrom('threads')
            .selectAll()
            .where('id', '=', started.flowInstance.currentChildThreadId ?? 'thr_missing')
            .executeTakeFirst();
        const childSession = await getPersistence()
            .db.selectFrom('sessions')
            .selectAll()
            .where('id', '=', started.flowInstance.currentChildSessionId ?? 'sess_missing')
            .executeTakeFirst();
        expect(childThread?.delegated_from_flow_instance_id).toBe(started.flowInstance.instance.id);
        expect(childSession?.delegated_from_flow_instance_id).toBe(started.flowInstance.instance.id);
    });

    it('creates planning artifacts, waits on explicit plan checkpoints, and resumes after approval', async () => {
        const caller = createCaller();
        const created = await createSessionInScope(caller, profileId, {
            scope: 'workspace',
            workspaceFingerprint: 'ws_flow_plan_checkpoint',
            title: 'Flow Planning Root',
            kind: 'local',
            topLevelTab: 'agent',
        });

        const definition = await caller.flow.createDefinition({
            profileId,
            label: 'Planning checkpoint flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'workflow',
                    id: 'step_plan_workflow',
                    label: 'Create plan',
                    workflowCapability: 'planning',
                    promptMarkdown: 'Create a compact implementation plan.',
                    planningDepth: 'simple',
                    requireApprovedPlan: true,
                    reuseExistingPlan: true,
                },
            ],
        });

        const started = await caller.flow.startInstance({
            profileId,
            flowDefinitionId: definition.flowDefinition.definition.id,
            executionContext: {
                sessionId: created.session.id,
                workspaceFingerprint: 'ws_flow_plan_checkpoint',
            },
        });
        expect(started.found).toBe(true);
        if (!started.found || !started.flowInstance.awaitingApproval?.planId) {
            throw new Error('Expected planning workflow step to block on a linked plan checkpoint.');
        }
        expect(started.flowInstance.instance.status).toBe('approval_required');
        expect(started.flowInstance.awaitingApproval).toMatchObject({
            kind: 'plan_checkpoint',
            stepIndex: 0,
            stepId: 'step_plan_workflow',
            planId: started.flowInstance.currentPlanId,
            requiredPlanStatus: 'approved',
        });

        await expect(
            caller.flow.resumeInstance({
                profileId,
                flowInstanceId: started.flowInstance.instance.id,
                expectedStepIndex: 0,
                expectedStepId: 'step_plan_workflow',
                expectedPlanId: started.flowInstance.awaitingApproval.planId,
            })
        ).rejects.toThrow(/cannot resume until the linked plan is approved/i);

        const answeredPlan = await answerRequiredPlanQuestions({
            caller,
            profileId,
            planId: started.flowInstance.awaitingApproval.planId,
        });
        const revised = await caller.plan.revise({
            profileId,
            planId: answeredPlan.id,
            summaryMarkdown: '# Approved via Flow',
            items: [
                {
                    description: 'Complete the planning checkpoint.',
                },
            ],
        });
        expect(revised.found).toBe(true);
        if (!revised.found) {
            throw new Error('Expected flow-linked plan revision.');
        }

        const approved = await caller.plan.approve({
            profileId,
            planId: revised.plan.id,
            revisionId: revised.plan.currentRevisionId,
        });
        expect(approved.found).toBe(true);
        if (!approved.found) {
            throw new Error('Expected flow-linked plan approval.');
        }

        const resumed = await caller.flow.resumeInstance({
            profileId,
            flowInstanceId: started.flowInstance.instance.id,
            expectedStepIndex: 0,
            expectedStepId: 'step_plan_workflow',
            expectedPlanId: approved.plan.id,
        });
        expect(resumed.found).toBe(true);
        if (!resumed.found) {
            throw new Error('Expected plan-checkpoint flow to resume.');
        }
        expect(resumed.flowInstance.instance.status).toBe('completed');
        expect(resumed.flowInstance.currentPlanId).toBe(approved.plan.id);
        expect(resumed.flowInstance.currentPlanRevisionId).toBe(approved.plan.currentRevisionId);
        expect(resumed.flowInstance.awaitingApproval).toBeUndefined();
    });

    it('fails denied and unsupported flows, retries failed instances from immutable snapshots, and cancels running commands', async () => {
        const caller = createCaller();

        const denyWorkspaceFingerprint = 'ws_flow_retry_deny';
        await seedWorkspaceRoot(profileId, denyWorkspaceFingerprint);
        const deniedCommand = 'node -e "process.exit(0)"';
        const deniedCommandResource = buildShellApprovalContext(deniedCommand).approvalCandidates[0]?.resource;
        if (!deniedCommandResource) {
            throw new Error('Expected shell approval prefix resource for denied-flow test.');
        }
        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint: denyWorkspaceFingerprint,
            resource: deniedCommandResource,
            policy: 'deny',
        });

        const deniedDefinition = await caller.flow.createDefinition({
            profileId,
            label: 'Denied flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run',
                    command: deniedCommand,
                },
            ],
        });

        const deniedStart = await caller.flow.startInstance({
            profileId,
            flowDefinitionId: deniedDefinition.flowDefinition.definition.id,
            executionContext: {
                workspaceFingerprint: denyWorkspaceFingerprint,
            },
        });
        expect(deniedStart.found).toBe(true);
        if (!deniedStart.found) {
            throw new Error('Expected denied flow instance to start.');
        }
        expect(deniedStart.flowInstance.instance.status).toBe('failed');
        expect(deniedStart.flowInstance.lastErrorMessage).toContain('denied by the current shell safety policy');
        expect(deniedStart.flowInstance.availableActions.canRetry).toBe(true);

        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint: denyWorkspaceFingerprint,
            resource: deniedCommandResource,
            policy: 'allow',
        });

        const retried = await caller.flow.retryInstance({
            profileId,
            flowInstanceId: deniedStart.flowInstance.instance.id,
        });
        expect(retried.found).toBe(true);
        if (!retried.found) {
            throw new Error('Expected failed flow instance to retry.');
        }
        expect(retried.flowInstance.instance.status).toBe('completed');
        expect(retried.flowInstance.retrySourceFlowInstanceId).toBe(deniedStart.flowInstance.instance.id);

        const unsupportedDefinition = await caller.flow.createDefinition({
            profileId,
            label: 'Unsupported flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'workflow',
                    id: 'step_workflow',
                    label: 'Run review workflow',
                    workflowCapability: 'review',
                    promptMarkdown: 'Review the codebase.',
                },
            ],
        });
        const unsupportedStart = await caller.flow.startInstance({
            profileId,
            flowDefinitionId: unsupportedDefinition.flowDefinition.definition.id,
        });
        expect(unsupportedStart.found).toBe(true);
        if (!unsupportedStart.found) {
            throw new Error('Expected unsupported flow instance to start.');
        }
        expect(unsupportedStart.flowInstance.instance.status).toBe('failed');
        expect(unsupportedStart.flowInstance.lastErrorMessage).toContain(
            'not executable in Execute Flow Slice 4'
        );

        const cancelWorkspaceFingerprint = 'ws_flow_cancel';
        await seedWorkspaceRoot(profileId, cancelWorkspaceFingerprint);
        const cancelCommand = 'node -e "setTimeout(() => process.exit(0), 10000)"';
        const cancelCommandResource = buildShellApprovalContext(cancelCommand).approvalCandidates[0]?.resource;
        if (!cancelCommandResource) {
            throw new Error('Expected shell approval prefix resource for cancellable-flow test.');
        }
        await caller.permission.setWorkspaceOverride({
            profileId,
            workspaceFingerprint: cancelWorkspaceFingerprint,
            resource: cancelCommandResource,
            policy: 'allow',
        });

        const cancellableDefinition = await caller.flow.createDefinition({
            profileId,
            label: 'Cancelable flow',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_run',
                    label: 'Run long command',
                    command: cancelCommand,
                },
            ],
        });

        const startPromise = caller.flow.startInstance({
            profileId,
            flowDefinitionId: cancellableDefinition.flowDefinition.definition.id,
            executionContext: {
                workspaceFingerprint: cancelWorkspaceFingerprint,
            },
        });
        const runningInstance = await waitForFlowInstanceByDefinition({
            profileId,
            flowDefinitionId: cancellableDefinition.flowDefinition.definition.id,
            expectedStatus: 'running',
        });

        const cancelled = await caller.flow.cancelInstance({
            profileId,
            flowInstanceId: runningInstance.id,
        });
        expect(cancelled.found).toBe(true);
        if (!cancelled.found) {
            throw new Error('Expected running flow instance to cancel.');
        }
        expect(cancelled.flowInstance.instance.status).toBe('cancelled');
        expect(cancelled.flowInstance.availableActions.canRetry).toBe(true);

        const startedResult = await startPromise;
        expect(startedResult.found).toBe(true);
        if (!startedResult.found) {
            throw new Error('Expected cancellable flow start to return a flow instance.');
        }
        expect(startedResult.flowInstance.instance.status).toBe('cancelled');
    });
});
