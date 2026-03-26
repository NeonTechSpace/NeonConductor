import { TRPCError } from '@trpc/server';

import type { OperationalErrorCode } from '@/app/backend/runtime/services/common/operationalError';
import { isOperationalError } from '@/app/backend/runtime/services/common/operationalError';

import type { Result } from 'neverthrow';

const TRPC_CODE_BY_OPERATIONAL_ERROR_CODE = new Map<OperationalErrorCode, TRPCError['code']>([
    ['invalid_input', 'BAD_REQUEST'],
    ['not_found', 'NOT_FOUND'],
    ['conversation_not_found', 'NOT_FOUND'],
    ['thread_not_found', 'NOT_FOUND'],
    ['checkpoint_execution_target_unresolved', 'BAD_REQUEST'],
    ['checkpoint_snapshot_capture_failed', 'INTERNAL_SERVER_ERROR'],
    ['thread_mode_mismatch', 'CONFLICT'],
    ['unsupported_tab', 'BAD_REQUEST'],
    ['auth_missing', 'UNAUTHORIZED'],
    ['flow_not_found', 'NOT_FOUND'],
    ['invalid_payload', 'BAD_REQUEST'],
    ['cache_key_invalid', 'BAD_REQUEST'],
    ['runtime_option_invalid', 'BAD_REQUEST'],
    ['provider_auth_invalid_state', 'UNAUTHORIZED'],
    ['provider_auth_unsupported', 'BAD_REQUEST'],
    ['provider_model_missing', 'NOT_FOUND'],
    ['provider_model_not_available', 'BAD_REQUEST'],
    ['provider_not_authenticated', 'UNAUTHORIZED'],
    ['provider_not_registered', 'NOT_FOUND'],
    ['provider_not_supported', 'BAD_REQUEST'],
    ['provider_first_output_timeout', 'TIMEOUT'],
    ['provider_request_failed', 'INTERNAL_SERVER_ERROR'],
    ['provider_request_unavailable', 'TIMEOUT'],
    ['provider_secret_missing', 'UNAUTHORIZED'],
    ['refresh_token_missing', 'UNAUTHORIZED'],
    ['request_failed', 'INTERNAL_SERVER_ERROR'],
    ['request_unavailable', 'TIMEOUT'],
    ['schema_error', 'BAD_REQUEST'],
    ['timeout', 'TIMEOUT'],
    ['invalid_mode', 'BAD_REQUEST'],
    ['mode_not_available', 'NOT_FOUND'],
    ['mode_policy_invalid', 'BAD_REQUEST'],
    ['cache_resolution_failed', 'BAD_REQUEST'],
    ['invariant_violation', 'INTERNAL_SERVER_ERROR'],
    ['data_corruption', 'INTERNAL_SERVER_ERROR'],
]);
const OPERATIONAL_ERROR_CODES = Array.from(TRPC_CODE_BY_OPERATIONAL_ERROR_CODE.keys());

function isOperationalErrorCode(value: string): value is OperationalErrorCode {
    return OPERATIONAL_ERROR_CODES.some((code) => code === value);
}

export function mapOperationalErrorCodeToTrpcCode(code: OperationalErrorCode): TRPCError['code'] {
    return TRPC_CODE_BY_OPERATIONAL_ERROR_CODE.get(code) ?? 'INTERNAL_SERVER_ERROR';
}

export function toTrpcError(error: unknown): TRPCError {
    if (error instanceof TRPCError) {
        return error;
    }

    if (isOperationalError(error)) {
        return new TRPCError({
            code: mapOperationalErrorCodeToTrpcCode(error.code),
            message: error.message,
            cause: error,
        });
    }

    if (error instanceof Error) {
        const code = extractErrorCode(error);
        if (code) {
            return new TRPCError({
                code: mapOperationalErrorCodeToTrpcCode(code),
                message: error.message,
                cause: error,
            });
        }

        if (error.message.startsWith('Invalid "')) {
            return new TRPCError({
                code: 'BAD_REQUEST',
                message: error.message,
                cause: error,
            });
        }

        return new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: error.message,
            cause: error,
        });
    }

    return new TRPCError({
        code: 'INTERNAL_SERVER_ERROR',
        message: typeof error === 'string' ? error : 'Unknown tRPC error',
    });
}

export function raiseTrpcError(error: unknown): never {
    throw toTrpcError(error);
}

export function raiseMappedTrpcError<TError>(error: TError, mapError: (error: TError) => TRPCError): never {
    throw mapError(error);
}

export function unwrapResultOrThrow<TValue, TError>(
    result: Result<TValue, TError>,
    mapError: (error: TError) => TRPCError
): TValue {
    if (result.isErr()) {
        return raiseMappedTrpcError(result.error, mapError);
    }

    return result.value;
}

export function extractErrorCode(error: unknown): OperationalErrorCode | undefined {
    if (!error || typeof error !== 'object' || !('code' in error)) {
        return undefined;
    }

    const code = Reflect.get(error, 'code');
    if (typeof code !== 'string') {
        return undefined;
    }

    return isOperationalErrorCode(code) ? code : undefined;
}
