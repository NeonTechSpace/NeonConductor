import { err, ok, type Result } from 'neverthrow';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { readBooleanArg, readNumberArg, readStringArg } from '@/app/backend/runtime/services/toolExecution/args';
import {
    requireFileToolExecutionRoot,
    type ToolHandlerExecutionContext,
} from '@/app/backend/runtime/services/toolExecution/handlers/context';
import { resolveCanonicalReadToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import { createDirectoryListingExecutionOutput } from '@/app/backend/runtime/services/toolExecution/toolOutputCompressionPolicy';
import type {
    ToolExecutionFailure,
    ToolExecutionOutput,
    ToolOutputEntry,
} from '@/app/backend/runtime/services/toolExecution/types';

export async function listFilesToolHandler(
    args: Record<string, unknown>,
    context?: ToolHandlerExecutionContext
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    const executionRoot = requireFileToolExecutionRoot(context);
    if (!executionRoot) {
        return err({
            code: 'execution_failed',
            message: 'Tool "list_files" requires resolved execution-root authority.',
        });
    }

    const pathArg = readStringArg(args, 'path');
    const rootPathResult = await resolveCanonicalReadToolPath({
        executionRoot,
        ...(pathArg ? { targetPath: pathArg } : {}),
    });
    if (rootPathResult.isErr()) {
        return err(rootPathResult.error);
    }

    const rootPath = rootPathResult.value.absolutePath;
    const includeHidden = readBooleanArg(args, 'includeHidden', false);
    const recursive = readBooleanArg(args, 'recursive', false);
    const maxEntries = Math.max(1, Math.floor(readNumberArg(args, 'maxEntries', 200)));
    const entries: ToolOutputEntry[] = [];
    const queue = [rootPath];

    try {
        while (queue.length > 0 && entries.length < maxEntries) {
            const current = queue.shift();
            if (!current) {
                continue;
            }

            const dirents = await readdir(current, { withFileTypes: true });
            for (const dirent of dirents) {
                if (!includeHidden && dirent.name.startsWith('.')) {
                    continue;
                }

                const itemPath = path.join(current, dirent.name);
                if (dirent.isDirectory()) {
                    entries.push({ path: itemPath, kind: 'directory' });
                    if (recursive) {
                        queue.push(itemPath);
                    }
                } else if (dirent.isFile()) {
                    entries.push({ path: itemPath, kind: 'file' });
                }

                if (entries.length >= maxEntries) {
                    break;
                }
            }
        }

        const executionOutput = createDirectoryListingExecutionOutput({
            rootPath,
            entries,
            truncated: queue.length > 0 || entries.length >= maxEntries,
            count: entries.length,
        });

        return ok({
            ...executionOutput.output,
            artifactCandidate: executionOutput.artifactCandidate,
        });
    } catch (error) {
        return err({
            code: 'execution_failed',
            message: error instanceof Error ? error.message : String(error),
        });
    }
}
