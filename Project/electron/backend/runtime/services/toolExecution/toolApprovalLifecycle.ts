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
            title: toolId === 'run_command' ? 'Shell Command Approval' : `${context.definition.tool.label} Request`,
            detail:
                toolId === 'run_command'
                    ? `${input.executionPreset} preset requires approval for "${context.shellApprovalContext?.commandText ?? ''}" in ${context.workspaceLabel ?? 'the active workspace'}.`
                    : `${context.definition.tool.label} wants to run in ${request.topLevelTab}/${request.modeKey}.`,
        },
        ...(context.shellApprovalContext?.approvalCandidates
            ? { approvalCandidates: context.shellApprovalContext.approvalCandidates }
            : {}),
        ...(context.shellApprovalContext?.commandText ? { commandText: context.shellApprovalContext.commandText } : {}),
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
