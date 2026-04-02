import type { ProjectBranchWorkflowRecord } from '@/app/backend/runtime/contracts';
import type { FlowDefinitionRecord } from '@/app/backend/runtime/contracts/types/flow';

export function adaptBranchWorkflowToFlowDefinition(
    branchWorkflow: ProjectBranchWorkflowRecord
): FlowDefinitionRecord {
    return {
        id: branchWorkflow.id,
        label: branchWorkflow.label,
        enabled: branchWorkflow.enabled,
        triggerKind: 'manual',
        steps: [
            {
                kind: 'legacy_command',
                id: `${branchWorkflow.id}:legacy_command`,
                label: branchWorkflow.label,
                command: branchWorkflow.command,
            },
        ],
        createdAt: branchWorkflow.createdAt,
        updatedAt: branchWorkflow.updatedAt,
    };
}
