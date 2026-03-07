import { err, ok, type Result } from 'neverthrow';
import { spawn } from 'node:child_process';

import { readNumberArg, readStringArg } from '@/app/backend/runtime/services/toolExecution/args';
import type { ToolExecutionFailure, ToolExecutionOutput } from '@/app/backend/runtime/services/toolExecution/types';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_TIMEOUT_MS = 60_000;
const MAX_OUTPUT_BYTES = 24_000;

function appendOutput(
    existing: Uint8Array,
    chunk: Uint8Array | string,
    limit: number
): { buffer: Uint8Array; truncated: boolean } {
    const nextChunk = typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk);
    if (existing.byteLength >= limit) {
        return {
            buffer: existing,
            truncated: true,
        };
    }

    const available = limit - existing.byteLength;
    if (nextChunk.byteLength <= available) {
        return {
            buffer: Buffer.concat([existing, nextChunk]),
            truncated: false,
        };
    }

    return {
        buffer: Buffer.concat([existing, nextChunk.subarray(0, available)]),
        truncated: true,
    };
}

function resolveTimeoutMs(args: Record<string, unknown>): number {
    const requested = Math.floor(readNumberArg(args, 'timeoutMs', DEFAULT_TIMEOUT_MS));
    if (!Number.isFinite(requested)) {
        return DEFAULT_TIMEOUT_MS;
    }

    return Math.max(1, Math.min(requested, MAX_TIMEOUT_MS));
}

function resolveShellInvocation(command: string): { file: string; args: string[] } {
    if (process.platform === 'win32') {
        return {
            file: 'powershell.exe',
            args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command],
        };
    }

    return {
        file: '/bin/sh',
        args: ['-lc', command],
    };
}

function okResult<T, E>(value: T): Result<T, E> {
    return ok(value);
}

function errResult<T, E>(error: E): Result<T, E> {
    return err(error);
}

export async function runCommandToolHandler(
    args: Record<string, unknown>,
    context: {
        cwd: string;
    }
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    const command = readStringArg(args, 'command');
    if (!command) {
        return err({
            code: 'invalid_args',
            message: 'Missing "command" argument.',
        });
    }

    const timeoutMs = resolveTimeoutMs(args);
    const invocation = resolveShellInvocation(command);

    return new Promise((resolve) => {
        const startedAt = Date.now();
        let stdout: Uint8Array = Buffer.alloc(0);
        let stderr: Uint8Array = Buffer.alloc(0);
        let stdoutTruncated = false;
        let stderrTruncated = false;
        let timedOut = false;
        let settled = false;

        const child = spawn(invocation.file, invocation.args, {
            cwd: context.cwd,
            windowsHide: true,
        });

        const timeout = setTimeout(() => {
            timedOut = true;
            child.kill();
        }, timeoutMs);

        child.stdout.on('data', (chunk: Buffer | string) => {
            const appended = appendOutput(stdout, chunk, MAX_OUTPUT_BYTES);
            stdout = appended.buffer;
            stdoutTruncated = stdoutTruncated || appended.truncated;
        });

        child.stderr.on('data', (chunk: Buffer | string) => {
            const appended = appendOutput(stderr, chunk, MAX_OUTPUT_BYTES);
            stderr = appended.buffer;
            stderrTruncated = stderrTruncated || appended.truncated;
        });

        child.on('error', (error) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);
            resolve(
                errResult({
                    code: 'execution_failed',
                    message: error.message,
                })
            );
        });

        child.on('close', (exitCode) => {
            if (settled) {
                return;
            }
            settled = true;
            clearTimeout(timeout);

            resolve(
                okResult({
                    command,
                    cwd: context.cwd,
                    exitCode,
                    stdout: Buffer.from(stdout).toString('utf8'),
                    stderr: Buffer.from(stderr).toString('utf8'),
                    stdoutTruncated,
                    stderrTruncated,
                    timedOut,
                    durationMs: Date.now() - startedAt,
                })
            );
        });
    });
}
