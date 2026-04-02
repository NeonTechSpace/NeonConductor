import { err, ok, type Result } from 'neverthrow';

import type { PlanRecord } from '@/app/backend/persistence/types';
import type { EntityId } from '@/app/backend/runtime/contracts';

export type OrchestratorExecutionErrorCode =
    | 'plan_not_found'
    | 'invalid_tab'
    | 'plan_not_approved'
    | 'approved_revision_unavailable'
    | 'delegation_not_allowed'
    | 'session_not_found';

export interface OrchestratorExecutionError {
    code: OrchestratorExecutionErrorCode;
    message: string;
}

export function okOrchestrator<T>(value: T): Result<T, OrchestratorExecutionError> {
    return ok(value);
}

export function errOrchestrator(
    code: OrchestratorExecutionErrorCode,
    message: string
): Result<never, OrchestratorExecutionError> {
    return err({
        code,
        message,
    });
}

export function toOrchestratorException(error: OrchestratorExecutionError): Error {
    const exception = new Error(error.message);
    (exception as { code?: string }).code = error.code;
    return exception;
}

export function validateOrchestratorStart(
    plan: PlanRecord | null | undefined,
    planId: EntityId<'plan'>
): Result<PlanRecord, OrchestratorExecutionError> {
    if (!plan) {
        return errOrchestrator('plan_not_found', `Plan "${planId}" was not found.`);
    }
    if (plan.topLevelTab !== 'orchestrator') {
        return errOrchestrator('invalid_tab', 'Orchestrator runs can only start from orchestrator plans.');
    }
    if (plan.status !== 'approved' && plan.status !== 'implementing') {
        return errOrchestrator('plan_not_approved', `Plan "${plan.id}" must be approved before orchestration.`);
    }

    return okOrchestrator(plan);
}
