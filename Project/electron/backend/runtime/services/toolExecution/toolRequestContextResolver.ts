import type { ToolInvokeInput } from '@/app/backend/runtime/contracts';
import { toResolvedExecutionRoot } from '@/app/backend/runtime/contracts';
import { buildExecuteCodeApprovalContext } from '@/app/backend/runtime/services/toolExecution/executeCodeApproval';
import { findToolById } from '@/app/backend/runtime/services/toolExecution/lookup';
import { resolveExecutionRootToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import type { ToolRequestContext } from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';
import type { ToolExecutionPolicy, ToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/types';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import { appLog } from '@/app/main/logging';

export type ToolRequestContextResolution = ToolRequestContext | Extract<ToolInvocationOutcome, { kind: 'failed' }>;

function toolLogContext(input: ToolInvokeInput, toolId: string, source?: string) {
    return {
        profileId: input.profileId,
        toolId,
        ...(source ? { source } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    };
}

export function createFailedToolOutcome(input: {
    toolId: string;
    error: 'tool_not_found' | 'invalid_args' | 'not_implemented' | 'execution_failed';
    message: string;
    args: Record<string, unknown>;
    at: string;
    policy?: ToolExecutionPolicy;
}): Extract<ToolInvocationOutcome, { kind: 'failed' }> {
    return {
        kind: 'failed',
        toolId: input.toolId,
        error: input.error,
        message: input.message,
        args: input.args,
        at: input.at,
        ...(input.policy ? { policy: input.policy } : {}),
    };
}

export async function resolveToolRequestContext(input: ToolInvokeInput): Promise<ToolRequestContextResolution> {
    const at = new Date().toISOString();
    const args = input.args ?? {};
    const definition = await findToolById(input.toolId);

    if (!definition) {
        appLog.warn({
            tag: 'tool-execution',
            message: 'Rejected tool invocation because tool was not found.',
            ...toolLogContext(input, input.toolId),
        });
        return createFailedToolOutcome({
            toolId: input.toolId,
            error: 'tool_not_found',
            message: `Tool "${input.toolId}" was not found.`,
            args,
            at,
        });
    }

    let executionRootRequirement: ToolRequestContext['executionRootRequirement'] = 'not_required';
    let executionRoot: ToolRequestContext['executionRoot'];
    let executionLabel: string | undefined;
    let resolvedExecutionPath: ToolRequestContext['resolvedExecutionPath'];

    if (definition.tool.requiresWorkspace) {
        executionRootRequirement = 'detached_scope';

        if (input.workspaceFingerprint) {
            const workspaceContext = await workspaceContextService.resolveExplicit({
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
            });
            executionRoot = toResolvedExecutionRoot(workspaceContext);

            if (executionRoot.kind === 'workspace' || executionRoot.kind === 'sandbox') {
                executionRootRequirement = 'resolved';
                executionLabel = executionRoot.label;
            } else if (executionRoot.kind === 'unresolved') {
                executionRootRequirement = 'unresolved';
                executionLabel = executionRoot.label;
            } else {
                executionRootRequirement = 'detached_scope';
            }
        }
    }

    const executionArgs = args;
    if (
        executionRootRequirement === 'resolved' &&
        executionRoot &&
        (executionRoot.kind === 'workspace' || executionRoot.kind === 'sandbox') &&
        (definition.tool.id === 'read_file' ||
            definition.tool.id === 'list_files' ||
            definition.tool.id === 'search_files' ||
            definition.tool.id === 'write_file')
    ) {
        const requestedPath = typeof args['path'] === 'string' ? args['path'] : undefined;
        resolvedExecutionPath = resolveExecutionRootToolPath(
            requestedPath
                ? {
                      executionRootPath: executionRoot.absolutePath,
                      targetPath: requestedPath,
                  }
                : {
                      executionRootPath: executionRoot.absolutePath,
                  }
        );
    }

    const shellApprovalContext =
        definition.tool.id === 'run_command'
            ? (() => {
                  const commandArg = typeof args['command'] === 'string' ? args['command'].trim() : '';
                  return commandArg.length > 0 ? buildShellApprovalContext(commandArg) : null;
              })()
            : null;
    const executeCodeApprovalContext =
        definition.tool.id === 'execute_code'
            ? (() => {
                  const codeArg = typeof args['code'] === 'string' ? args['code'] : '';
                  return codeArg.trim().length > 0 ? buildExecuteCodeApprovalContext(codeArg) : null;
              })()
            : null;

    if (definition.tool.id === 'run_command' && !shellApprovalContext) {
        return createFailedToolOutcome({
            toolId: definition.tool.id,
            error: 'invalid_args',
            message: 'Missing "command" argument.',
            args,
            at,
        });
    }

    if (definition.tool.id === 'execute_code' && !executeCodeApprovalContext) {
        return createFailedToolOutcome({
            toolId: definition.tool.id,
            error: 'invalid_args',
            message: 'Missing "code" argument.',
            args,
            at,
        });
    }

    return {
        at,
        args,
        executionArgs,
        definition,
        shellApprovalContext,
        executeCodeApprovalContext,
        executionRootRequirement,
        ...(executionRoot ? { executionRoot } : {}),
        ...(resolvedExecutionPath ? { resolvedExecutionPath } : {}),
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(executionLabel ? { workspaceLabel: executionLabel } : {}),
    };
}
