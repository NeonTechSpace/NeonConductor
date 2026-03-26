import type { Result } from 'neverthrow';

export const composerImageCompressionErrorCodes = [
    'invalid_file_type',
    'worker_unavailable',
    'decode_failed',
    'canvas_unavailable',
    'encode_failed',
    'unsupported_output_type',
    'size_limit_exceeded',
] as const;

export type ComposerImageCompressionErrorCode = (typeof composerImageCompressionErrorCodes)[number];

export interface ComposerImageCompressionError {
    code: ComposerImageCompressionErrorCode;
    message: string;
}

export type ComposerImageCompressionResult<TValue> = Result<TValue, ComposerImageCompressionError>;

export function composerImageCompressionError(
    code: ComposerImageCompressionErrorCode,
    message: string
): ComposerImageCompressionError {
    return {
        code,
        message,
    };
}
