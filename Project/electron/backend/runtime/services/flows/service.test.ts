import { describe, expect, it } from 'vitest';

import type { FlowDefinitionRecord } from '@/app/backend/runtime/contracts';
import {
    advanceFlowInstanceProjection,
    buildFlowLifecycleEvents,
    createFlowInstanceProjection,
    normalizeFlowDefinition,
} from '@/app/backend/runtime/services/flows/lifecycle';
import { flowService } from '@/app/backend/runtime/services/flows/service';

function createDefinition(): FlowDefinitionRecord {
    return {
        id: 'flow_rich_plan ',
        label: '  Rich Plan Flow ',
        description: '  Skeleton flow definition ',
        enabled: true,
        triggerKind: 'manual',
        steps: [
            {
                kind: 'legacy_command',
                id: 'step_1',
                label: '  Run command ',
                command: ' pnpm test ',
            },
            {
                kind: 'approval_gate',
                id: 'step_2',
                label: ' Approve ',
            },
        ],
        createdAt: '2026-04-02T00:00:00.000Z',
        updatedAt: '2026-04-02T00:00:00.000Z',
    };
}

describe('flowService', () => {
    it('normalizes flow definitions and preserves the canonical step shape', () => {
        const normalized = normalizeFlowDefinition(createDefinition());

        expect(normalized).toEqual({
            id: 'flow_rich_plan',
            label: 'Rich Plan Flow',
            description: 'Skeleton flow definition',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'step_1',
                    label: 'Run command',
                    command: 'pnpm test',
                },
                {
                    kind: 'approval_gate',
                    id: 'step_2',
                    label: 'Approve',
                },
            ],
            createdAt: '2026-04-02T00:00:00.000Z',
            updatedAt: '2026-04-02T00:00:00.000Z',
        });
    });

    it('creates a canonical one-step legacy command flow definition', () => {
        const definition = flowService.createLegacyCommandFlowDefinition({
            id: 'flow_legacy_command',
            label: 'Legacy Command',
            command: 'pnpm test',
        });

        expect(definition).toEqual({
            id: 'flow_legacy_command',
            label: 'Legacy Command',
            enabled: true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: 'flow_legacy_command:step_1',
                    label: 'Legacy Command',
                    command: 'pnpm test',
                },
            ],
            createdAt: definition.createdAt,
            updatedAt: definition.updatedAt,
        });
    });

    it('creates an initial queued instance projection from a flow definition', () => {
        const instance = createFlowInstanceProjection({
            flowDefinition: flowService.normalizeFlowDefinition(createDefinition()),
        });

        expect(instance).toEqual({
            id: 'flow_instance_flow_rich_plan',
            flowDefinitionId: 'flow_rich_plan',
            status: 'queued',
            currentStepIndex: 0,
        });
    });

    it('advances lifecycle state and stamps timestamps for terminal statuses', () => {
        const queued = flowService.createFlowInstance(
            flowService.normalizeFlowDefinition(createDefinition()),
            'flow_instance_1'
        );
        const running = advanceFlowInstanceProjection({
            flowInstance: queued,
            status: 'running',
            currentStepIndex: 0,
            startedAt: '2026-04-02T10:00:00.000Z',
        });
        const completed = flowService.advanceFlowInstance(running, {
            status: 'completed',
            finishedAt: '2026-04-02T10:02:00.000Z',
        });

        expect(running.status).toBe('running');
        expect(running.startedAt).toBe('2026-04-02T10:00:00.000Z');
        expect(completed).toEqual({
            id: 'flow_instance_1',
            flowDefinitionId: 'flow_rich_plan',
            status: 'completed',
            currentStepIndex: 0,
            startedAt: '2026-04-02T10:00:00.000Z',
            finishedAt: '2026-04-02T10:02:00.000Z',
        });
    });

    it('builds lifecycle events from the current flow projection', () => {
        const definition = flowService.normalizeFlowDefinition(createDefinition());
        const instance = flowService.createFlowInstance(definition);
        const events = buildFlowLifecycleEvents({
            flowDefinition: definition,
            flowInstance: {
                ...instance,
                status: 'approval_required',
            },
        });

        expect(events.started.kind).toBe('flow.started');
        expect(events.started.payload).toEqual({
            triggerKind: 'manual',
            stepCount: 2,
            status: 'queued',
        });
        expect(events.approvalRequired?.kind).toBe('flow.approval_required');
        expect(events.approvalRequired?.payload.status).toBe('approval_required');
    });
});
