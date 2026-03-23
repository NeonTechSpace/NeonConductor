import {
    createParser,
    readBoolean,
    readObject,
    readProfileId,
    readString,
} from '@/app/backend/runtime/contracts/parsers/helpers';
import type {
    ProjectWorkflowCreateInput,
    ProjectWorkflowDeleteInput,
    ProjectWorkflowListInput,
    ProjectWorkflowUpdateInput,
} from '@/app/backend/runtime/contracts/types/workflow';

export function parseProjectWorkflowListInput(input: unknown): ProjectWorkflowListInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
    };
}

export function parseProjectWorkflowCreateInput(input: unknown): ProjectWorkflowCreateInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
        label: readString(source.label, 'label'),
        command: readString(source.command, 'command'),
        enabled: readBoolean(source.enabled, 'enabled'),
    };
}

export function parseProjectWorkflowUpdateInput(input: unknown): ProjectWorkflowUpdateInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
        workflowId: readString(source.workflowId, 'workflowId'),
        label: readString(source.label, 'label'),
        command: readString(source.command, 'command'),
        enabled: readBoolean(source.enabled, 'enabled'),
    };
}

export function parseProjectWorkflowDeleteInput(input: unknown): ProjectWorkflowDeleteInput {
    const source = readObject(input, 'input');

    return {
        profileId: readProfileId(source),
        workspaceFingerprint: readString(source.workspaceFingerprint, 'workspaceFingerprint'),
        workflowId: readString(source.workflowId, 'workflowId'),
        confirm: readBoolean(source.confirm, 'confirm'),
    };
}

export const projectWorkflowListInputSchema = createParser(parseProjectWorkflowListInput);
export const projectWorkflowCreateInputSchema = createParser(parseProjectWorkflowCreateInput);
export const projectWorkflowUpdateInputSchema = createParser(parseProjectWorkflowUpdateInput);
export const projectWorkflowDeleteInputSchema = createParser(parseProjectWorkflowDeleteInput);
