import { err, ok, type Result } from 'neverthrow';
import { readFile } from 'node:fs/promises';

import {
    readNumberArg,
    readStringArg,
    resolveAbsoluteToolPath,
} from '@/app/backend/runtime/services/toolExecution/args';
import type { ToolExecutionFailure, ToolExecutionOutput } from '@/app/backend/runtime/services/toolExecution/types';

export async function readFileToolHandler(
    args: Record<string, unknown>
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    const fileArg = readStringArg(args, 'path');
    if (!fileArg) {
        return err({
            code: 'invalid_args',
            message: 'Missing "path" argument.',
        });
    }

    const maxBytes = Math.max(1, Math.floor(readNumberArg(args, 'maxBytes', 200_000)));
    const targetPathResult = resolveAbsoluteToolPath(fileArg);
    if (targetPathResult.isErr()) {
        return err(targetPathResult.error);
    }

    const targetPath = targetPathResult.value;
    try {
        const buffer = await readFile(targetPath);
        const truncated = buffer.byteLength > maxBytes;
        const content = buffer.subarray(0, maxBytes).toString('utf8');

        return ok({
            path: targetPath,
            content,
            byteLength: buffer.byteLength,
            truncated,
        });
    } catch (error) {
        return err({
            code: 'execution_failed',
            message: error instanceof Error ? error.message : String(error),
        });
    }
}
