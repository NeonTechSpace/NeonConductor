import { err, type Result } from 'neverthrow';

import type { ToolRecord } from '@/app/backend/persistence/types';
import type { ToolHandlerExecutionContext } from '@/app/backend/runtime/services/toolExecution/handlers/context';
import { executeCodeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/executeCode';
import { listFilesToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/listFiles';
import { readFileToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/readFile';
import { runCommandToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/runCommand';
import { searchFilesToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/searchFiles';
import { writeFileToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers/writeFile';
import type { ToolExecutionFailure, ToolExecutionOutput } from '@/app/backend/runtime/services/toolExecution/types';

export function invokeToolHandler(
    tool: ToolRecord,
    args: Record<string, unknown>,
    context?: ToolHandlerExecutionContext
): Promise<Result<ToolExecutionOutput, ToolExecutionFailure>> {
    if (tool.id === 'list_files') {
        return listFilesToolHandler(args, context);
    }

    if (tool.id === 'read_file') {
        return readFileToolHandler(args, context);
    }

    if (tool.id === 'search_files') {
        return searchFilesToolHandler(args, context);
    }

    if (tool.id === 'write_file') {
        return writeFileToolHandler(args, context);
    }

    if (tool.id === 'run_command') {
        if (!context?.cwd) {
            return Promise.resolve(
                err({
                    code: 'execution_failed',
                    message: 'Tool "run_command" requires a resolved workspace root.',
                })
            );
        }

        return runCommandToolHandler(args, {
            cwd: context.cwd,
            ...(context.signal ? { signal: context.signal } : {}),
        });
    }

    if (tool.id === 'execute_code') {
        return executeCodeToolHandler(args);
    }

    return Promise.resolve(
        err({
            code: 'not_implemented',
            message: `Tool "${tool.id}" is not implemented.`,
        })
    );
}
