import { err, ok } from 'neverthrow';

import { mcpService } from '@/app/backend/runtime/services/mcp/service';
import { invokeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers';
import type {
    AllowedToolInvocation,
    ToolDispatchExecutionResult,
    ToolRequestContext,
} from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';
import type { ToolExecutionArtifactCandidate } from '@/app/backend/runtime/services/toolExecution/types';

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isToolExecutionArtifactCandidate(value: unknown): value is ToolExecutionArtifactCandidate {
    return (
        isRecord(value) &&
        (value['kind'] === 'command_output' ||
            value['kind'] === 'file_read' ||
            value['kind'] === 'directory_listing' ||
            value['kind'] === 'search_results') &&
        value['contentType'] === 'text/plain' &&
        typeof value['rawText'] === 'string' &&
        isRecord(value['metadata'])
    );
}

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
                  ...(context.executionRoot?.kind === 'workspace' || context.executionRoot?.kind === 'sandbox'
                      ? {
                            cwd: context.executionRoot.absolutePath,
                            executionRoot: {
                                kind: context.executionRoot.kind,
                                label: context.executionRoot.label,
                                absolutePath: context.executionRoot.absolutePath,
                            },
                        }
                      : {}),
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

    const artifactCandidate = isToolExecutionArtifactCandidate(execution.value['artifactCandidate'])
        ? execution.value['artifactCandidate']
        : undefined;
    const output =
        artifactCandidate === undefined
            ? execution.value
            : Object.fromEntries(Object.entries(execution.value).filter(([key]) => key !== 'artifactCandidate'));

    return {
        kind: 'executed',
        toolId: context.definition.tool.id,
        output,
        ...(artifactCandidate ? { artifactCandidate } : {}),
        at: context.at,
        policy: allowed.policy,
    };
}
