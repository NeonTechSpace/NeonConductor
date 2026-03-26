import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

export interface WorkspaceCreateRequestInput {
    absolutePath: string;
    label: string;
    defaultTopLevelTab: TopLevelTab;
    defaultProviderId: RuntimeProviderId;
    defaultModelId: string;
}

export interface SubmitWorkspaceCreateRequestInput {
    onCreateWorkspace: (input: WorkspaceCreateRequestInput) => Promise<void>;
    onClose: () => void;
    createWorkspaceInput: WorkspaceCreateRequestInput;
}

function readWorkspaceCreateErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'Workspace could not be created.';
}

export async function submitWorkspaceCreateRequest(
    input: SubmitWorkspaceCreateRequestInput
): Promise<string | undefined> {
    try {
        await input.onCreateWorkspace(input.createWorkspaceInput);
        input.onClose();
        return undefined;
    } catch (error) {
        return readWorkspaceCreateErrorMessage(error);
    }
}
