import { err, ok, type Result } from 'neverthrow';

import type { RunStartRejectionAction } from '@/app/backend/runtime/contracts';

export type RunExecutionErrorCode =
    | 'invalid_mode'
    | 'mode_not_available'
    | 'mode_policy_invalid'
    | 'runtime_option_invalid'
    | 'invalid_payload'
    | 'cache_resolution_failed'
    | 'provider_not_authenticated'
    | 'provider_auth_invalid_state'
    | 'provider_secret_missing'
    | 'provider_auth_unsupported'
    | 'provider_not_supported'
    | 'provider_model_not_available'
    | 'provider_model_missing'
    | 'provider_request_failed'
    | 'provider_request_unavailable';

export interface RunExecutionError {
    code: RunExecutionErrorCode;
    message: string;
    action?: RunStartRejectionAction;
}

export type RunExecutionResult<T> = Result<T, RunExecutionError>;

export function okRunExecution<T>(value: T): RunExecutionResult<T> {
    return ok(value);
}

export function errRunExecution(
    code: RunExecutionErrorCode,
    message: string,
    options?: {
        action?: RunStartRejectionAction;
    }
): RunExecutionResult<never> {
    return err({
        code,
        message,
        ...(options?.action ? { action: options.action } : {}),
    });
}
