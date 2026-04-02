import type {
    FlowDefinitionRecord,
    FlowInstanceRecord,
    FlowInstanceStatus,
    FlowStepDefinition,
} from '@/app/backend/runtime/contracts';
import {
    advanceFlowInstanceProjection,
    buildFlowLifecycleEvents,
    createFlowInstanceProjection,
    normalizeFlowDefinition,
} from '@/app/backend/runtime/services/flows/lifecycle';

export interface FlowLifecycleProjection {
    definition: FlowDefinitionRecord;
    instance: FlowInstanceRecord;
}

export class FlowService {
    normalizeFlowDefinition(definition: FlowDefinitionRecord): FlowDefinitionRecord {
        return normalizeFlowDefinition(definition);
    }

    createFlowInstance(definition: FlowDefinitionRecord, id?: string): FlowInstanceRecord {
        return createFlowInstanceProjection({
            flowDefinition: this.normalizeFlowDefinition(definition),
            ...(id ? { id } : {}),
        });
    }

    advanceFlowInstance(
        flowInstance: FlowInstanceRecord,
        input: {
            status: FlowInstanceStatus;
            currentStepIndex?: number;
            startedAt?: string;
            finishedAt?: string;
        }
    ): FlowInstanceRecord {
        return advanceFlowInstanceProjection({
            flowInstance,
            status: input.status,
            ...(input.currentStepIndex !== undefined ? { currentStepIndex: input.currentStepIndex } : {}),
            ...(input.startedAt ? { startedAt: input.startedAt } : {}),
            ...(input.finishedAt ? { finishedAt: input.finishedAt } : {}),
        });
    }

    buildLifecycleProjection(input: FlowLifecycleProjection) {
        return buildFlowLifecycleEvents({
            flowDefinition: input.definition,
            flowInstance: input.instance,
        });
    }

    createLegacyCommandFlowDefinition(input: {
        id: string;
        label: string;
        command: string;
        description?: string;
        enabled?: boolean;
        createdAt?: string;
        updatedAt?: string;
    }): FlowDefinitionRecord {
        const now = new Date().toISOString();
        return this.normalizeFlowDefinition({
            id: input.id,
            label: input.label,
            ...(input.description ? { description: input.description } : {}),
            enabled: input.enabled ?? true,
            triggerKind: 'manual',
            steps: [
                {
                    kind: 'legacy_command',
                    id: `${input.id}:step_1`,
                    label: input.label,
                    command: input.command,
                } satisfies FlowStepDefinition,
            ],
            createdAt: input.createdAt ?? now,
            updatedAt: input.updatedAt ?? now,
        });
    }
}

export const flowService = new FlowService();
