import { err, ok, type Result } from 'neverthrow';

import type { ModeDefinition, PlanStartInput } from '@/app/backend/runtime/contracts';
import { modeSupportsPlanningWorkflow } from '@/app/backend/runtime/services/mode/metadata';

export type PlanServiceErrorCode =
    | 'invalid_mode'
    | 'invalid_tab'
    | 'invalid_state'
    | 'invalid_worker_count'
    | 'unanswered_questions'
    | 'not_approved'
    | 'not_cancellable'
    | 'follow_up_conflict'
    | 'research_conflict'
    | 'research_parse_failed'
    | 'revision_conflict'
    | 'draft_generation_failed'
    | 'run_start_failed'
    | 'unsupported_tab';

export interface PlanServiceError {
    code: PlanServiceErrorCode;
    message: string;
}

export class PlanServiceException extends Error {
    readonly code: PlanServiceErrorCode;

    constructor(error: PlanServiceError) {
        super(error.message);
        this.name = 'PlanServiceException';
        this.code = error.code;
    }
}

export function okPlan<T>(value: T): Result<T, PlanServiceError> {
    return ok(value);
}

export function errPlan(code: PlanServiceErrorCode, message: string): Result<never, PlanServiceError> {
    return err({
        code,
        message,
    });
}

export function toPlanException(error: PlanServiceError): Error {
    return new PlanServiceException(error);
}

export function validatePlanStartInput(
    input: PlanStartInput,
    mode: Pick<ModeDefinition, 'modeKey' | 'topLevelTab' | 'executionPolicy'> | null
): Result<void, PlanServiceError> {
    if (input.topLevelTab === 'chat') {
        return errPlan('invalid_tab', 'Planning flow is only available in agent or orchestrator tabs.');
    }

    if (!mode) {
        return errPlan('invalid_mode', `Plan flow could not resolve a planning-capable mode for "${input.modeKey}".`);
    }

    if (!modeSupportsPlanningWorkflow(mode)) {
        return errPlan(
            'invalid_mode',
            `Mode "${input.modeKey}" is not planning-capable and cannot start plan flow.`
        );
    }

    return okPlan(undefined);
}
