import { err, ok } from 'neverthrow';

import { mcpService } from '@/app/backend/runtime/services/mcp/service';
import { invokeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers';
import type {
    AllowedToolInvocation,
    ToolDispatchExecutionResult,
    ToolRequestContext,
} from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';

export async function dispatchToolInvocation(input: {
    context: ToolRequestContext;
    allowed: AllowedToolInvocation;
}): Promise<ToolDispatchExecutionResult> {
    const { allowed, context } = input;

    const execution =
        context.definition.source === 'mcp'
            ? await (async () => {
                  const output = await mcpService.invokeTool({
                      toolId: context.definition.tool.id,
                      args: context.executionArgs,
                  });
                  if (output.isErr()) {
                      return err({
                          code: 'execution_failed' as const,
                          message: output.error.message,
                      });
                  }

                  return ok(output.value);
              })()
            : await invokeToolHandler(context.definition.tool, context.executionArgs, {
                  ...(context.workspaceRootPath ? { cwd: context.workspaceRootPath } : {}),
              });

    if (execution.isErr()) {
        return {
            kind: 'failed',
            toolId: context.definition.tool.id,
            error: execution.error.code,
            message: execution.error.message,
            args: context.args,
            at: context.at,
            policy: allowed.policy,
        };
    }

    return {
        kind: 'executed',
        toolId: context.definition.tool.id,
        output: execution.value,
        at: context.at,
        policy: allowed.policy,
    };
}
