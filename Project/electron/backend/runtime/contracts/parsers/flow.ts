import {
    flowInstanceStatuses,
    flowStepKinds,
    flowTriggerKinds,
    topLevelTabs,
    workflowCapabilities,
} from '@/app/backend/runtime/contracts/enums';
import {
    createParser,
    readArray,
    readBoolean,
    readEnumValue,
    readObject,
    readOptionalString,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    FlowDefinitionRecord,
    FlowInstanceRecord,
    FlowStepDefinition,
} from '@/app/backend/runtime/contracts/types/flow';

import {
    flowLifecycleEventKinds,
    type FlowApprovalRequiredLifecycleEventPayload,
    type FlowCancelledLifecycleEventPayload,
    type FlowCompletedLifecycleEventPayload,
    type FlowFailedLifecycleEventPayload,
    type FlowLifecycleEvent,
    type FlowStartedLifecycleEventPayload,
    type FlowStepCompletedLifecycleEventPayload,
    type FlowStepStartedLifecycleEventPayload,
} from '@/shared/flowLifecycle';

function readNonNegativeInteger(value: unknown, field: string): number {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
        throw new Error(`Invalid "${field}": expected non-negative integer.`);
    }

    return value;
}

function parseFlowStepDefinition(input: unknown, field: string): FlowStepDefinition {
    const source = readObject(input, field);
    const kind = readEnumValue(source.kind, `${field}.kind`, flowStepKinds);

    if (kind === 'legacy_command') {
        return {
            kind,
            id: readString(source.id, `${field}.id`),
            label: readString(source.label, `${field}.label`),
            command: readString(source.command, `${field}.command`),
        };
    }

    if (kind === 'mode_run') {
        return {
            kind,
            id: readString(source.id, `${field}.id`),
            label: readString(source.label, `${field}.label`),
            topLevelTab: readEnumValue(source.topLevelTab, `${field}.topLevelTab`, topLevelTabs),
            modeKey: readString(source.modeKey, `${field}.modeKey`),
        };
    }

    if (kind === 'workflow') {
        return {
            kind,
            id: readString(source.id, `${field}.id`),
            label: readString(source.label, `${field}.label`),
            workflowCapability: readEnumValue(
                source.workflowCapability,
                `${field}.workflowCapability`,
                workflowCapabilities
            ),
        };
    }

    return {
        kind,
        id: readString(source.id, `${field}.id`),
        label: readString(source.label, `${field}.label`),
    };
}

export function parseFlowDefinitionRecord(input: unknown): FlowDefinitionRecord {
    const source = readObject(input, 'input');
    const description = readOptionalString(source.description, 'description');

    return {
        id: readString(source.id, 'id'),
        label: readString(source.label, 'label'),
        ...(description ? { description } : {}),
        enabled: readBoolean(source.enabled, 'enabled'),
        triggerKind: readEnumValue(source.triggerKind, 'triggerKind', flowTriggerKinds),
        steps: readArray(source.steps, 'steps').map((step, index) =>
            parseFlowStepDefinition(step, `steps[${String(index)}]`)
        ),
        createdAt: readString(source.createdAt, 'createdAt'),
        updatedAt: readString(source.updatedAt, 'updatedAt'),
    };
}

export function parseFlowInstanceRecord(input: unknown): FlowInstanceRecord {
    const source = readObject(input, 'input');
    const startedAt = readOptionalString(source.startedAt, 'startedAt');
    const finishedAt = readOptionalString(source.finishedAt, 'finishedAt');

    return {
        id: readString(source.id, 'id'),
        flowDefinitionId: readString(source.flowDefinitionId, 'flowDefinitionId'),
        status: readEnumValue(source.status, 'status', flowInstanceStatuses),
        currentStepIndex: readNonNegativeInteger(source.currentStepIndex, 'currentStepIndex'),
        ...(startedAt ? { startedAt } : {}),
        ...(finishedAt ? { finishedAt } : {}),
    };
}

export function parseFlowLifecycleEvent(input: unknown): FlowLifecycleEvent {
    const source = readObject(input, 'input');
    const kind = readEnumValue(source.kind, 'kind', flowLifecycleEventKinds);
    const flowDefinitionId = readString(source.flowDefinitionId, 'flowDefinitionId');
    const flowInstanceId = readString(source.flowInstanceId, 'flowInstanceId');
    const at = readString(source.at, 'at');
    const id = readString(source.id, 'id');
    const payload = readObject(source.payload, 'payload');

    if (kind === 'flow.started') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                triggerKind: readEnumValue(payload.triggerKind, 'payload.triggerKind', flowTriggerKinds),
                stepCount: readNonNegativeInteger(payload.stepCount, 'payload.stepCount'),
                status: 'queued',
            } satisfies FlowStartedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.step_started') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex'),
                stepId: readString(payload.stepId, 'payload.stepId'),
                stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds),
                status: 'running',
            } satisfies FlowStepStartedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.step_completed') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex'),
                stepId: readString(payload.stepId, 'payload.stepId'),
                stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds),
                status: 'running',
            } satisfies FlowStepCompletedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.approval_required') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex'),
                stepId: readString(payload.stepId, 'payload.stepId'),
                stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds),
                reason: readString(payload.reason, 'payload.reason'),
                status: 'approval_required',
            } satisfies FlowApprovalRequiredLifecycleEventPayload,
        };
    }

    if (kind === 'flow.failed') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                errorMessage: readString(payload.errorMessage, 'payload.errorMessage'),
                status: 'failed',
                ...(payload.stepIndex !== undefined
                    ? { stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex') }
                    : {}),
                ...(payload.stepId ? { stepId: readString(payload.stepId, 'payload.stepId') } : {}),
                ...(payload.stepKind ? { stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds) } : {}),
            } satisfies FlowFailedLifecycleEventPayload,
        };
    }

    if (kind === 'flow.cancelled') {
        return {
            id,
            kind,
            flowDefinitionId,
            flowInstanceId,
            at,
            payload: {
                status: 'cancelled',
                ...(payload.reason ? { reason: readString(payload.reason, 'payload.reason') } : {}),
                ...(payload.stepIndex !== undefined
                    ? { stepIndex: readNonNegativeInteger(payload.stepIndex, 'payload.stepIndex') }
                    : {}),
                ...(payload.stepId ? { stepId: readString(payload.stepId, 'payload.stepId') } : {}),
                ...(payload.stepKind ? { stepKind: readEnumValue(payload.stepKind, 'payload.stepKind', flowStepKinds) } : {}),
            } satisfies FlowCancelledLifecycleEventPayload,
        };
    }

    return {
        id,
        kind,
        flowDefinitionId,
        flowInstanceId,
        at,
        payload: {
            completedStepCount: readNonNegativeInteger(payload.completedStepCount, 'payload.completedStepCount'),
            status: 'completed',
        } satisfies FlowCompletedLifecycleEventPayload,
    };
}

export const flowDefinitionRecordSchema = createParser(parseFlowDefinitionRecord);
export const flowInstanceRecordSchema = createParser(parseFlowInstanceRecord);
export const flowLifecycleEventSchema = createParser(parseFlowLifecycleEvent);
