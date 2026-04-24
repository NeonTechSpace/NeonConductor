import { err, ok, type Result } from 'neverthrow';
import { Buffer } from 'node:buffer';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import readline from 'node:readline';

import { vendoredRipgrepResolver } from '@/app/backend/runtime/services/environment/vendoredRipgrepResolver';
import { readBooleanArg, readNumberArg, readStringArg } from '@/app/backend/runtime/services/toolExecution/args';
import {
    requireFileToolExecutionRoot,
    type ToolHandlerExecutionContext,
} from '@/app/backend/runtime/services/toolExecution/handlers/context';
import { resolveCanonicalReadToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import { createSearchFilesExecutionOutput } from '@/app/backend/runtime/services/toolExecution/toolOutputCompressionPolicy';
import type {
    SearchFilesMatch,
    ToolExecutionFailure,
    ToolExecutionOutput,
} from '@/app/backend/runtime/services/toolExecution/types';

const DEFAULT_MAX_MATCHES = 100;
const MAX_MATCHES_HARD_LIMIT = 500;

interface RipgrepTextPayload {
    text?: string;
    bytes?: string;
}

interface RipgrepMatchEvent {
    type: 'match';
    data: {
        path: RipgrepTextPayload;
        lines: RipgrepTextPayload;
        line_number: number;
        submatches: Array<{
            start: number;
            end: number;
        }>;
    };
}

function decodeRipgrepTextPayload(payload: RipgrepTextPayload): string | null {
    if (typeof payload.text === 'string') {
        return payload.text;
    }

    if (typeof payload.bytes === 'string') {
        return Buffer.from(payload.bytes, 'base64').toString('utf8');
    }

    return null;
}

function trimTrailingLineBreak(text: string): string {
    return text.replace(/[\r\n]+$/u, '');
}

function resolveMaxMatches(args: Record<string, unknown>): number {
    const requested = Math.floor(readNumberArg(args, 'maxMatches', DEFAULT_MAX_MATCHES));
    if (!Number.isFinite(requested)) {
        return DEFAULT_MAX_MATCHES;
    }

    return Math.max(1, Math.min(requested, MAX_MATCHES_HARD_LIMIT));
}

function parseMatchEvent(rawLine: string): RipgrepMatchEvent | null {
    try {
        const parsed = JSON.parse(rawLine) as { type?: string; data?: RipgrepMatchEvent['data'] };
        if (parsed.type !== 'match' || !parsed.data) {
            return null;
        }

        return {
            type: 'match',
            data: parsed.data,
        };
    } catch {
        return null;
    }
}

function buildSearchMatches(event: RipgrepMatchEvent): SearchFilesMatch[] {
    const pathText = decodeRipgrepTextPayload(event.data.path);
    const lineText = decodeRipgrepTextPayload(event.data.lines);
    if (!pathText || lineText === null) {
        return [];
    }

    const normalizedLineText = trimTrailingLineBreak(lineText);
    return event.data.submatches.map((submatch) => {
        const prefixBytes = Buffer.from(lineText, 'utf8').subarray(0, submatch.start);
        const columnNumber = prefixBytes.toString('utf8').length + 1;
        return {
            path: pathText,
            lineNumber: event.data.line_number,
            columnNumber,
            lineText: normalizedLineText,
        } satisfies SearchFilesMatch;
    });
}

export async function searchFilesToolHandler(
    args: Record<string, unknown>,
    context?: ToolHandlerExecutionContext
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    const query = readStringArg(args, 'query');
    if (!query) {
        return err({
            code: 'invalid_args',
            message: 'Missing "query" argument.',
        });
    }

    const executionRoot = requireFileToolExecutionRoot(context);
    if (!executionRoot) {
        return err({
            code: 'execution_failed',
            message: 'Tool "search_files" requires resolved execution-root authority.',
        });
    }

    const pathArg = readStringArg(args, 'path');
    const searchedPathResult = await resolveCanonicalReadToolPath({
        executionRoot,
        ...(pathArg ? { targetPath: pathArg } : {}),
    });
    if (searchedPathResult.isErr()) {
        return err(searchedPathResult.error);
    }

    const searchedPath = searchedPathResult.value.absolutePath;
    const caseSensitive = readBooleanArg(args, 'caseSensitive', false);
    const maxMatches = resolveMaxMatches(args);
    const ripgrep = await vendoredRipgrepResolver.resolve();
    const ripgrepExecutablePath = ripgrep.executablePath;
    if (!ripgrep.available || !ripgrepExecutablePath) {
        return err({
            code: 'execution_failed',
            message:
                ripgrep.reason === 'unsupported_target'
                    ? 'search_files is not supported on this platform yet.'
                    : 'The vendored ripgrep binary is missing. Run the ripgrep vendor step before using search_files.',
        });
    }

    return await new Promise((resolve) => {
        const matches: SearchFilesMatch[] = [];
        const stderrChunks: Buffer[] = [];
        let settled = false;
        let truncated = false;
        let stoppedAfterMatchLimit = false;

        const child: ChildProcessWithoutNullStreams = spawn(
            ripgrepExecutablePath,
            [
                '--json',
                '--fixed-strings',
                '--no-config',
                ...(caseSensitive ? [] : ['--ignore-case']),
                '--',
                query,
                searchedPath,
            ],
            {
                windowsHide: true,
                stdio: 'pipe',
            }
        );

        const closeWithError = (message: string) => {
            if (settled) {
                return;
            }

            settled = true;
            lineReader.close();
            const result: Result<ToolExecutionOutput, ToolExecutionFailure> = err({
                code: 'execution_failed',
                message,
            });
            result.match(
                () => undefined,
                () => undefined
            );
            resolve(result);
        };

        const closeWithSuccess = () => {
            if (settled) {
                return;
            }

            settled = true;
            lineReader.close();
            const executionOutput = createSearchFilesExecutionOutput({
                searchedPath,
                query,
                caseSensitive,
                maxMatches,
                matches,
                truncated,
            });
            const result: Result<ToolExecutionOutput, ToolExecutionFailure> = ok({
                ...executionOutput.output,
                artifactCandidate: executionOutput.artifactCandidate,
            });
            result.match(
                () => undefined,
                () => undefined
            );
            resolve(result);
        };

        const lineReader = readline.createInterface({
            input: child.stdout,
            crlfDelay: Number.POSITIVE_INFINITY,
        });

        lineReader.on('line', (line) => {
            if (settled || line.trim().length === 0) {
                return;
            }

            const event = parseMatchEvent(line);
            if (!event) {
                return;
            }

            for (const match of buildSearchMatches(event)) {
                if (matches.length >= maxMatches) {
                    truncated = true;
                    stoppedAfterMatchLimit = true;
                    child.kill();
                    return;
                }

                matches.push(match);
            }
        });

        child.stderr.on('data', (chunk: Buffer | string) => {
            stderrChunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : Buffer.from(chunk));
        });

        child.on('error', (error: Error) => {
            closeWithError(error.message);
        });

        child.on('close', (exitCode: number | null, signal: NodeJS.Signals | null) => {
            if (settled) {
                return;
            }

            if (stoppedAfterMatchLimit) {
                closeWithSuccess();
                return;
            }

            if (exitCode === 0 || exitCode === 1) {
                closeWithSuccess();
                return;
            }

            const stderrText = Buffer.concat(stderrChunks).toString('utf8').trim();
            const failureMessage =
                stderrText.length > 0
                    ? stderrText
                    : `ripgrep exited unexpectedly with code ${String(exitCode)}${signal ? ` (signal: ${signal})` : ''}.`;
            closeWithError(failureMessage);
        });
    });
}
