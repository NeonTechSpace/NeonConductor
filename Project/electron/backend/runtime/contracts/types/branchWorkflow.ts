import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface ProjectBranchWorkflowRecord {
    id: string;
    label: string;
    command: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectBranchWorkflowListInput extends ProfileInput {
    workspaceFingerprint: string;
}

export interface ProjectBranchWorkflowCreateInput extends ProjectBranchWorkflowListInput {
    label: string;
    command: string;
    enabled: boolean;
}

export interface ProjectBranchWorkflowUpdateInput extends ProjectBranchWorkflowListInput {
    branchWorkflowId: string;
    label: string;
    command: string;
    enabled: boolean;
}

export interface ProjectBranchWorkflowDeleteInput extends ProjectBranchWorkflowListInput {
    branchWorkflowId: string;
    confirm: boolean;
}
