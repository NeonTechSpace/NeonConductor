import { useState } from 'react';

import { trpc } from '@/web/trpc/client';

import { launchBackgroundTask } from '@/shared/async/launchBackgroundTask';
import type { ProjectBranchWorkflowRecord } from '@/shared/contracts';

export type BranchWorkflowFormMode = 'create' | 'edit';

export interface BranchWorkflowDraftState {
    formMode: BranchWorkflowFormMode;
    editingBranchWorkflowId: string | undefined;
    label: string;
    command: string;
    enabled: boolean;
    isFormVisible: boolean;
    statusMessage: string | undefined;
    deleteCandidateId: string | undefined;
}

interface UseBranchWorkflowLibraryControllerInput {
    profileId: string;
    workspaceFingerprint: string;
    busy: boolean;
    onBranch: (branchWorkflowId?: string) => Promise<void>;
}

export interface BranchWorkflowLibraryController {
    branchWorkflows: ProjectBranchWorkflowRecord[];
    isLoading: boolean;
    busyForm: boolean;
    isBranchDisabled: boolean;
    draftState: BranchWorkflowDraftState;
    queryErrorMessage: string | undefined;
    branchWithoutWorkflow: () => void;
    branchWithWorkflow: (branchWorkflowId: string) => void;
    startCreateBranchWorkflowDraft: () => void;
    startEditBranchWorkflowDraft: (branchWorkflow: ProjectBranchWorkflowRecord) => void;
    updateLabel: (label: string) => void;
    updateCommand: (command: string) => void;
    updateEnabled: (enabled: boolean) => void;
    cancelBranchWorkflowDraft: () => void;
    saveBranchWorkflow: (branchAfterSave: boolean) => void;
    requestDeleteBranchWorkflow: (branchWorkflowId: string) => void;
    confirmDeleteBranchWorkflow: (branchWorkflowId: string) => void;
    cancelDeleteBranchWorkflow: () => void;
}

export function createEmptyBranchWorkflowDraftState(): BranchWorkflowDraftState {
    return {
        formMode: 'create',
        editingBranchWorkflowId: undefined,
        label: '',
        command: '',
        enabled: true,
        isFormVisible: false,
        statusMessage: undefined,
        deleteCandidateId: undefined,
    };
}

function createEditBranchWorkflowDraftState(branchWorkflow: ProjectBranchWorkflowRecord): BranchWorkflowDraftState {
    return {
        formMode: 'edit',
        editingBranchWorkflowId: branchWorkflow.id,
        label: branchWorkflow.label,
        command: branchWorkflow.command,
        enabled: branchWorkflow.enabled,
        isFormVisible: true,
        statusMessage: undefined,
        deleteCandidateId: undefined,
    };
}

