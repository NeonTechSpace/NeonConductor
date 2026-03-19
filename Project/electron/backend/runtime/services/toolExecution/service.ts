import type { ToolInvokeInput } from '@/app/backend/runtime/contracts';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { buildBlockedToolResult } from '@/app/backend/runtime/services/toolExecution/blocked';
import {
    boundaryDefaultPolicy,
    boundaryResource,
    resolveToolDecision,
} from '@/app/backend/runtime/services/toolExecution/decision';
import {
    emitToolBlockedEvent,
    emitToolCompletedEvent,
    emitToolFailedEvent,
} from '@/app/backend/runtime/services/toolExecution/events';
import { invokeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers';
import { findToolById } from '@/app/backend/runtime/services/toolExecution/lookup';
import { errorToolResult, okToolResult } from '@/app/backend/runtime/services/toolExecution/results';
import { isIgnoredWorkspacePath, isPathInsideWorkspace, resolveWorkspaceToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import type { ToolExecutionResult } from '@/app/backend/runtime/services/toolExecution/types';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import { appLog } from '@/app/main/logging';

function toolLogContext(input: ToolInvokeInput, toolId: string, source?: string) {
    return {
        profileId: input.profileId,
        toolId,
        ...(source ? { source } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    };
}

export class ToolExecutionService {
    async invoke(input: ToolInvokeInput): Promise<ToolExecutionResult> {
        const at = new Date().toISOString();
        const args = input.args ?? {};
        const definition = await findToolById(input.toolId);

        if (!definition) {
            appLog.warn({
                tag: 'tool-execution',
                message: 'Rejected tool invocation because tool was not found.',
                ...toolLogContext(input, input.toolId),
            });
            return errorToolResult({
                toolId: input.toolId,
                error: 'tool_not_found',
                message: `Tool "${input.toolId}" was not found.`,
                args,
                at,
            });
        }

        const executionPreset = await getExecutionPreset(input.profileId);
        let workspaceRootPath: string | undefined;
        let workspaceLabel: string | undefined;
        let executionArgs = args;
        if (definition.tool.requiresWorkspace) {
            if (!input.workspaceFingerprint) {
                const policy = {
                    effective: 'deny',
                    source: 'detached_scope',
                } as const;
                await emitToolBlockedEvent({
                    toolId: definition.tool.id,
                    profileId: input.profileId,
                    resource: boundaryResource(definition.tool.id, 'workspace_required'),
                    policy: 'deny',
                    source: policy.source,
                    reason: 'detached_scope',
                });

                return errorToolResult({
                    toolId: definition.tool.id,
                    error: 'policy_denied',
                    message: `Tool "${definition.tool.id}" requires a workspace-bound thread. Detached chat has no file authority.`,
                    args,
                    at,
                    policy,
                });
            }

            const workspaceContext = await workspaceContextService.resolveExplicit({
                profileId: input.profileId,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
            });
            if (workspaceContext.kind === 'detached') {
                const policy = {
                    effective: 'deny',
                    source: 'workspace_unresolved',
                } as const;
                await emitToolBlockedEvent({
                    toolId: definition.tool.id,
                    profileId: input.profileId,
                    resource: boundaryResource(definition.tool.id, 'workspace_required'),
                    policy: 'deny',
                    source: policy.source,
                    reason: 'workspace_unresolved',
                });

                return errorToolResult({
                    toolId: definition.tool.id,
                    error: 'policy_denied',
                    message: `Tool "${definition.tool.id}" could not resolve the workspace root for this thread.`,
                    args,
                    at,
                    policy,
                });
            }

            workspaceRootPath = workspaceContext.absolutePath;
            workspaceLabel = workspaceContext.label;

            if (definition.tool.id === 'read_file' || definition.tool.id === 'list_files') {
                const requestedPath = typeof args['path'] === 'string' ? args['path'] : undefined;
                const resolvedPath = resolveWorkspaceToolPath(
                    requestedPath
                        ? {
                              workspaceRootPath,
                              targetPath: requestedPath,
                          }
                        : {
                              workspaceRootPath,
                          }
                );

                if (
                    !definition.tool.allowsExternalPaths &&
                    !isPathInsideWorkspace(resolvedPath.absolutePath, resolvedPath.workspaceRootPath)
                ) {
                    const decision = await resolveToolDecision({
                        profileId: input.profileId,
                        topLevelTab: input.topLevelTab,
                        modeKey: input.modeKey,
                        executionPreset,
                        capabilities: definition.tool.capabilities,
                        workspaceFingerprint: input.workspaceFingerprint,
                        resource: boundaryResource(definition.tool.id, 'outside_workspace'),
                        scopeKind: 'boundary',
                        toolDefaultPolicy: boundaryDefaultPolicy(executionPreset),
                        summary: {
                            title: 'Outside Workspace Access',
                            detail: `${definition.tool.label} wants to access a path outside ${workspaceLabel}.`,
                        },
                        denyMessage: `Tool "${definition.tool.id}" cannot access paths outside the registered workspace root in the current safety preset.`,
                        askMessage: `Tool "${definition.tool.id}" needs approval to access a path outside the registered workspace root.`,
                        denyReason: 'outside_workspace',
                    });

                    if (decision.kind !== 'allow') {
                        return buildBlockedToolResult({
                            decision,
                            profileId: input.profileId,
                            toolId: definition.tool.id,
                            args,
                            at,
                            workspaceFingerprint: input.workspaceFingerprint,
                        });
                    }
                }

                if (
                    !definition.tool.allowsIgnoredPaths &&
                    isIgnoredWorkspacePath(resolvedPath.absolutePath, resolvedPath.workspaceRootPath)
                ) {
                    const decision = await resolveToolDecision({
                        profileId: input.profileId,
                        topLevelTab: input.topLevelTab,
                        modeKey: input.modeKey,
                        executionPreset,
                        capabilities: definition.tool.capabilities,
                        workspaceFingerprint: input.workspaceFingerprint,
                        resource: boundaryResource(definition.tool.id, 'ignored_path'),
                        scopeKind: 'boundary',
                        toolDefaultPolicy: boundaryDefaultPolicy(executionPreset),
                        summary: {
                            title: 'Ignored Path Access',
                            detail: `${definition.tool.label} wants to access an ignored path inside ${workspaceLabel}.`,
                        },
                        denyMessage: `Tool "${definition.tool.id}" cannot access ignored paths in the current safety preset.`,
                        askMessage: `Tool "${definition.tool.id}" needs approval to access an ignored path.`,
                        denyReason: 'ignored_path',
                    });

                    if (decision.kind !== 'allow') {
                        return buildBlockedToolResult({
                            decision,
                            profileId: input.profileId,
                            toolId: definition.tool.id,
                            args,
                            at,
                            workspaceFingerprint: input.workspaceFingerprint,
                        });
                    }
                }

                executionArgs = {
                    ...args,
                    path: resolvedPath.absolutePath,
                };
            }
        }

        const shellApprovalContext =
            definition.tool.id === 'run_command'
                ? (() => {
                      const commandArg = typeof args['command'] === 'string' ? args['command'].trim() : '';
                      return commandArg.length > 0 ? buildShellApprovalContext(commandArg) : null;
                  })()
                : null;
        if (definition.tool.id === 'run_command' && !shellApprovalContext) {
            return errorToolResult({
                toolId: definition.tool.id,
                error: 'invalid_args',
                message: 'Missing "command" argument.',
                args,
                at,
            });
        }

        const decision = await resolveToolDecision({
            profileId: input.profileId,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            executionPreset,
            capabilities: definition.tool.capabilities,
            resource: shellApprovalContext?.commandResource ?? definition.resource,
            ...(shellApprovalContext?.overrideResources.length
                ? { resourceCandidates: shellApprovalContext.overrideResources }
                : {}),
            ...(shellApprovalContext?.commandResource ? { onceResource: shellApprovalContext.commandResource } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            scopeKind: 'tool',
            toolDefaultPolicy: definition.tool.permissionPolicy,
            summary: {
                title:
                    definition.tool.id === 'run_command'
                        ? 'Shell Command Approval'
                        : `${definition.tool.label} Request`,
                detail:
                    definition.tool.id === 'run_command'
                        ? `${executionPreset} preset requires approval for "${shellApprovalContext?.commandText ?? ''}" in ${workspaceLabel ?? 'the active workspace'}.`
                        : `${definition.tool.label} wants to run in ${input.topLevelTab}/${input.modeKey}.`,
            },
            ...(shellApprovalContext?.approvalCandidates
                ? { approvalCandidates: shellApprovalContext.approvalCandidates }
                : {}),
            ...(shellApprovalContext?.commandText ? { commandText: shellApprovalContext.commandText } : {}),
            denyMessage:
                definition.tool.id === 'run_command'
                    ? 'Tool "run_command" is only available in workspace-bound agent.code and agent.debug sessions.'
                    : `Tool "${definition.tool.id}" is denied by current safety policy.`,
            askMessage:
                definition.tool.id === 'run_command'
                    ? `Shell approval is required before running "${shellApprovalContext?.commandText ?? ''}"${workspaceRootPath ? ` in ${workspaceRootPath}` : ''}.`
                    : `Tool "${definition.tool.id}" requires permission approval.`,
        });

        if (decision.kind !== 'allow') {
            const blockedResult = await buildBlockedToolResult({
                decision,
                profileId: input.profileId,
                toolId: definition.tool.id,
                args,
                at,
                ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            });
            appLog[decision.kind === 'deny' ? 'warn' : 'info']({
                tag: 'tool-execution',
                message:
                    decision.kind === 'deny'
                        ? 'Blocked tool invocation by deny policy.'
                        : 'Tool invocation requires permission approval.',
                ...toolLogContext(input, definition.tool.id, decision.policy.source),
                ...('requestId' in blockedResult && blockedResult.requestId ? { requestId: blockedResult.requestId } : {}),
            });
            return blockedResult;
        }

        const execution = await invokeToolHandler(definition.tool, executionArgs, {
            ...(workspaceRootPath ? { cwd: workspaceRootPath } : {}),
        });
        if (execution.isOk()) {
            await emitToolCompletedEvent({
                toolId: definition.tool.id,
                profileId: input.profileId,
                resource: decision.resource,
                policy: 'allow',
                source: decision.policy.source,
            });

            appLog.debug({
                tag: 'tool-execution',
                message: 'Completed tool invocation.',
                ...toolLogContext(input, definition.tool.id, decision.policy.source),
            });
            return okToolResult({
                toolId: definition.tool.id,
                output: execution.value,
                at,
                policy: decision.policy,
            });
        }

        await emitToolFailedEvent({
            toolId: definition.tool.id,
            profileId: input.profileId,
            resource: decision.resource,
            policy: 'allow',
            source: decision.policy.source,
            error: execution.error.message,
        });

        appLog.warn({
            tag: 'tool-execution',
            message: 'Tool invocation failed.',
            ...toolLogContext(input, definition.tool.id, decision.policy.source),
            errorCode: execution.error.code,
            errorMessage: execution.error.message,
        });
        return errorToolResult({
            toolId: definition.tool.id,
            error: execution.error.code,
            message: execution.error.message,
            args,
            at,
            policy: decision.policy,
        });
    }
}

export const toolExecutionService = new ToolExecutionService();
