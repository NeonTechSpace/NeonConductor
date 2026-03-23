import { permissionStore, toolStore } from '@/app/backend/persistence/stores';
import type { EntityId } from '@/app/backend/runtime/contracts';
import { getExecutionPreset } from '@/app/backend/runtime/services/profile/executionPreset';
import { resolveOverrideAndPresetPermissionPolicy } from '@/app/backend/runtime/services/permissions/policyResolver';
import { runtimeStatusEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { invokeToolHandler } from '@/app/backend/runtime/services/toolExecution/handlers';
import { buildShellApprovalContext } from '@/app/backend/runtime/services/toolExecution/shellApproval';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';

export type BranchWorkflowExecutionResult =
    | {
          status: 'not_requested';
      }
    | {
          status: 'succeeded';
      }
    | {
          status: 'approval_required';
          requestId: EntityId<'perm'>;
          message: string;
      }
    | {
          status: 'failed';
          message: string;
      };

export class WorkflowExecutionService {
    async executeBranchWorkflow(input: {
        profileId: string;
        workspaceFingerprint: string;
        sandboxId?: EntityId<'sb'>;
        command: string;
    }): Promise<BranchWorkflowExecutionResult> {
        const shellApprovalContext = buildShellApprovalContext(input.command);
        const runCommandTool = (await toolStore.list()).find((tool) => tool.id === 'run_command');
        if (!runCommandTool) {
            throw new Error('Shell tool catalog entry "run_command" is missing.');
        }

        const resolvedWorkspace = await workspaceContextService.resolveExplicit({
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
            ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
        });
        if (resolvedWorkspace.kind === 'detached') {
            return {
                status: 'failed',
                message: 'Workflow execution requires a workspace-bound branch target.',
            };
        }

        const resolvedPolicy = await resolveOverrideAndPresetPermissionPolicy({
            profileId: input.profileId,
            resource: shellApprovalContext.commandResource,
            resourceCandidates: shellApprovalContext.overrideResources,
            executionPreset: await getExecutionPreset(input.profileId),
            capabilities: runCommandTool.capabilities,
            workspaceFingerprint: input.workspaceFingerprint,
            toolDefaultPolicy: runCommandTool.permissionPolicy,
        });

        if (resolvedPolicy.policy === 'deny') {
            return {
                status: 'failed',
                message: `Workflow command "${shellApprovalContext.commandText}" is denied by the current shell safety policy.`,
            };
        }

        if (resolvedPolicy.policy === 'ask') {
            const onceApproval = await permissionStore.consumeGrantedOnce({
                profileId: input.profileId,
                resource: shellApprovalContext.commandResource,
                workspaceFingerprint: input.workspaceFingerprint,
            });
            if (!onceApproval) {
                const request = await permissionStore.create({
                    profileId: input.profileId,
                    policy: 'ask',
                    resource: shellApprovalContext.commandResource,
                    toolId: runCommandTool.id,
                    workspaceFingerprint: input.workspaceFingerprint,
                    scopeKind: 'tool',
                    summary: {
                        title: 'Workflow Shell Approval',
                        detail: `Branch workflow wants to run "${shellApprovalContext.commandText}" in ${resolvedWorkspace.absolutePath}.`,
                    },
                    commandText: shellApprovalContext.commandText,
                    approvalCandidates: shellApprovalContext.approvalCandidates,
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
                    status: 'approval_required',
                    requestId: request.id,
                    message: `Workflow command "${shellApprovalContext.commandText}" needs shell approval before it can run.`,
                };
            }
        }

        const execution = await invokeToolHandler(
            runCommandTool,
            {
                command: shellApprovalContext.commandText,
            },
            {
                cwd: resolvedWorkspace.absolutePath,
            }
        );
        if (execution.isErr()) {
            return {
                status: 'failed',
                message: execution.error.message,
            };
        }
        if (execution.value.timedOut) {
            return {
                status: 'failed',
                message: `Workflow command "${shellApprovalContext.commandText}" timed out.`,
            };
        }
        if (typeof execution.value.exitCode === 'number' && execution.value.exitCode !== 0) {
            const stderr = typeof execution.value.stderr === 'string' ? execution.value.stderr.trim() : '';
            const stdout = typeof execution.value.stdout === 'string' ? execution.value.stdout.trim() : '';
            const detail = stderr || stdout || `Exit code ${String(execution.value.exitCode)}`;
            return {
                status: 'failed',
                message: detail,
            };
        }

        return {
            status: 'succeeded',
        };
    }
}

export const workflowExecutionService = new WorkflowExecutionService();
