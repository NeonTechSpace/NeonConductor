import { describe, expect, it } from 'vitest';

import {
    cancelFlowInstance,
    completeFlowInstance,
    completeFlowStep,
    createFlowInstanceRecord,
    failFlowInstance,
    normalizeFlowDefinition,
    requireFlowApproval,
    startFlowInstance,
    startFlowStep,
} from '@/app/backend/runtime/services/flows/skeleton';

const flowDefinition = {
    id: 'flow_install',
    label: ' Install deps ',
    description: ' Run install once ',
    enabled: true,
    triggerKind: 'manual' as const,
    steps: [
        {
            kind: 'legacy_command' as const,
            id: 'step_install',
            label: 'Install',
            command: 'pnpm install',
        },
    ],
    createdAt: '2026-04-02T00:00:00.000Z',
    updatedAt: '2026-04-02T00:00:00.000Z',
};

describe('flow skeleton', () => {
    it('normalizes flow definitions and creates queued in-memory instances', () => {
        const normalized = normalizeFlowDefinition(flowDefinition);
        expect(normalized.label).toBe('Install deps');
        expect(normalized.description).toBe('Run install once');

        expect(
            createFlowInstanceRecord({
                flowDefinition: normalized,
                flowInstanceId: 'flow_instance_test',
            })
        ).toEqual({
            id: 'flow_instance_test',
            flowDefinitionId: 'flow_install',
            status: 'queued',
            currentStepIndex: 0,
        });
    });

    it('projects started, step, approval, failure, cancellation, and completion lifecycle states', () => {
        const normalized = normalizeFlowDefinition(flowDefinition);
        const created = createFlowInstanceRecord({
            flowDefinition: normalized,
            flowInstanceId: 'flow_instance_test',
        });
        const started = startFlowInstance({
            flowDefinition: normalized,
            flowInstance: created,
            now: '2026-04-02T00:00:01.000Z',
        });
        expect(started.flowInstance.status).toBe('running');
        expect(started.event.eventType).toBe('flow.started');

        const stepStarted = startFlowStep({
            flowDefinition: normalized,
            flowInstance: started.flowInstance,
            stepIndex: 0,
            now: '2026-04-02T00:00:02.000Z',
        });
        expect(stepStarted).toEqual({
            eventType: 'flow.step_started',
            flowDefinitionId: 'flow_install',
            flowInstanceId: 'flow_instance_test',
            stepId: 'step_install',
            stepIndex: 0,
            stepKind: 'legacy_command',
            at: '2026-04-02T00:00:02.000Z',
        });

        const stepCompleted = completeFlowStep({
            flowDefinition: normalized,
            flowInstance: started.flowInstance,
            stepIndex: 0,
            now: '2026-04-02T00:00:03.000Z',
        });
        expect(stepCompleted.eventType).toBe('flow.step_completed');

        const approvalRequired = requireFlowApproval({
            flowDefinition: normalized,
            flowInstance: started.flowInstance,
            stepIndex: 0,
            now: '2026-04-02T00:00:04.000Z',
        });
        expect(approvalRequired.flowInstance.status).toBe('approval_required');
        expect(approvalRequired.event.eventType).toBe('flow.approval_required');

        const failed = failFlowInstance({
            flowDefinition: normalized,
            flowInstance: started.flowInstance,
            message: 'boom',
            stepIndex: 0,
            now: '2026-04-02T00:00:05.000Z',
        });
        expect(failed.flowInstance.status).toBe('failed');
        expect(failed.event).toMatchObject({
            eventType: 'flow.failed',
            message: 'boom',
            stepId: 'step_install',
            stepIndex: 0,
        });

        const cancelled = cancelFlowInstance({
            flowDefinition: normalized,
            flowInstance: started.flowInstance,
            now: '2026-04-02T00:00:06.000Z',
        });
        expect(cancelled.flowInstance.status).toBe('cancelled');
        expect(cancelled.event.eventType).toBe('flow.cancelled');

        const completed = completeFlowInstance({
            flowDefinition: normalized,
            flowInstance: started.flowInstance,
            now: '2026-04-02T00:00:07.000Z',
        });
        expect(completed.flowInstance.status).toBe('completed');
        expect(completed.flowInstance.currentStepIndex).toBe(1);
        expect(completed.event.eventType).toBe('flow.completed');
    });
});
