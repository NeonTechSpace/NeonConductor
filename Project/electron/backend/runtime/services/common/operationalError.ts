import { err, ok, type Result } from 'neverthrow';

export type OperationalErrorCode =
    | 'invalid_input'
    | 'permission_required'
    | 'not_found'
    | 'conversation_not_found'
    | 'thread_not_found'
    | 'checkpoint_execution_target_unresolved'
    | 'checkpoint_snapshot_capture_failed'
    | 'thread_mode_mismatch'
    | 'unsupported_tab'
    | 'auth_missing'
    | 'flow_not_found'
    | 'invalid_payload'
    | 'cache_key_invalid'
    | 'runtime_option_invalid'
    | 'provider_auth_invalid_state'
    | 'provider_auth_unsupported'
    | 'provider_model_missing'
    | 'provider_model_not_available'
    | 'provider_not_authenticated'
    | 'provider_not_registered'
    | 'provider_not_supported'
    | 'provider_first_output_timeout'
    | 'provider_request_failed'
    | 'provider_request_unavailable'
    | 'provider_secret_missing'
    | 'refresh_token_missing'
    | 'request_failed'
    | 'request_unavailable'
    | 'schema_error'
    | 'timeout'
    | 'invalid_mode'
    | 'mode_not_available'
    | 'mode_policy_invalid'
    | 'execution_target_unavailable'
    | 'cache_resolution_failed'
    | 'invariant_violation'
    | 'data_corruption';

export interface OperationalError {
    code: OperationalErrorCode;
    message: string;
    details?: Record<string, unknown>;
    retryable?: boolean;
}

export type OperationalResult<T> = Result<T, OperationalError>;

export function okOp<T>(value: T): OperationalResult<T> {
    return ok(value);
}

export function errOp(
    code: OperationalErrorCode,
    message: string,
    options?: {
        details?: Record<string, unknown>;
        retryable?: boolean;
    }
): OperationalResult<never> {
    return err({
        code,
        message,
        ...(options?.details ? { details: options.details } : {}),
        ...(options?.retryable !== undefined ? { retryable: options.retryable } : {}),
    });
}

export function isOperationalError(error: unknown): error is OperationalError {
    if (!error || typeof error !== 'object') {
        return false;
    }

    if (!('code' in error) || !('message' in error)) {
        return false;
    }

    const candidate = error as { code?: unknown; message?: unknown };
    return typeof candidate.code === 'string' && typeof candidate.message === 'string';
}

export function toOperationalError(
    error: unknown,
    fallbackCode: OperationalErrorCode,
    fallbackMessage = 'Operation failed.'
): OperationalError {
    if (isOperationalError(error)) {
        return error;
    }

    if (error instanceof Error) {
        return {
            code: fallbackCode,
            message: error.message || fallbackMessage,
        };
    }

    return {
        code: fallbackCode,
        message: typeof error === 'string' ? error : fallbackMessage,
    };
}
