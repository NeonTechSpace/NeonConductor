import { err, ok, type Result } from 'neverthrow';

import type { PlanStartInput } from '@/app/backend/runtime/contracts';

export type PlanServiceErrorCode =
    | 'invalid_mode'
    | 'invalid_tab'
    | 'unanswered_questions'
    | 'not_approved'
    | 'not_cancellable'
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

export function validatePlanStartInput(input: PlanStartInput): Result<void, PlanServiceError> {
    if (input.modeKey !== 'plan') {
        return errPlan('invalid_mode', `Plan flow only supports "plan" mode, received "${input.modeKey}".`);
    }
    if (input.topLevelTab === 'chat') {
        return errPlan('invalid_tab', 'Planning flow is only available in agent or orchestrator tabs.');
    }

    return okPlan(undefined);
}
