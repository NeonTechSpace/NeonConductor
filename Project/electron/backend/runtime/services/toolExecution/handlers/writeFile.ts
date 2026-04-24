import { err, ok, type Result } from 'neverthrow';
import { Buffer } from 'node:buffer';
import { stat, writeFile } from 'node:fs/promises';

import { readBooleanArg, readStringArg } from '@/app/backend/runtime/services/toolExecution/args';
import {
    requireFileToolExecutionRoot,
    type ToolHandlerExecutionContext,
} from '@/app/backend/runtime/services/toolExecution/handlers/context';
import { resolveCanonicalWriteToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import type { ToolExecutionFailure, ToolExecutionOutput } from '@/app/backend/runtime/services/toolExecution/types';

function countLines(text: string): number {
    if (text.length === 0) {
        return 0;
    }

    return text.split(/\r\n|\r|\n/u).length;
}

export async function writeFileToolHandler(
    args: Record<string, unknown>,
    context?: ToolHandlerExecutionContext
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    const fileArg = readStringArg(args, 'path');
    if (!fileArg) {
        return err({
            code: 'invalid_args',
            message: 'Missing "path" argument.',
        });
    }

    const contentValue = args['content'];
    if (typeof contentValue !== 'string') {
        return err({
            code: 'invalid_args',
            message: 'Missing "content" argument.',
        });
    }
    const content = contentValue;

    const executionRoot = requireFileToolExecutionRoot(context);
    if (!executionRoot) {
        return err({
            code: 'execution_failed',
            message: 'Tool "write_file" requires resolved execution-root authority.',
        });
    }

    const targetPathResult = await resolveCanonicalWriteToolPath({
        executionRoot,
        targetPath: fileArg,
    });
    if (targetPathResult.isErr()) {
        return err(targetPathResult.error);
    }

    const targetPath = targetPathResult.value.absolutePath;
    const overwrite = readBooleanArg(args, 'overwrite', false);
    const contentBuffer = Buffer.from(content, 'utf8');

    try {
        const existingTarget = await stat(targetPath).catch((error: unknown) => {
            if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
                return null;
            }

            throw error;
        });

        if (existingTarget?.isDirectory()) {
            return err({
                code: 'execution_failed',
                message: 'write_file cannot replace a directory path.',
            });
        }

        if (existingTarget && !overwrite) {
            return err({
                code: 'execution_failed',
                message: 'Target file already exists. Set "overwrite" to true to replace it.',
            });
        }

        await writeFile(targetPath, contentBuffer, {
            encoding: 'utf8',
            flag: overwrite ? 'w' : 'wx',
        });

        return ok({
            path: targetPath,
            byteLength: contentBuffer.byteLength,
            lineCount: countLines(content),
            overwroteExisting: existingTarget !== null,
            createdParentDirectories: targetPathResult.value.createdParentDirectories,
        });
    } catch (error) {
        return err({
            code: 'execution_failed',
            message: error instanceof Error ? error.message : String(error),
        });
    }
}
