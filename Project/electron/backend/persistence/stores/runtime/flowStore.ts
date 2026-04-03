import { randomUUID } from 'node:crypto';

import { getPersistence } from '@/app/backend/persistence/db';
import { runtimeEventStore } from '@/app/backend/persistence/stores/runtime/runtimeEventStore';
import { parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { FlowDefinitionPersistenceRecord, FlowInstancePersistenceRecord } from '@/app/backend/persistence/types';
import {
    type FlowExecutionContext,
    flowDefinitionOriginKinds,
    flowInstanceStatuses,
    type FlowApprovalKind,
    flowTriggerKinds,
    type FlowDefinitionView,
    type FlowDefinitionCreateInput,
    type FlowDefinitionOriginKind,
    type FlowDefinitionRecord,
    type FlowDefinitionUpdateInput,
    type FlowInstanceView,
    type FlowInstanceRecord,
    type FlowLifecycleEvent,
} from '@/app/backend/runtime/contracts';
import {
    parseFlowDefinitionRecord,
    parseFlowInstanceRecord,
    parseFlowLifecycleEvent,
    flowApprovalKinds,
} from '@/app/backend/runtime/contracts';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';
import { normalizeFlowDefinition } from '@/app/backend/runtime/services/flows/lifecycle';

type FlowDefinitionRow = {
    id: string;
    profile_id: string;
    origin_kind: FlowDefinitionOriginKind;
    workspace_fingerprint: string | null;
    source_branch_workflow_id: string | null;
    label: string;
    description: string | null;
    enabled: 0 | 1;
    trigger_kind: string;
    steps_json: string;
    created_at: string;
    updated_at: string;
};

type FlowInstanceRow = {
    id: string;
    profile_id: string;
    flow_definition_id: string;
    status: string;
    current_step_index: number;
    definition_snapshot_json: string;
    execution_context_json: string | null;
    current_run_id: string | null;
    current_child_thread_id: string | null;
    current_child_session_id: string | null;
    current_plan_id: string | null;
    current_plan_revision_id: string | null;
    current_plan_phase_id: string | null;
    current_plan_phase_revision_id: string | null;
    awaiting_approval_kind: string | null;
    awaiting_approval_step_index: number | null;
    awaiting_approval_step_id: string | null;
    awaiting_permission_request_id: string | null;
    awaiting_plan_id: string | null;
    awaiting_plan_revision_id: string | null;
    awaiting_required_plan_status: string | null;
    last_error_message: string | null;
    retry_source_flow_instance_id: string | null;
    started_at: string | null;
    finished_at: string | null;
    created_at: string;
    updated_at: string;
};

type FlowInstanceJoinedRow = FlowInstanceRow & Pick<
    FlowDefinitionRow,
    'origin_kind' | 'workspace_fingerprint' | 'source_branch_workflow_id'
>;

const flowInstanceSelectColumns = [
    'flow_instances.id',
    'flow_instances.profile_id',
    'flow_instances.flow_definition_id',
    'flow_instances.status',
    'flow_instances.current_step_index',
    'flow_instances.definition_snapshot_json',
    'flow_instances.execution_context_json',
    'flow_instances.current_run_id',
    'flow_instances.current_child_thread_id',
    'flow_instances.current_child_session_id',
    'flow_instances.current_plan_id',
    'flow_instances.current_plan_revision_id',
    'flow_instances.current_plan_phase_id',
    'flow_instances.current_plan_phase_revision_id',
    'flow_instances.awaiting_approval_kind',
    'flow_instances.awaiting_approval_step_index',
    'flow_instances.awaiting_approval_step_id',
    'flow_instances.awaiting_permission_request_id',
    'flow_instances.awaiting_plan_id',
    'flow_instances.awaiting_plan_revision_id',
    'flow_instances.awaiting_required_plan_status',
    'flow_instances.last_error_message',
    'flow_instances.retry_source_flow_instance_id',
    'flow_instances.started_at',
    'flow_instances.finished_at',
    'flow_instances.created_at',
    'flow_instances.updated_at',
    'flow_definitions.origin_kind',
    'flow_definitions.workspace_fingerprint',
    'flow_definitions.source_branch_workflow_id',
] as const;

function parseJsonValue(input: { value: string; label: string }): unknown {
    try {
        return JSON.parse(input.value);
    } catch {
        throw new DataCorruptionError(`Invalid "${input.label}" in persistence row: expected valid JSON.`);
    }
}

function hydrateFlowDefinitionRecord(row: FlowDefinitionRow): FlowDefinitionRecord {
    const steps = parseJsonValue({
        value: row.steps_json,
        label: 'flow_definitions.steps_json',
    });

    try {
        return parseFlowDefinitionRecord({
            id: row.id,
            label: row.label,
            ...(row.description ? { description: row.description } : {}),
            enabled: row.enabled === 1,
            triggerKind: parseEnumValue(row.trigger_kind, 'flow_definitions.trigger_kind', flowTriggerKinds),
            steps,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        });
    } catch (error) {
        throw new DataCorruptionError(
            error instanceof Error
                ? `Invalid persisted flow definition "${row.id}": ${error.message}`
                : `Invalid persisted flow definition "${row.id}".`
        );
    }
}

function hydrateFlowInstanceRecord(row: FlowInstanceRow): FlowInstanceRecord {
    const executionContext = row.execution_context_json
        ? parseJsonValue({
              value: row.execution_context_json,
              label: 'flow_instances.execution_context_json',
          })
        : undefined;

    try {
        return parseFlowInstanceRecord({
            id: row.id,
            flowDefinitionId: row.flow_definition_id,
            status: parseEnumValue(row.status, 'flow_instances.status', flowInstanceStatuses),
            currentStepIndex: row.current_step_index,
            ...(executionContext ? { executionContext } : {}),
            ...(row.current_run_id ? { currentRunId: row.current_run_id } : {}),
            ...(row.current_child_thread_id ? { currentChildThreadId: row.current_child_thread_id } : {}),
            ...(row.current_child_session_id ? { currentChildSessionId: row.current_child_session_id } : {}),
            ...(row.current_plan_id ? { currentPlanId: row.current_plan_id } : {}),
            ...(row.current_plan_revision_id ? { currentPlanRevisionId: row.current_plan_revision_id } : {}),
            ...(row.current_plan_phase_id ? { currentPlanPhaseId: row.current_plan_phase_id } : {}),
            ...(row.current_plan_phase_revision_id
                ? { currentPlanPhaseRevisionId: row.current_plan_phase_revision_id }
                : {}),
            ...(row.awaiting_approval_kind
                ? {
                      awaitingApprovalKind: parseEnumValue(
                          row.awaiting_approval_kind,
                          'flow_instances.awaiting_approval_kind',
                          flowApprovalKinds
                      ),
                  }
                : {}),
            ...(row.awaiting_approval_step_index !== null
                ? { awaitingApprovalStepIndex: row.awaiting_approval_step_index }
                : {}),
            ...(row.awaiting_approval_step_id ? { awaitingApprovalStepId: row.awaiting_approval_step_id } : {}),
            ...(row.awaiting_permission_request_id
                ? { awaitingPermissionRequestId: row.awaiting_permission_request_id }
                : {}),
            ...(row.awaiting_plan_id ? { awaitingPlanId: row.awaiting_plan_id } : {}),
            ...(row.awaiting_plan_revision_id ? { awaitingPlanRevisionId: row.awaiting_plan_revision_id } : {}),
            ...(row.awaiting_required_plan_status
                ? { awaitingRequiredPlanStatus: row.awaiting_required_plan_status as 'draft' | 'approved' }
                : {}),
            ...(row.last_error_message ? { lastErrorMessage: row.last_error_message } : {}),
            ...(row.retry_source_flow_instance_id
                ? { retrySourceFlowInstanceId: row.retry_source_flow_instance_id }
                : {}),
            ...(row.started_at ? { startedAt: row.started_at } : {}),
            ...(row.finished_at ? { finishedAt: row.finished_at } : {}),
        });
    } catch (error) {
        throw new DataCorruptionError(
            error instanceof Error
                ? `Invalid persisted flow instance "${row.id}": ${error.message}`
                : `Invalid persisted flow instance "${row.id}".`
        );
    }
}

function mapFlowDefinitionRow(row: FlowDefinitionRow): FlowDefinitionPersistenceRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        originKind: parseEnumValue(row.origin_kind, 'flow_definitions.origin_kind', flowDefinitionOriginKinds),
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        ...(row.source_branch_workflow_id ? { sourceBranchWorkflowId: row.source_branch_workflow_id } : {}),
        definition: hydrateFlowDefinitionRecord(row),
    };
}

