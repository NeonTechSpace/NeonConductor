import type { ToolInvokeInput } from '@/app/backend/runtime/contracts';
import { buildBlockedToolOutcome } from '@/app/backend/runtime/services/toolExecution/blocked';
import { resolveToolDecision } from '@/app/backend/runtime/services/toolExecution/decision';
import type {
    ToolApprovalDecisionResult,
    ToolRequestContext,
} from '@/app/backend/runtime/services/toolExecution/toolExecutionLifecycle.types';

export async function resolveToolApprovalDecision(input: {
    request: ToolInvokeInput;
    context: ToolRequestContext;
    executionPreset: 'privacy' | 'standard' | 'yolo';
}): Promise<ToolApprovalDecisionResult> {
    const { context, request } = input;
    const toolId = context.definition.tool.id;
    const exactExecutionResource =
        context.executeCodeApprovalContext?.codeResource ??
        context.shellApprovalContext?.commandResource ??
        context.definition.resource;
    const executionRootPath =
        context.executionRoot?.kind === 'workspace' || context.executionRoot?.kind === 'sandbox'
            ? context.executionRoot.absolutePath
            : context.workspaceRootPath;
    const decision = await resolveToolDecision({
        profileId: request.profileId,
        topLevelTab: request.topLevelTab,
        modeKey: request.modeKey,
        executionPreset: input.executionPreset,
        capabilities: context.definition.tool.capabilities,
        mutability: context.definition.tool.mutability,
        resource: exactExecutionResource,
        ...(context.shellApprovalContext?.overrideResources.length
            ? { resourceCandidates: context.shellApprovalContext.overrideResources }
            : {}),
        ...(context.shellApprovalContext?.commandResource
            ? { onceResource: context.shellApprovalContext.commandResource }
            : {}),
        ...(context.executeCodeApprovalContext?.codeResource
            ? { onceResource: context.executeCodeApprovalContext.codeResource }
            : {}),
        ...(request.workspaceFingerprint ? { workspaceFingerprint: request.workspaceFingerprint } : {}),
        scopeKind: 'tool',
        toolDefaultPolicy: context.definition.tool.permissionPolicy,
        summary: {
            title:
                toolId === 'run_command'
                    ? 'Shell Command Approval'
                    : toolId === 'execute_code'
                      ? 'JavaScript Code Approval'
                      : `${context.definition.tool.label} Request`,
            detail:
                toolId === 'run_command'
                    ? `${input.executionPreset} preset requires approval for "${context.shellApprovalContext?.commandText ?? ''}" in ${context.workspaceLabel ?? 'the active workspace'}.`
                    : toolId === 'execute_code'
                      ? `${input.executionPreset} preset requires approval to execute JavaScript code with SHA-256 prefix ${context.executeCodeApprovalContext?.codeDigest ?? ''} in ${context.workspaceLabel ?? 'the active workspace'}.\n\n${context.executeCodeApprovalContext?.codePreview ?? ''}`
                      : `${context.definition.tool.label} wants to run in ${request.topLevelTab}/${request.modeKey}.`,
        },
        ...(context.shellApprovalContext?.approvalCandidates
            ? { approvalCandidates: context.shellApprovalContext.approvalCandidates }
            : {}),
        ...(context.shellApprovalContext?.commandText ? { commandText: context.shellApprovalContext.commandText } : {}),
        denyMessage:
            toolId === 'run_command'
                ? 'Tool "run_command" is only available in workspace-bound agent.code and agent.debug sessions.'
                : toolId === 'execute_code'
                  ? 'Tool "execute_code" is only available in workspace-bound code-runtime sessions.'
                  : `Tool "${toolId}" is denied by current safety policy.`,
        askMessage:
            toolId === 'run_command'
                ? `Shell approval is required before running "${context.shellApprovalContext?.commandText ?? ''}"${executionRootPath ? ` in ${executionRootPath}` : ''}.`
                : toolId === 'execute_code'
                  ? `JavaScript execution approval is required before running execute_code (SHA-256 prefix ${context.executeCodeApprovalContext?.codeDigest ?? 'unknown'}).`
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
