import { describe, expect, it } from 'vitest';

import {
    parseFlowDefinitionRecord,
    parseFlowInstanceRecord,
    parseFlowLifecycleEvent,
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
                    },
                    {
                        kind: 'workflow',
                        id: 'step_workflow',
                        label: 'Plan',
                        workflowCapability: 'planning',
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
                { kind: 'workflow' },
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
    });

    it('parses flow instances and lifecycle events and rejects malformed values', () => {
        expect(
            parseFlowInstanceRecord({
                id: 'flow_instance_setup',
                flowDefinitionId: 'flow_setup',
                status: 'queued',
                currentStepIndex: 0,
                startedAt: '2026-04-02T00:00:01.000Z',
            })
        ).toEqual({
            id: 'flow_instance_setup',
            flowDefinitionId: 'flow_setup',
            status: 'queued',
            currentStepIndex: 0,
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
});