export function useBranchWorkflowLibraryController(
    input: UseBranchWorkflowLibraryControllerInput
): BranchWorkflowLibraryController {
    const utils = trpc.useUtils();
    const branchWorkflowsQuery = trpc.branchWorkflow.list.useQuery(
        {
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
        },
        {
            enabled: true,
        }
    );
    const createBranchWorkflowMutation = trpc.branchWorkflow.create.useMutation();
    const updateBranchWorkflowMutation = trpc.branchWorkflow.update.useMutation();
    const deleteBranchWorkflowMutation = trpc.branchWorkflow.delete.useMutation();
    const [draftState, setDraftState] = useState(() => createEmptyBranchWorkflowDraftState());

    const busyForm =
        createBranchWorkflowMutation.isPending ||
        updateBranchWorkflowMutation.isPending ||
        deleteBranchWorkflowMutation.isPending;

    const resetBranchWorkflowDraft = () => {
        setDraftState((current) => ({
            ...createEmptyBranchWorkflowDraftState(),
            statusMessage: current.statusMessage,
        }));
    };

    const refreshList = async () => {
        await utils.branchWorkflow.list.invalidate({
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
        });
    };

    const saveBranchWorkflow = (branchAfterSave: boolean): void => {
        launchBackgroundTask(async () => {
            try {
                setDraftState((current) => ({
                    ...current,
                    statusMessage: undefined,
                }));
                if (draftState.formMode === 'edit' && draftState.editingBranchWorkflowId) {
                    const result = await updateBranchWorkflowMutation.mutateAsync({
                        profileId: input.profileId,
                        workspaceFingerprint: input.workspaceFingerprint,
                        branchWorkflowId: draftState.editingBranchWorkflowId,
                        label: draftState.label,
                        command: draftState.command,
                        enabled: draftState.enabled,
                    });
                    if (!result.updated) {
                        setDraftState((current) => ({
                            ...current,
                            statusMessage: 'The branch workflow no longer exists.',
                        }));
                        return;
                    }
                    await refreshList();
                    resetBranchWorkflowDraft();
                    if (branchAfterSave) {
                        await input.onBranch(result.branchWorkflow.id);
                    }
                    return;
                }

                const created = await createBranchWorkflowMutation.mutateAsync({
                    profileId: input.profileId,
                    workspaceFingerprint: input.workspaceFingerprint,
                    label: draftState.label,
                    command: draftState.command,
                    enabled: draftState.enabled,
                });
                await refreshList();
                resetBranchWorkflowDraft();
                if (branchAfterSave) {
                    await input.onBranch(created.branchWorkflow.id);
                }
            } catch (error) {
                setDraftState((current) => ({
                    ...current,
                    statusMessage: error instanceof Error ? error.message : 'Branch workflow save failed.',
                }));
            }
        });
    };

    const confirmDeleteBranchWorkflow = (branchWorkflowId: string): void => {
        launchBackgroundTask(async () => {
            try {
                await deleteBranchWorkflowMutation.mutateAsync({
                    profileId: input.profileId,
                    workspaceFingerprint: input.workspaceFingerprint,
                    branchWorkflowId,
                    confirm: true,
                });
                setDraftState((current) => ({
                    ...current,
                    deleteCandidateId: undefined,
                }));
                if (draftState.editingBranchWorkflowId === branchWorkflowId) {
                    resetBranchWorkflowDraft();
                }
                await refreshList();
            } catch (error: unknown) {
                setDraftState((current) => ({
                    ...current,
                    statusMessage: error instanceof Error ? error.message : 'Branch workflow delete failed.',
                }));
            }
        });
    };

    return {
        branchWorkflows: branchWorkflowsQuery.data?.branchWorkflows ?? [],
        isLoading: branchWorkflowsQuery.isLoading,
        busyForm,
        isBranchDisabled: input.busy,
        draftState,
        queryErrorMessage: branchWorkflowsQuery.error?.message,
        branchWithoutWorkflow: () => {
            launchBackgroundTask(async () => {
                await input.onBranch(undefined);
            });
        },
        branchWithWorkflow: (branchWorkflowId: string) => {
            launchBackgroundTask(async () => {
                await input.onBranch(branchWorkflowId);
            });
        },
        startCreateBranchWorkflowDraft: () => {
            setDraftState({
                ...createEmptyBranchWorkflowDraftState(),
                isFormVisible: true,
            });
        },
        startEditBranchWorkflowDraft: (branchWorkflow: ProjectBranchWorkflowRecord) => {
            setDraftState(createEditBranchWorkflowDraftState(branchWorkflow));
        },
        updateLabel: (label: string) => {
            setDraftState((current) => ({
                ...current,
                label,
            }));
        },
        updateCommand: (command: string) => {
            setDraftState((current) => ({
                ...current,
                command,
            }));
        },
        updateEnabled: (enabled: boolean) => {
            setDraftState((current) => ({
                ...current,
                enabled,
            }));
        },
        cancelBranchWorkflowDraft: resetBranchWorkflowDraft,
        saveBranchWorkflow,
        requestDeleteBranchWorkflow: (branchWorkflowId: string) => {
            setDraftState((current) => ({
                ...current,
                deleteCandidateId: branchWorkflowId,
                statusMessage: undefined,
            }));
        },
        confirmDeleteBranchWorkflow: confirmDeleteBranchWorkflow,
        cancelDeleteBranchWorkflow: () => {
            setDraftState((current) => ({
                ...current,
                deleteCandidateId: undefined,
            }));
        },
    };
}
