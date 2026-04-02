import {
    createParser,
    readBoolean,
    readObject,
    readProfileId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    ProjectBranchWorkflowCreateInput,
    ProjectBranchWorkflowDeleteInput,
    ProjectBranchWorkflowListInput,
    ProjectBranchWorkflowUpdateInput,
} from '@/app/backend/runtime/contracts/types/branchWorkflow';

export function parseProjectBranchWorkflowListInput(input: unknown): ProjectBranchWorkflowListInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
    };
}

export function parseProjectBranchWorkflowCreateInput(input: unknown): ProjectBranchWorkflowCreateInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
        label: readString(source.label, 'label'),
        command: readString(source.command, 'command'),
        enabled: readBoolean(source.enabled, 'enabled'),
    };
}

export function parseProjectBranchWorkflowUpdateInput(input: unknown): ProjectBranchWorkflowUpdateInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
        branchWorkflowId: readString(source.branchWorkflowId, 'branchWorkflowId'),
        label: readString(source.label, 'label'),
        command: readString(source.command, 'command'),
        enabled: readBoolean(source.enabled, 'enabled'),
    };
}

export function parseProjectBranchWorkflowDeleteInput(input: unknown): ProjectBranchWorkflowDeleteInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
        branchWorkflowId: readString(source.branchWorkflowId, 'branchWorkflowId'),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export const projectBranchWorkflowListInputSchema = createParser(parseProjectBranchWorkflowListInput);
export const projectBranchWorkflowCreateInputSchema = createParser(parseProjectBranchWorkflowCreateInput);
export const projectBranchWorkflowUpdateInputSchema = createParser(parseProjectBranchWorkflowUpdateInput);
export const projectBranchWorkflowDeleteInputSchema = createParser(parseProjectBranchWorkflowDeleteInput);
