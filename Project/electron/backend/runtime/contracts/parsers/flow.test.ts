import { describe, expect, it } from 'vitest';

import {
    parseFlowDefinitionCreateInput,
    parseFlowDefinitionDeleteInput,
    parseFlowDefinitionRecord,
    parseFlowDefinitionView,
    parseFlowInstanceGetInput,
    parseFlowInstanceRecord,
    parseFlowInstanceView,
    parseFlowLifecycleEvent,
    parseFlowResumeInput,
    parseFlowStartInput,
} from '@/app/backend/runtime/contracts/parsers/flow';

describe('flow parsers', () => {
    it('parses valid flow definitions for each supported step kind', () => {
        expect(
            parseFlowDefinitionRecord({
                id: 'flow_setup',
                label: 'Setup',
                description: 'Bootstrap a workspace',
                enabled: true,
                triggerKind: 'manual',
                steps: [
                    {
                        kind: 'legacy_command',
                        id: 'step_command',
                        label: 'Install',
                        command: 'pnpm install',
                    },
                    {
                        kind: 'mode_run',
                        id: 'step_mode',
                        label: 'Run code mode',
                        topLevelTab: 'agent',
                        modeKey: 'code',
                        promptMarkdown: 'Run the code mode with this prompt.',
                    },
                    {
                        kind: 'workflow',
                        id: 'step_workflow',
                        label: 'Plan',
                        workflowCapability: 'planning',
                        promptMarkdown: 'Draft the plan.',
                        planningDepth: 'advanced',
                        requireApprovedPlan: true,
                        reuseExistingPlan: false,
                    },
                    {
                        kind: 'approval_gate',
                        id: 'step_gate',
                        label: 'Approve',
                    },
                ],
                createdAt: '2026-04-02T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z',
            })
        ).toMatchObject({
            id: 'flow_setup',
            triggerKind: 'manual',
            steps: [
                { kind: 'legacy_command' },
                { kind: 'mode_run' },
                {
                    kind: 'workflow',
                    promptMarkdown: 'Draft the plan.',
                    planningDepth: 'advanced',
                    requireApprovedPlan: true,
                    reuseExistingPlan: false,
                },
                { kind: 'approval_gate' },
            ],
        });
    });

    it('fails closed on invalid step discriminants and malformed fields', () => {
        expect(() =>
            parseFlowDefinitionRecord({
                id: 'flow_broken',
                label: 'Broken',
                enabled: true,
                triggerKind: 'manual',
                steps: [
                    {
                        kind: 'unknown_step',
                        id: 'step_bad',
                        label: 'Bad',
                    },
                ],
                createdAt: '2026-04-02T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z',
            })
        ).toThrow('steps[0].kind');

        expect(() =>
            parseFlowDefinitionRecord({
                id: 'flow_missing',
                label: 'Missing',
                enabled: true,
                triggerKind: 'manual',
                steps: [
                    {
                        kind: 'legacy_command',
                        id: 'step_missing',
                        label: 'Install',
                    },
                ],
                createdAt: '2026-04-02T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z',
            })
        ).toThrow('steps[0].command');

        expect(() =>
            parseFlowDefinitionRecord({
                id: 'flow_missing_mode_prompt',
                label: 'Missing mode prompt',
                enabled: true,
                triggerKind: 'manual',
                steps: [
                    {
                        kind: 'mode_run',
                        id: 'step_mode',
                        label: 'Run code mode',
                        topLevelTab: 'agent',
                        modeKey: 'code',
                    },
                ],
                createdAt: '2026-04-02T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z',
            })
        ).toThrow('steps[0].promptMarkdown');

        expect(
            parseFlowDefinitionRecord({
                id: 'flow_planning_mode_run',
                label: 'Planning mode run',
                enabled: true,
                triggerKind: 'manual',
                steps: [
                    {
                        kind: 'mode_run',
                        id: 'step_plan',
                        label: 'Run plan mode',
                        topLevelTab: 'agent',
                        modeKey: 'plan',
                        promptMarkdown: 'Draft the plan.',
                    },
                ],
                createdAt: '2026-04-02T00:00:00.000Z',
                updatedAt: '2026-04-02T00:00:00.000Z',
            }).steps[0]
        ).toMatchObject({
            kind: 'mode_run',
            modeKey: 'plan',
        });
    });

    it('parses flow instances and lifecycle events and rejects malformed values', () => {
        expect(
            parseFlowInstanceRecord({
                id: 'flow_instance_setup',
                flowDefinitionId: 'flow_setup',
                status: 'queued',
                currentStepIndex: 0,
                currentRunId: 'run_123',
                currentChildThreadId: 'thr_123',
                currentChildSessionId: 'sess_123',
                currentPlanId: 'plan_123',
                currentPlanRevisionId: 'prev_123',
                currentPlanPhaseId: 'phase_123',
                currentPlanPhaseRevisionId: 'phase_rev_123',
                awaitingApprovalKind: 'plan_checkpoint',
                awaitingApprovalStepIndex: 1,
                awaitingApprovalStepId: 'step_gate',
                awaitingPermissionRequestId: 'perm_123',
                awaitingPlanId: 'plan_123',
                awaitingPlanRevisionId: 'prev_123',
                awaitingRequiredPlanStatus: 'approved',
                lastErrorMessage: 'waiting',
                retrySourceFlowInstanceId: 'flow_instance_previous',
                startedAt: '2026-04-02T00:00:01.000Z',
            })
        ).toEqual({
            id: 'flow_instance_setup',
            flowDefinitionId: 'flow_setup',
            status: 'queued',
            currentStepIndex: 0,
            currentRunId: 'run_123',
            currentChildThreadId: 'thr_123',
            currentChildSessionId: 'sess_123',
            currentPlanId: 'plan_123',
            currentPlanRevisionId: 'prev_123',
            currentPlanPhaseId: 'phase_123',
            currentPlanPhaseRevisionId: 'phase_rev_123',
            awaitingApprovalKind: 'plan_checkpoint',
            awaitingApprovalStepIndex: 1,
            awaitingApprovalStepId: 'step_gate',
            awaitingPermissionRequestId: 'perm_123',
            awaitingPlanId: 'plan_123',
            awaitingPlanRevisionId: 'prev_123',
            awaitingRequiredPlanStatus: 'approved',
            lastErrorMessage: 'waiting',
            retrySourceFlowInstanceId: 'flow_instance_previous',
            startedAt: '2026-04-02T00:00:01.000Z',
        });

        expect(
            parseFlowLifecycleEvent({
                kind: 'flow.step_completed',
                flowDefinitionId: 'flow_setup',
                flowInstanceId: 'flow_instance_setup',
                id: 'flow_event_1',
                payload: {
                    stepIndex: 0,
                    stepId: 'step_command',
                    stepKind: 'legacy_command',
                    status: 'running',
                    currentRunId: 'run_123',
                    currentChildThreadId: 'thr_123',
                    currentChildSessionId: 'sess_123',
                    currentPlanId: 'plan_123',
                    currentPlanRevisionId: 'prev_123',
                    currentPlanPhaseId: 'phase_123',
                    currentPlanPhaseRevisionId: 'phase_rev_123',
                },
                at: '2026-04-02T00:00:02.000Z',
            })
        ).toEqual({
            kind: 'flow.step_completed',
            flowDefinitionId: 'flow_setup',
            flowInstanceId: 'flow_instance_setup',
            id: 'flow_event_1',
            at: '2026-04-02T00:00:02.000Z',
            payload: {
                stepIndex: 0,
                stepId: 'step_command',
                stepKind: 'legacy_command',
                status: 'running',
                currentRunId: 'run_123',
                currentChildThreadId: 'thr_123',
                currentChildSessionId: 'sess_123',
                currentPlanId: 'plan_123',
                currentPlanRevisionId: 'prev_123',
                currentPlanPhaseId: 'phase_123',
                currentPlanPhaseRevisionId: 'phase_rev_123',
            },
        });

        expect(
            parseFlowLifecycleEvent({
                kind: 'flow.approval_required',
                flowDefinitionId: 'flow_setup',
                flowInstanceId: 'flow_instance_setup',
                id: 'flow_event_2',
                payload: {
                    stepIndex: 1,
                    stepId: 'step_gate',
                    stepKind: 'approval_gate',
                    reason: 'Need approval to continue.',
                    approvalKind: 'plan_checkpoint',
                    planId: 'plan_123',
                    planRevisionId: 'prev_123',
                    requiredPlanStatus: 'approved',
                    status: 'approval_required',
                },
                at: '2026-04-02T00:00:03.000Z',
            })
        ).toEqual({
            kind: 'flow.approval_required',
            flowDefinitionId: 'flow_setup',
            flowInstanceId: 'flow_instance_setup',
            id: 'flow_event_2',
            at: '2026-04-02T00:00:03.000Z',
            payload: {
                stepIndex: 1,
                stepId: 'step_gate',
                stepKind: 'approval_gate',
                reason: 'Need approval to continue.',
                approvalKind: 'plan_checkpoint',
                planId: 'plan_123',
                planRevisionId: 'prev_123',
                requiredPlanStatus: 'approved',
                status: 'approval_required',
            },
        });

        expect(() =>
            parseFlowLifecycleEvent({
                kind: 'flow.unknown',
                flowDefinitionId: 'flow_setup',
                flowInstanceId: 'flow_instance_setup',
                id: 'flow_event_bad',
                at: '2026-04-02T00:00:03.000Z',
            })
        ).toThrow('kind');
    });

    it('parses flow CRUD inputs and persisted views', () => {
        expect(
            parseFlowDefinitionCreateInput({
                profileId: 'profile_test',
                label: 'Ship flow',
                description: 'Test definition',
                enabled: true,
                triggerKind: 'manual',
                steps: [
                    {
                        kind: 'approval_gate',
                        id: 'step_gate',
                        label: 'Approve',
                    },
                ],
            })
        ).toMatchObject({
            profileId: 'profile_test',
            label: 'Ship flow',
            triggerKind: 'manual',
        });

        expect(
            parseFlowDefinitionDeleteInput({
                profileId: 'profile_test',
                flowDefinitionId: 'flow_123',
                confirm: true,
            })
        ).toEqual({
            profileId: 'profile_test',
            flowDefinitionId: 'flow_123',
            confirm: true,
        });

        expect(
            parseFlowInstanceGetInput({
                profileId: 'profile_test',
                flowInstanceId: 'flow_instance_123',
            })
        ).toEqual({
            profileId: 'profile_test',
            flowInstanceId: 'flow_instance_123',
        });

        expect(
            parseFlowResumeInput({
                profileId: 'profile_test',
                flowInstanceId: 'flow_instance_123',
                expectedStepIndex: 1,
                expectedStepId: 'step_gate',
                expectedPlanId: 'plan_123',
            })
        ).toEqual({
            profileId: 'profile_test',
            flowInstanceId: 'flow_instance_123',
            expectedStepIndex: 1,
            expectedStepId: 'step_gate',
            expectedPlanId: 'plan_123',
        });

        expect(
            parseFlowStartInput({
                profileId: 'profile_test',
                flowDefinitionId: 'flow_123',
                executionContext: {
                    workspaceFingerprint: 'ws_123',
                    sandboxId: 'sb_123',
                    sessionId: 'sess_123',
                },
            })
        ).toEqual({
            profileId: 'profile_test',
            flowDefinitionId: 'flow_123',
            executionContext: {
                workspaceFingerprint: 'ws_123',
                sandboxId: 'sb_123',
                sessionId: 'sess_123',
            },
        });

        expect(
            parseFlowDefinitionView({
                definition: {
                    id: 'flow_setup',
                    label: 'Setup',
                    enabled: true,
                    triggerKind: 'manual',
                    steps: [],
                    createdAt: '2026-04-02T00:00:00.000Z',
                    updatedAt: '2026-04-02T00:00:00.000Z',
                },
                originKind: 'canonical',
            })
        ).toMatchObject({
            originKind: 'canonical',
            definition: {
                id: 'flow_setup',
            },
        });

        expect(
            parseFlowInstanceView({
                instance: {
                    id: 'flow_instance_setup',
                    flowDefinitionId: 'flow_setup',
                    status: 'completed',
                    currentStepIndex: 1,
                    startedAt: '2026-04-02T00:00:01.000Z',
                    finishedAt: '2026-04-02T00:00:02.000Z',
                },
                definitionSnapshot: {
                    id: 'flow_setup',
                    label: 'Setup',
                    enabled: true,
                    triggerKind: 'manual',
                    steps: [],
                    createdAt: '2026-04-02T00:00:00.000Z',
                    updatedAt: '2026-04-02T00:00:00.000Z',
                },
                lifecycleEvents: [
                    {
                        kind: 'flow.completed',
                        flowDefinitionId: 'flow_setup',
                        flowInstanceId: 'flow_instance_setup',
                        id: 'flow_event_1',
                        at: '2026-04-02T00:00:02.000Z',
                        payload: {
                            completedStepCount: 1,
                            status: 'completed',
                        },
                    },
                ],
                availableActions: {
                    canResume: false,
                    canCancel: false,
                    canRetry: true,
                },
                originKind: 'canonical',
            })
        ).toMatchObject({
            originKind: 'canonical',
            instance: {
                id: 'flow_instance_setup',
            },
            lifecycleEvents: [{ kind: 'flow.completed' }],
        });
    });
});
