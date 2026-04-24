import { permissionStore, toolStore } from '@/app/backend/persistence/stores';
import type { PermissionRecord } from '@/app/backend/persistence/types';
import type { FlowExecutionContext, FlowLegacyCommandStepDefinition } from '@/app/backend/runtime/contracts';
import { resolveOverrideAndPresetPermissionPolicy } from '@/app/backend/runtime/services/permissions/policyResolver';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { invokeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

export type FlowLegacyCommandExecutionResult =
    | { kind: 'succeeded' }
    | { kind: 'cancelled'; reason: string }
    | { kind: 'failed'; message: string }
    | { kind: 'approval_required'; request: PermissionRecord; message: string };

function wasAborted(signal: AbortSignal): boolean {
    return signal.aborted;
}

export async function executeFlowLegacyCommandStep(input: {
    profileId: string;
    flowInstanceId: string;
    stepIndex: number;
    step: FlowLegacyCommandStepDefinition;
    executionContext?: FlowExecutionContext;
    signal: AbortSignal;
}): Promise<FlowLegacyCommandExecutionResult> {
    const shellApprovalContext = buildShellApprovalContext(input.step.command);
    const runCommandTool = (await toolStore.list()).find((tool) => tool.id === 'run_command');
    if (!runCommandTool) {
        throw new Error('Shell tool catalog entry "run_command" is missing.');
    }

    const resolvedWorkspace = await workspaceContextService.resolveExplicit({
        profileId: input.profileId,
        ...(input.executionContext?.workspaceFingerprint
            ? { workspaceFingerprint: input.executionContext.workspaceFingerprint }
            : {}),
        ...(input.executionContext?.sandboxId ? { sandboxId: input.executionContext.sandboxId } : {}),
    });
    if (resolvedWorkspace.kind !== 'workspace' && resolvedWorkspace.kind !== 'sandbox') {
        return {
            kind: 'failed',
            message: 'Flow legacy-command steps require a workspace-bound execution context.',
        };
    }

    const resolvedPolicy = await resolveOverrideAndPresetPermissionPolicy({
        profileId: input.profileId,
        resource: shellApprovalContext.commandResource,
        resourceCandidates: shellApprovalContext.overrideResources,
        executionPreset: await getExecutionPreset(input.profileId),
        capabilities: runCommandTool.capabilities,
        ...(input.executionContext?.workspaceFingerprint
            ? { workspaceFingerprint: input.executionContext.workspaceFingerprint }
            : {}),
        toolDefaultPolicy: runCommandTool.permissionPolicy,
    });

    if (resolvedPolicy.policy === 'deny') {
        return {
            kind: 'failed',
            message: `Flow command "${shellApprovalContext.commandText}" is denied by the current shell safety policy.`,
        };
    }

    if (resolvedPolicy.policy === 'ask') {
        const onceApproval = await permissionStore.consumeGrantedOnce({
            profileId: input.profileId,
            resource: shellApprovalContext.commandResource,
            ...(input.executionContext?.workspaceFingerprint
                ? { workspaceFingerprint: input.executionContext.workspaceFingerprint }
                : {}),
        });
        if (!onceApproval) {
            const request = await permissionStore.create({
                profileId: input.profileId,
                policy: 'ask',
                resource: shellApprovalContext.commandResource,
                toolId: runCommandTool.id,
                scopeKind: 'tool',
                summary: {
                    title: 'Flow Shell Approval',
                    detail: `Flow wants to run "${shellApprovalContext.commandText}" in ${resolvedWorkspace.absolutePath}.`,
                },
                ...(input.executionContext?.workspaceFingerprint
                    ? { workspaceFingerprint: input.executionContext.workspaceFingerprint }
                    : {}),
                commandText: shellApprovalContext.commandText,
                approvalCandidates: shellApprovalContext.approvalCandidates,
                flowInstanceId: input.flowInstanceId,
                flowStepIndex: input.stepIndex,
                flowStepId: input.step.id,
            });
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'permission',
                    domain: 'permission',
                    entityId: request.id,
                    eventType: 'permission.requested',
                    payload: {
                        request,
                    },
                })
            );

            return {
                kind: 'approval_required',
                request,
                message: `Flow command "${shellApprovalContext.commandText}" needs shell approval before it can run.`,
            };
        }
    }

    if (wasAborted(input.signal)) {
        return {
            kind: 'cancelled',
            reason: 'Flow execution was cancelled.',
        };
    }

    const execution = await invokeToolHandler(
        runCommandTool,
        {
            command: shellApprovalContext.commandText,
        },
        {
            cwd: resolvedWorkspace.absolutePath,
            signal: input.signal,
        }
    );

    if (wasAborted(input.signal)) {
        return {
            kind: 'cancelled',
            reason: 'Flow execution was cancelled.',
        };
    }

    if (execution.isErr()) {
        return {
            kind: 'failed',
            message: execution.error.message,
        };
    }
    if (execution.value.timedOut) {
        return {
            kind: 'failed',
            message: `Flow command "${shellApprovalContext.commandText}" timed out.`,
        };
    }
    if (typeof execution.value.exitCode === 'number' && execution.value.exitCode !== 0) {
        const stderr = typeof execution.value.stderr === 'string' ? execution.value.stderr.trim() : '';
        const stdout = typeof execution.value.stdout === 'string' ? execution.value.stdout.trim() : '';
        return {
            kind: 'failed',
            message: stderr || stdout || `Exit code ${String(execution.value.exitCode)}`,
        };
    }

    return {
        kind: 'succeeded',
    };
}
