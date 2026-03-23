import type { ProfileInput } from '@/app/backend/runtime/contracts/types/common';

export interface ProjectWorkflowRecord {
    id: string;
    label: string;
    command: string;
    enabled: boolean;
    createdAt: string;
    updatedAt: string;
}

export interface ProjectWorkflowListInput extends ProfileInput {
    workspaceFingerprint: string;
}

export interface ProjectWorkflowCreateInput extends ProjectWorkflowListInput {
    label: string;
    command: string;
    enabled: boolean;
}

export interface ProjectWorkflowUpdateInput extends ProjectWorkflowListInput {
    workflowId: string;
    label: string;
    command: string;
    enabled: boolean;
}

export interface ProjectWorkflowDeleteInput extends ProjectWorkflowListInput {
    workflowId: string;
    confirm: boolean;
}
