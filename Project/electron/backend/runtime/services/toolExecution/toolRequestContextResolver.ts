import { findToolById } from '@/app/backend/runtime/services/toolExecution/lookup';
import { resolveWorkspaceToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import type { ToolRequestContext } from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';
import type {
    ToolExecutionPolicy,
    ToolInvocationOutcome,
} from '@/app/backend/runtime/services/toolExecution/types';
import type { ToolInvokeInput } from '@/app/backend/runtime/contracts';
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

    let workspaceRequirement: ToolRequestContext['workspaceRequirement'] = 'not_required';
    let workspaceRootPath: string | undefined;
    let workspaceLabel: string | undefined;
    let resolvedWorkspacePath: ToolRequestContext['resolvedWorkspacePath'];

    if (definition.tool.requiresWorkspace) {
        workspaceRequirement = 'detached_scope';

        if (input.workspaceFingerprint) {
            const workspaceContext = await workspaceContextService.resolveExplicit({
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
            });

            if (workspaceContext.kind !== 'detached') {
                workspaceRequirement = 'resolved';
                workspaceRootPath = workspaceContext.absolutePath;
                workspaceLabel = workspaceContext.label;
            } else {
                workspaceRequirement = 'workspace_unresolved';
            }
        }
    }

    let executionArgs = args;
    if (
        workspaceRequirement === 'resolved' &&
        workspaceRootPath &&
        (definition.tool.id === 'read_file' || definition.tool.id === 'list_files')
    ) {
        const requestedPath = typeof args['path'] === 'string' ? args['path'] : undefined;
        resolvedWorkspacePath = resolveWorkspaceToolPath(
            requestedPath
                ? {
                      workspaceRootPath,
                      targetPath: requestedPath,
                  }
                : {
                      workspaceRootPath,
                  }
        );
        executionArgs = {
            ...args,
            path: resolvedWorkspacePath.absolutePath,
        };
    }

    const shellApprovalContext =
        definition.tool.id === 'run_command'
            ? (() => {
                  const commandArg = typeof args['command'] === 'string' ? args['command'].trim() : '';
                  return commandArg.length > 0 ? buildShellApprovalContext(commandArg) : null;
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

    return {
        at,
        args,
        executionArgs,
        definition,
        shellApprovalContext,
        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        ...(workspaceLabel ? { workspaceLabel } : {}),
        ...(workspaceRootPath ? { workspaceRootPath } : {}),
        workspaceRequirement,
        ...(resolvedWorkspacePath ? { resolvedWorkspacePath } : {}),
    };
}
