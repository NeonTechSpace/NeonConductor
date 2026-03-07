import { err, ok, type Result } from 'neverthrow';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { readBooleanArg, readNumberArg, readStringArg, resolveAbsoluteToolPath } from '@/app/backend/runtime/services/toolExecution/args';
import type {
    ToolExecutionFailure,
    ToolExecutionOutput,
    ToolOutputEntry,
} from '@/app/backend/runtime/services/toolExecution/types';

export async function listFilesToolHandler(
    args: Record<string, unknown>
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    const rootPathResult = resolveAbsoluteToolPath(readStringArg(args, 'path'));
    if (rootPathResult.isErr()) {
        return err(rootPathResult.error);
    }

    const rootPath = rootPathResult.value;
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

        return ok({
            rootPath,
            entries,
            truncated: queue.length > 0 || entries.length >= maxEntries,
            count: entries.length,
        });
    } catch (error) {
        return err({
            code: 'execution_failed',
            message: error instanceof Error ? error.message : String(error),
        });
    }
}
