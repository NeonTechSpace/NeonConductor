import { err, ok } from 'neverthrow';

import type { ToolInvocationObservabilityContext, ToolInvokeInput } from '@/app/backend/runtime/contracts';
import { mcpService } from '@/app/backend/runtime/services/mcp/service';
import { publishToolStateChangedObservabilityEvent } from '@/app/backend/runtime/services/observability/publishers';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import {
    buildBlockedToolOutcome,
    buildDeniedToolOutcome,
} from '@/app/backend/runtime/services/toolExecution/blocked';
import {
    boundaryDefaultPolicy,
    boundaryResource,
    resolveToolDecision,
} from '@/app/backend/runtime/services/toolExecution/decision';
import {
    emitToolCompletedEvent,
    emitToolFailedEvent,
} from '@/app/backend/runtime/services/toolExecution/events';
import { invokeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers';
import { findToolById } from '@/app/backend/runtime/services/toolExecution/lookup';
import { serializeToolInvocationOutcome } from '@/app/backend/runtime/services/toolExecution/results';
import { isIgnoredWorkspacePath, isPathInsideWorkspace, resolveWorkspaceToolPath } from '@/app/backend/runtime/services/toolExecution/safety';
import {
    buildShellApprovalContext,
    type ShellApprovalContext,
} from '@/app/backend/runtime/services/toolExecution/shellApproval';
import type {
    ResolvedToolDefinition,
    ToolBlockedInvocationOutcome,
    ToolDispatchInvocationOutcome,
    ToolExecutionPolicy,
    ToolExecutionResult,
    ToolInvocationOutcome,
} from '@/app/backend/runtime/services/toolExecution/types';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import { appLog } from '@/app/main/logging';

interface ToolRequestContext {
    at: string;
    args: Record<string, unknown>;
    executionArgs: Record<string, unknown>;
    definition: ResolvedToolDefinition;
    shellApprovalContext: ShellApprovalContext | null;
    workspaceFingerprint?: string;
    workspaceLabel?: string;
    workspaceRootPath?: string;
    workspaceRequirement:
        | 'not_required'
        | 'resolved'
        | 'detached_scope'
        | 'workspace_unresolved';
    resolvedWorkspacePath?: {
        absolutePath: string;
        workspaceRootPath: string;
    };
}

interface AllowedToolInvocation {
    kind: 'allow';
    resource: string;
    policy: ToolExecutionPolicy;
}

type BlockedToolOutcome = ToolBlockedInvocationOutcome;
type DispatchToolOutcome = ToolDispatchInvocationOutcome;

function toolLogContext(input: ToolInvokeInput, toolId: string, source?: string) {
    return {
        profileId: input.profileId,
        toolId,
        ...(source ? { source } : {}),
        topLevelTab: input.topLevelTab,
        modeKey: input.modeKey,
    };
}

function createFailedToolOutcome(input: {
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

async function resolveToolRequestContext(input: ToolInvokeInput): Promise<ToolRequestContext | ToolInvocationOutcome> {
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

async function resolveToolBoundaryDecision(input: {
    request: ToolInvokeInput;
    context: ToolRequestContext;
    executionPreset: 'privacy' | 'standard' | 'yolo';
}): Promise<BlockedToolOutcome | null> {
    const { context, request } = input;
    const toolId = context.definition.tool.id;

    if (context.workspaceRequirement === 'detached_scope') {
        return buildDeniedToolOutcome({
            profileId: request.profileId,
            toolId,
            resource: boundaryResource(toolId, 'workspace_required'),
            policy: {
                effective: 'deny',
                source: 'detached_scope',
            },
            reason: 'detached_scope',
            message: `Tool "${toolId}" requires a workspace-bound thread. Detached chat has no file authority.`,
            args: context.args,
            at: context.at,
        });
    }

    if (context.workspaceRequirement === 'workspace_unresolved') {
        return buildDeniedToolOutcome({
            profileId: request.profileId,
            toolId,
            resource: boundaryResource(toolId, 'workspace_required'),
            policy: {
                effective: 'deny',
                source: 'workspace_unresolved',
            },
            reason: 'workspace_unresolved',
            message: `Tool "${toolId}" could not resolve the workspace root for this thread.`,
            args: context.args,
            at: context.at,
        });
    }

    if (!context.resolvedWorkspacePath || !context.workspaceLabel) {
        return null;
    }

    if (
        !context.definition.tool.allowsExternalPaths &&
        !isPathInsideWorkspace(
            context.resolvedWorkspacePath.absolutePath,
            context.resolvedWorkspacePath.workspaceRootPath
        )
    ) {
        const decision = await resolveToolDecision({
            profileId: request.profileId,
            topLevelTab: request.topLevelTab,
            modeKey: request.modeKey,
            executionPreset: input.executionPreset,
            capabilities: context.definition.tool.capabilities,
            ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            resource: boundaryResource(toolId, 'outside_workspace'),
            scopeKind: 'boundary',
            toolDefaultPolicy: boundaryDefaultPolicy(input.executionPreset),
            summary: {
                title: 'Outside Workspace Access',
                detail: `${context.definition.tool.label} wants to access a path outside ${context.workspaceLabel}.`,
            },
            denyMessage: `Tool "${toolId}" cannot access paths outside the registered workspace root in the current safety preset.`,
            askMessage: `Tool "${toolId}" needs approval to access a path outside the registered workspace root.`,
            denyReason: 'outside_workspace',
        });

        if (decision.kind !== 'allow') {
            return buildBlockedToolOutcome({
                decision,
                profileId: request.profileId,
                toolId,
                args: context.args,
                at: context.at,
                ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            });
        }
    }

    if (
        !context.definition.tool.allowsIgnoredPaths &&
        isIgnoredWorkspacePath(
            context.resolvedWorkspacePath.absolutePath,
            context.resolvedWorkspacePath.workspaceRootPath
        )
    ) {
        const decision = await resolveToolDecision({
            profileId: request.profileId,
            topLevelTab: request.topLevelTab,
            modeKey: request.modeKey,
            executionPreset: input.executionPreset,
            capabilities: context.definition.tool.capabilities,
            ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            resource: boundaryResource(toolId, 'ignored_path'),
            scopeKind: 'boundary',
            toolDefaultPolicy: boundaryDefaultPolicy(input.executionPreset),
            summary: {
                title: 'Ignored Path Access',
                detail: `${context.definition.tool.label} wants to access an ignored path inside ${context.workspaceLabel}.`,
            },
            denyMessage: `Tool "${toolId}" cannot access ignored paths in the current safety preset.`,
            askMessage: `Tool "${toolId}" needs approval to access an ignored path.`,
            denyReason: 'ignored_path',
        });

        if (decision.kind !== 'allow') {
            return buildBlockedToolOutcome({
                decision,
                profileId: request.profileId,
                toolId,
                args: context.args,
                at: context.at,
                ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
            });
        }
    }

    return null;
}

async function resolveToolApprovalDecision(input: {
    request: ToolInvokeInput;
    context: ToolRequestContext;
    executionPreset: 'privacy' | 'standard' | 'yolo';
}): Promise<AllowedToolInvocation | BlockedToolOutcome> {
    const { context, request } = input;
    const toolId = context.definition.tool.id;
    const decision = await resolveToolDecision({
        profileId: request.profileId,
        topLevelTab: request.topLevelTab,
        modeKey: request.modeKey,
        executionPreset: input.executionPreset,
        capabilities: context.definition.tool.capabilities,
        resource: context.shellApprovalContext?.commandResource ?? context.definition.resource,
        ...(context.shellApprovalContext?.overrideResources.length
            ? { resourceCandidates: context.shellApprovalContext.overrideResources }
            : {}),
        ...(context.shellApprovalContext?.commandResource
            ? { onceResource: context.shellApprovalContext.commandResource }
            : {}),
        ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
        scopeKind: 'tool',
        toolDefaultPolicy: context.definition.tool.permissionPolicy,
        summary: {
            title:
                toolId === 'run_command'
                    ? 'Shell Command Approval'
                    : `${context.definition.tool.label} Request`,
            detail:
                toolId === 'run_command'
                    ? `${input.executionPreset} preset requires approval for "${context.shellApprovalContext?.commandText ?? ''}" in ${context.workspaceLabel ?? 'the active workspace'}.`
                    : `${context.definition.tool.label} wants to run in ${request.topLevelTab}/${request.modeKey}.`,
        },
        ...(context.shellApprovalContext?.approvalCandidates
            ? { approvalCandidates: context.shellApprovalContext.approvalCandidates }
            : {}),
        ...(context.shellApprovalContext?.commandText
            ? { commandText: context.shellApprovalContext.commandText }
            : {}),
        denyMessage:
            toolId === 'run_command'
                ? 'Tool "run_command" is only available in workspace-bound agent.code and agent.debug sessions.'
                : `Tool "${toolId}" is denied by current safety policy.`,
        askMessage:
            toolId === 'run_command'
                ? `Shell approval is required before running "${context.shellApprovalContext?.commandText ?? ''}"${context.workspaceRootPath ? ` in ${context.workspaceRootPath}` : ''}.`
                : `Tool "${toolId}" requires permission approval.`,
    });

    if (decision.kind !== 'allow') {
        return buildBlockedToolOutcome({
            decision,
            profileId: request.profileId,
            toolId,
            args: context.args,
            at: context.at,
            ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
        });
    }

    return {
        kind: 'allow',
        resource: decision.resource,
        policy: decision.policy,
    };
}

async function dispatchToolInvocation(input: {
    request: ToolInvokeInput;
    context: ToolRequestContext;
    allowed: AllowedToolInvocation;
}): Promise<DispatchToolOutcome> {
    const { allowed, context, request } = input;

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
        await emitToolFailedEvent({
            toolId: context.definition.tool.id,
            profileId: request.profileId,
            resource: allowed.resource,
            policy: 'allow',
            source: allowed.policy.source,
            error: execution.error.message,
        });

        return createFailedToolOutcome({
            toolId: context.definition.tool.id,
            error: execution.error.code,
            message: execution.error.message,
            args: context.args,
            at: context.at,
            policy: allowed.policy,
        });
    }

    await emitToolCompletedEvent({
        toolId: context.definition.tool.id,
        profileId: request.profileId,
        resource: allowed.resource,
        policy: 'allow',
        source: allowed.policy.source,
    });

    return {
        kind: 'executed',
        toolId: context.definition.tool.id,
        output: execution.value,
        at: context.at,
        policy: allowed.policy,
    };
}

function publishBlockedOutcomeObservability(input: {
    request: ToolInvokeInput;
    outcome: BlockedToolOutcome;
    observability: ToolInvocationObservabilityContext | undefined;
}): void {
    if (!input.observability) {
        return;
    }

    publishToolStateChangedObservabilityEvent({
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state: input.outcome.kind === 'approval_required' ? 'approval_required' : 'denied',
        argumentsText: input.observability.argumentsText,
        ...(input.outcome.kind === 'approval_required' ? { requestId: input.outcome.requestId } : {}),
        policySource: input.outcome.policy.source,
    });
}

function publishAllowedExecutionObservability(input: {
    request: ToolInvokeInput;
    observability: ToolInvocationObservabilityContext | undefined;
    policy: ToolExecutionPolicy;
}): void {
    if (!input.observability) {
        return;
    }

    publishToolStateChangedObservabilityEvent({
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state: 'approved',
        argumentsText: input.observability.argumentsText,
        policySource: input.policy.source,
    });
    publishToolStateChangedObservabilityEvent({
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state: 'executing',
        argumentsText: input.observability.argumentsText,
        policySource: input.policy.source,
    });
}

function publishDispatchOutcomeObservability(input: {
    request: ToolInvokeInput;
    outcome: DispatchToolOutcome;
    observability: ToolInvocationObservabilityContext | undefined;
}): void {
    if (!input.observability) {
        return;
    }

    const state: 'completed' | 'failed' = input.outcome.kind === 'executed' ? 'completed' : 'failed';
    const event = {
        profileId: input.request.profileId,
        sessionId: input.observability.sessionId,
        runId: input.observability.runId,
        providerId: input.observability.providerId,
        modelId: input.observability.modelId,
        toolCallId: input.observability.toolCallId,
        toolName: input.observability.toolName,
        state,
        argumentsText: input.observability.argumentsText,
        ...(input.outcome.kind === 'failed' ? { error: input.outcome.message } : {}),
        ...(input.outcome.policy ? { policySource: input.outcome.policy.source } : {}),
    };

    publishToolStateChangedObservabilityEvent(event);
}

function logBlockedOutcome(input: {
    request: ToolInvokeInput;
    outcome: BlockedToolOutcome;
}): void {
    appLog[input.outcome.kind === 'denied' ? 'warn' : 'info']({
        tag: 'tool-execution',
        message:
            input.outcome.kind === 'denied'
                ? 'Blocked tool invocation by deny policy.'
                : 'Tool invocation requires permission approval.',
        ...toolLogContext(input.request, input.outcome.toolId, input.outcome.policy.source),
        ...(input.outcome.kind === 'approval_required' ? { requestId: input.outcome.requestId } : {}),
    });
}

function logDispatchOutcome(input: {
    request: ToolInvokeInput;
    outcome: DispatchToolOutcome;
}): void {
    if (input.outcome.kind === 'failed') {
        appLog.warn({
            tag: 'tool-execution',
            message: 'Tool invocation failed.',
            ...toolLogContext(input.request, input.outcome.toolId, input.outcome.policy?.source),
            errorCode: input.outcome.error,
            errorMessage: input.outcome.message,
        });
        return;
    }

    appLog.debug({
        tag: 'tool-execution',
        message: 'Completed tool invocation.',
        ...toolLogContext(input.request, input.outcome.toolId, input.outcome.policy.source),
    });
}

export class ToolExecutionService {
    async invoke(
        input: ToolInvokeInput,
        observability?: ToolInvocationObservabilityContext
    ): Promise<ToolExecutionResult> {
        const outcome = await this.invokeWithOutcome(input, observability);
        return serializeToolInvocationOutcome(outcome);
    }

    async invokeWithOutcome(
        input: ToolInvokeInput,
        observability?: ToolInvocationObservabilityContext
    ): Promise<ToolInvocationOutcome> {
        const requestContext = await resolveToolRequestContext(input);
        if ('kind' in requestContext) {
            return requestContext;
        }

        const executionPreset = await getExecutionPreset(input.profileId);
        const boundaryOutcome = await resolveToolBoundaryDecision({
            request: input,
            context: requestContext,
            executionPreset,
        });
        if (boundaryOutcome) {
            logBlockedOutcome({
                request: input,
                outcome: boundaryOutcome,
            });
            publishBlockedOutcomeObservability({
                request: input,
                outcome: boundaryOutcome,
                observability,
            });
            return boundaryOutcome;
        }

        const approvalDecision = await resolveToolApprovalDecision({
            request: input,
            context: requestContext,
            executionPreset,
        });
        if ('kind' in approvalDecision && approvalDecision.kind !== 'allow') {
            logBlockedOutcome({
                request: input,
                outcome: approvalDecision,
            });
            publishBlockedOutcomeObservability({
                request: input,
                outcome: approvalDecision,
                observability,
            });
            return approvalDecision;
        }

        publishAllowedExecutionObservability({
            request: input,
            observability,
            policy: approvalDecision.policy,
        });

        const dispatchOutcome = await dispatchToolInvocation({
            request: input,
            context: requestContext,
            allowed: approvalDecision,
        });
        logDispatchOutcome({
            request: input,
            outcome: dispatchOutcome,
        });
        publishDispatchOutcomeObservability({
            request: input,
            outcome: dispatchOutcome,
            observability,
        });
        return dispatchOutcome;
    }
}

export const toolExecutionService = new ToolExecutionService();