function toFlowDefinitionView(record: FlowDefinitionPersistenceRecord): FlowDefinitionView {
    return {
        definition: record.definition,
        originKind: record.originKind,
        ...(record.workspaceFingerprint ? { workspaceFingerprint: record.workspaceFingerprint } : {}),
        ...(record.sourceBranchWorkflowId ? { sourceBranchWorkflowId: record.sourceBranchWorkflowId } : {}),
    };
}

function hydrateFlowDefinitionSnapshot(row: FlowInstanceRow): FlowDefinitionRecord {
    const parsedSnapshot = parseJsonValue({
        value: row.definition_snapshot_json,
        label: 'flow_instances.definition_snapshot_json',
    });

    try {
        return parseFlowDefinitionRecord(parsedSnapshot);
    } catch (error) {
        throw new DataCorruptionError(
            error instanceof Error
                ? `Invalid persisted flow definition snapshot for instance "${row.id}": ${error.message}`
                : `Invalid persisted flow definition snapshot for instance "${row.id}".`
        );
    }
}

function mapFlowInstanceRow(row: FlowInstanceJoinedRow): FlowInstancePersistenceRecord {
    return {
        id: row.id,
        profileId: row.profile_id,
        flowDefinitionId: row.flow_definition_id,
        originKind: parseEnumValue(row.origin_kind, 'flow_definitions.origin_kind', flowDefinitionOriginKinds),
        ...(row.workspace_fingerprint ? { workspaceFingerprint: row.workspace_fingerprint } : {}),
        ...(row.source_branch_workflow_id ? { sourceBranchWorkflowId: row.source_branch_workflow_id } : {}),
        instance: hydrateFlowInstanceRecord(row),
        definitionSnapshot: hydrateFlowDefinitionSnapshot(row),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

function toFlowInstanceView(input: {
    record: FlowInstancePersistenceRecord;
    lifecycleEvents: FlowLifecycleEvent[];
}): FlowInstanceView {
    const currentStepDefinition = input.record.definitionSnapshot.steps[input.record.instance.currentStepIndex];
    const currentStep = currentStepDefinition
        ? {
              stepIndex: input.record.instance.currentStepIndex,
              step: currentStepDefinition,
          }
        : undefined;
    const lastApprovalRequiredEvent = [...input.lifecycleEvents]
        .reverse()
        .find((event) => event.kind === 'flow.approval_required');

    return {
        instance: input.record.instance,
        definitionSnapshot: input.record.definitionSnapshot,
        lifecycleEvents: input.lifecycleEvents,
        ...(input.record.instance.executionContext
            ? { executionContext: input.record.instance.executionContext }
            : {}),
        ...(input.record.instance.currentRunId ? { currentRunId: input.record.instance.currentRunId } : {}),
        ...(input.record.instance.currentChildThreadId
            ? { currentChildThreadId: input.record.instance.currentChildThreadId }
            : {}),
        ...(input.record.instance.currentChildSessionId
            ? { currentChildSessionId: input.record.instance.currentChildSessionId }
            : {}),
        ...(input.record.instance.currentPlanId ? { currentPlanId: input.record.instance.currentPlanId } : {}),
        ...(input.record.instance.currentPlanRevisionId
            ? { currentPlanRevisionId: input.record.instance.currentPlanRevisionId }
            : {}),
        ...(input.record.instance.currentPlanPhaseId ? { currentPlanPhaseId: input.record.instance.currentPlanPhaseId } : {}),
        ...(input.record.instance.currentPlanPhaseRevisionId
            ? { currentPlanPhaseRevisionId: input.record.instance.currentPlanPhaseRevisionId }
            : {}),
        ...(currentStep ? { currentStep } : {}),
        ...(input.record.instance.awaitingApprovalKind &&
        input.record.instance.awaitingApprovalStepIndex !== undefined &&
        input.record.instance.awaitingApprovalStepId &&
        lastApprovalRequiredEvent?.kind === 'flow.approval_required'
            ? {
                  awaitingApproval: {
                      kind: input.record.instance.awaitingApprovalKind,
                      stepIndex: input.record.instance.awaitingApprovalStepIndex,
                      stepId: input.record.instance.awaitingApprovalStepId,
                      reason: lastApprovalRequiredEvent.payload.reason,
                      ...(input.record.instance.awaitingPermissionRequestId
                          ? { permissionRequestId: input.record.instance.awaitingPermissionRequestId }
                          : {}),
                      ...(input.record.instance.awaitingPlanId
                          ? { planId: input.record.instance.awaitingPlanId }
                          : {}),
                      ...(input.record.instance.awaitingPlanRevisionId
                          ? { planRevisionId: input.record.instance.awaitingPlanRevisionId }
                          : {}),
                      ...(input.record.instance.awaitingRequiredPlanStatus
                          ? { requiredPlanStatus: input.record.instance.awaitingRequiredPlanStatus }
                          : {}),
                  },
              }
            : {}),
        availableActions: {
            canResume:
                input.record.instance.awaitingApprovalKind === 'flow_gate' ||
                input.record.instance.awaitingApprovalKind === 'plan_checkpoint',
            canCancel: ['queued', 'running', 'approval_required'].includes(input.record.instance.status),
            canRetry: ['failed', 'cancelled'].includes(input.record.instance.status),
        },
        ...(input.record.instance.lastErrorMessage
            ? { lastErrorMessage: input.record.instance.lastErrorMessage }
            : {}),
        ...(input.record.instance.retrySourceFlowInstanceId
            ? { retrySourceFlowInstanceId: input.record.instance.retrySourceFlowInstanceId }
            : {}),
        originKind: input.record.originKind,
        ...(input.record.workspaceFingerprint ? { workspaceFingerprint: input.record.workspaceFingerprint } : {}),
        ...(input.record.sourceBranchWorkflowId ? { sourceBranchWorkflowId: input.record.sourceBranchWorkflowId } : {}),
    };
}

function deriveCurrentStepIndexFromEvent(input: {
    record: FlowInstancePersistenceRecord;
    event: FlowLifecycleEvent;
}): number {
    const currentStepIndex = input.record.instance.currentStepIndex;
    const stepCount = input.record.definitionSnapshot.steps.length;

    switch (input.event.kind) {
        case 'flow.started':
            return 0;
        case 'flow.step_started':
            return input.event.payload.stepIndex;
        case 'flow.step_completed':
            return Math.min(input.event.payload.stepIndex + 1, stepCount);
        case 'flow.approval_required':
            return input.event.payload.stepIndex;
        case 'flow.failed':
            return input.event.payload.stepIndex ?? currentStepIndex;
        case 'flow.cancelled':
            return input.event.payload.stepIndex ?? currentStepIndex;
        case 'flow.completed':
            return stepCount;
        default:
            return currentStepIndex;
    }
}

function serializeExecutionContext(executionContext?: FlowExecutionContext): string | null {
    return executionContext ? JSON.stringify(executionContext) : null;
}

function deriveStatusFromEvent(event: FlowLifecycleEvent): FlowInstanceRecord['status'] {
    switch (event.kind) {
        case 'flow.started':
        case 'flow.step_started':
        case 'flow.step_completed':
            return 'running';
        case 'flow.approval_required':
            return 'approval_required';
        case 'flow.failed':
            return 'failed';
        case 'flow.cancelled':
            return 'cancelled';
        case 'flow.completed':
            return 'completed';
    }
}

function serializeDefinitionRow(input: {
    definition: FlowDefinitionRecord;
    profileId: string;
    originKind: FlowDefinitionOriginKind;
    workspaceFingerprint?: string;
    sourceBranchWorkflowId?: string;
}): Omit<FlowDefinitionRow, 'steps_json'> & { steps_json: string } {
    return {
        id: input.definition.id,
        profile_id: input.profileId,
        origin_kind: input.originKind,
        workspace_fingerprint: input.workspaceFingerprint ?? null,
        source_branch_workflow_id: input.sourceBranchWorkflowId ?? null,
        label: input.definition.label,
        description: input.definition.description ?? null,
        enabled: input.definition.enabled ? 1 : 0,
        trigger_kind: input.definition.triggerKind,
        steps_json: JSON.stringify(input.definition.steps),
        created_at: input.definition.createdAt,
        updated_at: input.definition.updatedAt,
    };
}

export class FlowStore {
    private async getFlowDefinitionRowById(
        profileId: string,
        flowDefinitionId: string
    ): Promise<FlowDefinitionRow | undefined> {
        return getPersistence().db
            .selectFrom('flow_definitions')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', flowDefinitionId)
            .executeTakeFirst();
    }

    async listCanonicalDefinitions(profileId: string): Promise<FlowDefinitionPersistenceRecord[]> {
        const rows = await getPersistence().db
            .selectFrom('flow_definitions')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('origin_kind', '=', 'canonical')
            .orderBy('updated_at', 'desc')
            .execute();

        return rows.map(mapFlowDefinitionRow);
    }

    async getCanonicalDefinitionById(
        profileId: string,
        flowDefinitionId: string
    ): Promise<FlowDefinitionPersistenceRecord | null> {
        const row = await getPersistence().db
            .selectFrom('flow_definitions')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('id', '=', flowDefinitionId)
            .where('origin_kind', '=', 'canonical')
            .executeTakeFirst();

        return row ? mapFlowDefinitionRow(row) : null;
    }

    async createCanonicalDefinition(input: FlowDefinitionCreateInput): Promise<FlowDefinitionPersistenceRecord> {
        const now = nowIso();
        const definition = normalizeFlowDefinition({
            id: `flow_${randomUUID()}`,
            label: input.label,
            ...(input.description ? { description: input.description } : {}),
            enabled: input.enabled,
            triggerKind: input.triggerKind,
            steps: input.steps,
            createdAt: now,
            updatedAt: now,
        });

        const row = serializeDefinitionRow({
            definition,
            profileId: input.profileId,
            originKind: 'canonical',
        });

        await getPersistence().db.insertInto('flow_definitions').values(row).execute();
        return {
            id: row.id,
            profileId: row.profile_id,
            originKind: 'canonical',
            definition,
        };
    }

    async updateCanonicalDefinition(
        input: FlowDefinitionUpdateInput
    ): Promise<FlowDefinitionPersistenceRecord | null> {
        const existingRow = await this.getFlowDefinitionRowById(input.profileId, input.flowDefinitionId);
        if (!existingRow || existingRow.origin_kind !== 'canonical') {
            return null;
        }

        const definition = normalizeFlowDefinition({
            id: existingRow.id,
            label: input.label,
            ...(input.description ? { description: input.description } : {}),
            enabled: input.enabled,
            triggerKind: input.triggerKind,
            steps: input.steps,
            createdAt: existingRow.created_at,
            updatedAt: nowIso(),
        });

        await getPersistence().db
            .updateTable('flow_definitions')
            .set({
                label: definition.label,
                description: definition.description ?? null,
                enabled: definition.enabled ? 1 : 0,
                trigger_kind: definition.triggerKind,
                steps_json: JSON.stringify(definition.steps),
                updated_at: definition.updatedAt,
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.flowDefinitionId)
            .where('origin_kind', '=', 'canonical')
            .execute();

        return {
            id: existingRow.id,
            profileId: input.profileId,
            originKind: 'canonical',
            definition,
        };
    }

    async deleteCanonicalDefinition(profileId: string, flowDefinitionId: string): Promise<'deleted' | 'not_found' | 'has_instances'> {
        const existing = await this.getCanonicalDefinitionById(profileId, flowDefinitionId);
        if (!existing) {
            return 'not_found';
        }

        const instance = await getPersistence().db
            .selectFrom('flow_instances')
            .select('id')
            .where('profile_id', '=', profileId)
            .where('flow_definition_id', '=', flowDefinitionId)
            .executeTakeFirst();
        if (instance) {
            return 'has_instances';
        }

        await getPersistence().db
            .deleteFrom('flow_definitions')
            .where('profile_id', '=', profileId)
            .where('id', '=', flowDefinitionId)
            .where('origin_kind', '=', 'canonical')
            .execute();

        return 'deleted';
    }

    async upsertBranchWorkflowAdapterDefinition(input: {
        profileId: string;
        workspaceFingerprint: string;
        sourceBranchWorkflowId: string;
        flowDefinition: FlowDefinitionRecord;
    }): Promise<FlowDefinitionPersistenceRecord> {
        const existing = await getPersistence().db
            .selectFrom('flow_definitions')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('origin_kind', '=', 'branch_workflow_adapter')
            .where('workspace_fingerprint', '=', input.workspaceFingerprint)
            .where('source_branch_workflow_id', '=', input.sourceBranchWorkflowId)
            .executeTakeFirst();

        const definition = normalizeFlowDefinition({
            ...input.flowDefinition,
            id: existing?.id ?? `flow_${randomUUID()}`,
        });

        const row = serializeDefinitionRow({
            definition,
            profileId: input.profileId,
            originKind: 'branch_workflow_adapter',
            workspaceFingerprint: input.workspaceFingerprint,
            sourceBranchWorkflowId: input.sourceBranchWorkflowId,
        });

        if (existing) {
            await getPersistence().db
                .updateTable('flow_definitions')
                .set({
                    label: row.label,
                    description: row.description,
                    enabled: row.enabled,
                    trigger_kind: row.trigger_kind,
                    steps_json: row.steps_json,
                    updated_at: row.updated_at,
                })
                .where('id', '=', existing.id)
                .execute();
        } else {
            await getPersistence().db.insertInto('flow_definitions').values(row).execute();
        }

        return {
            id: row.id,
            profileId: row.profile_id,
            originKind: 'branch_workflow_adapter',
            workspaceFingerprint: input.workspaceFingerprint,
            sourceBranchWorkflowId: input.sourceBranchWorkflowId,
            definition,
        };
    }

    async createFlowInstance(input: {
        profileId: string;
        flowDefinitionId: string;
        definitionSnapshot: FlowDefinitionRecord;
        executionContext?: FlowExecutionContext;
        currentRunId?: string | null;
        currentChildThreadId?: string | null;
        currentChildSessionId?: string | null;
        currentPlanId?: string | null;
        currentPlanRevisionId?: string | null;
        currentPlanPhaseId?: string | null;
        currentPlanPhaseRevisionId?: string | null;
        retrySourceFlowInstanceId?: string;
    }): Promise<FlowInstancePersistenceRecord | null> {
        const definitionRow = await this.getFlowDefinitionRowById(input.profileId, input.flowDefinitionId);
        if (!definitionRow) {
            return null;
        }

        const now = nowIso();
        const instanceRow = {
            id: `flow_instance_${randomUUID()}`,
            profile_id: input.profileId,
            flow_definition_id: input.flowDefinitionId,
            status: 'queued',
            current_step_index: 0,
            definition_snapshot_json: JSON.stringify(input.definitionSnapshot),
            execution_context_json: serializeExecutionContext(input.executionContext),
            current_run_id: input.currentRunId ?? null,
            current_child_thread_id: input.currentChildThreadId ?? null,
            current_child_session_id: input.currentChildSessionId ?? null,
            current_plan_id: input.currentPlanId ?? null,
            current_plan_revision_id: input.currentPlanRevisionId ?? null,
            current_plan_phase_id: input.currentPlanPhaseId ?? null,
            current_plan_phase_revision_id: input.currentPlanPhaseRevisionId ?? null,
            awaiting_approval_kind: null,
            awaiting_approval_step_index: null,
            awaiting_approval_step_id: null,
            awaiting_permission_request_id: null,
            awaiting_plan_id: null,
            awaiting_plan_revision_id: null,
            awaiting_required_plan_status: null,
            last_error_message: null,
            retry_source_flow_instance_id: input.retrySourceFlowInstanceId ?? null,
            started_at: null,
            finished_at: null,
            created_at: now,
            updated_at: now,
        } satisfies FlowInstanceRow;

        await getPersistence().db.insertInto('flow_instances').values(instanceRow).execute();

        return mapFlowInstanceRow({
            ...instanceRow,
            origin_kind: definitionRow.origin_kind,
            workspace_fingerprint: definitionRow.workspace_fingerprint,
            source_branch_workflow_id: definitionRow.source_branch_workflow_id,
        });
    }

    async updateFlowInstance(input: {
        profileId: string;
        flowInstanceId: string;
        status: FlowInstanceRecord['status'];
        currentStepIndex: number;
        executionContext?: FlowExecutionContext;
        currentRunId?: string | null;
        currentChildThreadId?: string | null;
        currentChildSessionId?: string | null;
        currentPlanId?: string | null;
        currentPlanRevisionId?: string | null;
        currentPlanPhaseId?: string | null;
        currentPlanPhaseRevisionId?: string | null;
        awaitingApprovalKind?: FlowApprovalKind | null;
        awaitingApprovalStepIndex?: number | null;
        awaitingApprovalStepId?: string | null;
        awaitingPermissionRequestId?: string | null;
        awaitingPlanId?: string | null;
        awaitingPlanRevisionId?: string | null;
        awaitingRequiredPlanStatus?: 'draft' | 'approved' | null;
        lastErrorMessage?: string | null;
        retrySourceFlowInstanceId?: string | null;
        startedAt?: string;
        finishedAt?: string;
    }): Promise<FlowInstancePersistenceRecord | null> {
        const existingRow = await getPersistence().db
            .selectFrom('flow_instances')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.flowInstanceId)
            .executeTakeFirst();
        if (!existingRow) {
            return null;
        }

        const updated = await getPersistence().db
            .updateTable('flow_instances')
            .set({
                status: input.status,
                current_step_index: input.currentStepIndex,
                ...(input.executionContext !== undefined
                    ? { execution_context_json: serializeExecutionContext(input.executionContext) }
                    : {}),
                ...(input.currentRunId !== undefined ? { current_run_id: input.currentRunId } : {}),
                ...(input.currentChildThreadId !== undefined
                    ? { current_child_thread_id: input.currentChildThreadId }
                    : {}),
                ...(input.currentChildSessionId !== undefined
                    ? { current_child_session_id: input.currentChildSessionId }
                    : {}),
                ...(input.currentPlanId !== undefined ? { current_plan_id: input.currentPlanId } : {}),
                ...(input.currentPlanRevisionId !== undefined
                    ? { current_plan_revision_id: input.currentPlanRevisionId }
                    : {}),
                ...(input.currentPlanPhaseId !== undefined ? { current_plan_phase_id: input.currentPlanPhaseId } : {}),
                ...(input.currentPlanPhaseRevisionId !== undefined
                    ? { current_plan_phase_revision_id: input.currentPlanPhaseRevisionId }
                    : {}),
                ...(input.awaitingApprovalKind !== undefined
                    ? { awaiting_approval_kind: input.awaitingApprovalKind }
                    : {}),
                ...(input.awaitingApprovalStepIndex !== undefined
                    ? { awaiting_approval_step_index: input.awaitingApprovalStepIndex }
                    : {}),
                ...(input.awaitingApprovalStepId !== undefined
                    ? { awaiting_approval_step_id: input.awaitingApprovalStepId }
                    : {}),
                ...(input.awaitingPermissionRequestId !== undefined
                    ? { awaiting_permission_request_id: input.awaitingPermissionRequestId }
                    : {}),
                ...(input.awaitingPlanId !== undefined ? { awaiting_plan_id: input.awaitingPlanId } : {}),
                ...(input.awaitingPlanRevisionId !== undefined
                    ? { awaiting_plan_revision_id: input.awaitingPlanRevisionId }
                    : {}),
                ...(input.awaitingRequiredPlanStatus !== undefined
                    ? { awaiting_required_plan_status: input.awaitingRequiredPlanStatus }
                    : {}),
                ...(input.lastErrorMessage !== undefined ? { last_error_message: input.lastErrorMessage } : {}),
                ...(input.retrySourceFlowInstanceId !== undefined
                    ? { retry_source_flow_instance_id: input.retrySourceFlowInstanceId }
                    : {}),
                started_at: input.startedAt ?? existingRow.started_at,
                finished_at: input.finishedAt ?? existingRow.finished_at,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.flowInstanceId)
            .returningAll()
            .executeTakeFirst();
        if (!updated) {
            return null;
        }

        const definitionRow = await this.getFlowDefinitionRowById(input.profileId, updated.flow_definition_id);
        if (!definitionRow) {
            throw new DataCorruptionError(
                `Missing persisted flow definition "${updated.flow_definition_id}" for instance "${updated.id}".`
            );
        }

        return mapFlowInstanceRow({
            ...updated,
            origin_kind: definitionRow.origin_kind,
            workspace_fingerprint: definitionRow.workspace_fingerprint,
            source_branch_workflow_id: definitionRow.source_branch_workflow_id,
        });
    }

    async listFlowLifecycleEventsByInstanceId(
        profileId: string,
        flowInstanceId: string
    ): Promise<FlowLifecycleEvent[]> {
        const instance = await getPersistence().db
            .selectFrom('flow_instances')
            .select(['id', 'flow_definition_id'])
            .where('profile_id', '=', profileId)
            .where('id', '=', flowInstanceId)
            .executeTakeFirst();
        if (!instance) {
            return [];
        }

        const rows = await runtimeEventStore.listByEntity({
            entityType: 'flow',
            entityId: flowInstanceId,
        });

        return rows
            .filter((row) => row.entityType === 'flow' && row.entityId === flowInstanceId)
            .map((row) => {
                try {
                    return parseFlowLifecycleEvent({
                        kind: row.eventType,
                        flowDefinitionId:
                            typeof row.payload.flowDefinitionId === 'string'
                                ? row.payload.flowDefinitionId
                                : instance.flow_definition_id,
                        flowInstanceId:
                            typeof row.payload.flowInstanceId === 'string'
                                ? row.payload.flowInstanceId
                                : row.entityId,
                        id: row.eventId,
                        at: row.createdAt,
                        payload: row.payload,
                    });
                } catch (error) {
                    throw new DataCorruptionError(
                        error instanceof Error
                            ? `Invalid persisted flow lifecycle event for instance "${flowInstanceId}": ${error.message}`
                            : `Invalid persisted flow lifecycle event for instance "${flowInstanceId}".`
                    );
                }
            })
            .sort((left, right) => left.at.localeCompare(right.at));
    }

    async recordFlowLifecycleEvent(input: {
        profileId: string;
        flowInstanceId: string;
        event: FlowLifecycleEvent;
    }): Promise<FlowInstancePersistenceRecord | null> {
        const instance = await this.getFlowInstanceById(input.profileId, input.flowInstanceId);
        if (!instance) {
            return null;
        }

        const appended = await runtimeEventStore.append({
            entityType: 'flow',
            domain: 'flow',
            operation: 'append',
            entityId: input.flowInstanceId,
            eventType: input.event.kind,
            payload: input.event.payload as unknown as Record<string, unknown>,
        });

        if (appended.entityId !== input.flowInstanceId) {
            throw new DataCorruptionError(`Invalid persisted flow event "${appended.eventId}".`);
        }

        const status = deriveStatusFromEvent(input.event);
        const currentStepIndex = deriveCurrentStepIndexFromEvent({
            record: instance,
            event: input.event,
        });

        const provenanceUpdate =
            input.event.kind === 'flow.step_started' ||
            input.event.kind === 'flow.step_completed' ||
            input.event.kind === 'flow.failed' ||
            input.event.kind === 'flow.cancelled'
                ? {
                      ...(input.event.payload.currentRunId ? { currentRunId: input.event.payload.currentRunId } : {}),
                      ...(input.event.payload.currentChildThreadId
                          ? { currentChildThreadId: input.event.payload.currentChildThreadId }
                          : {}),
                      ...(input.event.payload.currentChildSessionId
                          ? { currentChildSessionId: input.event.payload.currentChildSessionId }
                          : {}),
                      ...(input.event.payload.currentPlanId ? { currentPlanId: input.event.payload.currentPlanId } : {}),
                      ...(input.event.payload.currentPlanRevisionId
                          ? { currentPlanRevisionId: input.event.payload.currentPlanRevisionId }
                          : {}),
                      ...(input.event.payload.currentPlanPhaseId
                          ? { currentPlanPhaseId: input.event.payload.currentPlanPhaseId }
                          : {}),
                      ...(input.event.payload.currentPlanPhaseRevisionId
                          ? { currentPlanPhaseRevisionId: input.event.payload.currentPlanPhaseRevisionId }
                          : {}),
                  }
                : {};

        const updated = await this.updateFlowInstance({
            profileId: input.profileId,
            flowInstanceId: input.flowInstanceId,
            status,
            currentStepIndex,
            ...(input.event.kind === 'flow.approval_required'
                    ? {
                          awaitingApprovalKind: input.event.payload.approvalKind,
                          awaitingApprovalStepIndex: input.event.payload.stepIndex,
                          awaitingApprovalStepId: input.event.payload.stepId,
                          awaitingPermissionRequestId: input.event.payload.permissionRequestId ?? null,
                          awaitingPlanId: input.event.payload.planId ?? null,
                          awaitingPlanRevisionId: input.event.payload.planRevisionId ?? null,
                          awaitingRequiredPlanStatus: input.event.payload.requiredPlanStatus ?? null,
                      }
                : {}),
            ...(['flow.failed', 'flow.cancelled', 'flow.completed'].includes(input.event.kind)
                ? {
                      awaitingApprovalKind: null,
                      awaitingApprovalStepIndex: null,
                      awaitingApprovalStepId: null,
                      awaitingPermissionRequestId: null,
                      awaitingPlanId: null,
                      awaitingPlanRevisionId: null,
                      awaitingRequiredPlanStatus: null,
                  }
                : {}),
            ...(input.event.kind === 'flow.failed'
                ? { lastErrorMessage: input.event.payload.errorMessage }
                : {}),
            ...(input.event.kind === 'flow.started'
                ? {
                      retrySourceFlowInstanceId: input.event.payload.retrySourceFlowInstanceId ?? null,
                  }
                : {}),
            ...provenanceUpdate,
            ...(status === 'running' || status === 'approval_required'
                ? { startedAt: input.event.at }
                : {}),
            ...(status === 'failed' || status === 'completed' || status === 'cancelled'
                ? { finishedAt: input.event.at }
                : {}),
        });

        if (!updated) {
            throw new DataCorruptionError(`Unable to update persisted flow instance "${input.flowInstanceId}".`);
        }

        return updated;
    }

    async listFlowInstances(profileId: string): Promise<FlowInstancePersistenceRecord[]> {
        const rows = await getPersistence().db
            .selectFrom('flow_instances')
            .innerJoin('flow_definitions', 'flow_definitions.id', 'flow_instances.flow_definition_id')
            .select(flowInstanceSelectColumns)
            .where('flow_instances.profile_id', '=', profileId)
            .orderBy('flow_instances.created_at', 'desc')
            .execute();

        return rows.map((row) => mapFlowInstanceRow(row));
    }

    async getFlowInstanceById(profileId: string, flowInstanceId: string): Promise<FlowInstancePersistenceRecord | null> {
        const row = await getPersistence().db
            .selectFrom('flow_instances')
            .innerJoin('flow_definitions', 'flow_definitions.id', 'flow_instances.flow_definition_id')
            .select(flowInstanceSelectColumns)
            .where('flow_instances.profile_id', '=', profileId)
            .where('flow_instances.id', '=', flowInstanceId)
            .executeTakeFirst();

        return row ? mapFlowInstanceRow(row) : null;
    }

    async listFlowDefinitionsWithViews(profileId: string): Promise<FlowDefinitionView[]> {
        const definitions = await this.listCanonicalDefinitions(profileId);
        return definitions.map(toFlowDefinitionView);
    }

    async getFlowDefinitionViewById(
        profileId: string,
        flowDefinitionId: string
    ): Promise<FlowDefinitionView | null> {
        const definition = await this.getCanonicalDefinitionById(profileId, flowDefinitionId);
        return definition ? toFlowDefinitionView(definition) : null;
    }

    async listFlowInstanceViews(profileId: string): Promise<FlowInstanceView[]> {
        const records = await this.listFlowInstances(profileId);
        const views: FlowInstanceView[] = [];

        for (const record of records) {
            const lifecycleEvents = await this.listFlowLifecycleEventsByInstanceId(profileId, record.id);
            views.push(toFlowInstanceView({ record, lifecycleEvents }));
        }

        return views;
    }

    async getFlowInstanceViewById(
        profileId: string,
        flowInstanceId: string
    ): Promise<FlowInstanceView | null> {
        const record = await this.getFlowInstanceById(profileId, flowInstanceId);
        if (!record) {
            return null;
        }

        const lifecycleEvents = await this.listFlowLifecycleEventsByInstanceId(profileId, flowInstanceId);
        return toFlowInstanceView({ record, lifecycleEvents });
    }
}

export const flowStore = new FlowStore();
