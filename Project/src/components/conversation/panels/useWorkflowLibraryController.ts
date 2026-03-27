import { useState } from 'react';

import { trpc } from '@/web/trpc/client';

import type { ProjectWorkflowRecord } from '@/shared/contracts';

export type WorkflowFormMode = 'create' | 'edit';

export interface WorkflowDraftState {
    formMode: WorkflowFormMode;
    editingWorkflowId: string | undefined;
    label: string;
    command: string;
    enabled: boolean;
    isFormVisible: boolean;
    statusMessage: string | undefined;
    deleteCandidateId: string | undefined;
}

interface UseWorkflowLibraryControllerInput {
    profileId: string;
    workspaceFingerprint: string;
    busy: boolean;
    onBranch: (workflowId?: string) => Promise<void>;
}

export interface WorkflowLibraryController {
    workflows: ProjectWorkflowRecord[];
    isLoading: boolean;
    busyForm: boolean;
    isBranchDisabled: boolean;
    draftState: WorkflowDraftState;
    queryErrorMessage: string | undefined;
    branchWithoutWorkflow: () => void;
    branchWithWorkflow: (workflowId: string) => void;
    startCreateWorkflowDraft: () => void;
    startEditWorkflowDraft: (workflow: ProjectWorkflowRecord) => void;
    updateLabel: (label: string) => void;
    updateCommand: (command: string) => void;
    updateEnabled: (enabled: boolean) => void;
    cancelWorkflowDraft: () => void;
    saveWorkflow: (branchAfterSave: boolean) => void;
    requestDeleteWorkflow: (workflowId: string) => void;
    confirmDeleteWorkflow: (workflowId: string) => void;
    cancelDeleteWorkflow: () => void;
}

export function createEmptyWorkflowDraftState(): WorkflowDraftState {
    return {
        formMode: 'create',
        editingWorkflowId: undefined,
        label: '',
        command: '',
        enabled: true,
        isFormVisible: false,
        statusMessage: undefined,
        deleteCandidateId: undefined,
    };
}

function createEditWorkflowDraftState(workflow: ProjectWorkflowRecord): WorkflowDraftState {
    return {
        formMode: 'edit',
        editingWorkflowId: workflow.id,
        label: workflow.label,
        command: workflow.command,
        enabled: workflow.enabled,
        isFormVisible: true,
        statusMessage: undefined,
        deleteCandidateId: undefined,
    };
}

export function useWorkflowLibraryController(
    input: UseWorkflowLibraryControllerInput
): WorkflowLibraryController {
    const utils = trpc.useUtils();
    const workflowsQuery = trpc.workflow.list.useQuery(
        {
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
        },
        {
            enabled: true,
        }
    );
    const createWorkflowMutation = trpc.workflow.create.useMutation();
    const updateWorkflowMutation = trpc.workflow.update.useMutation();
    const deleteWorkflowMutation = trpc.workflow.delete.useMutation();
    const [draftState, setDraftState] = useState(() => createEmptyWorkflowDraftState());

    const busyForm =
        createWorkflowMutation.isPending || updateWorkflowMutation.isPending || deleteWorkflowMutation.isPending;

    const resetWorkflowDraft = () => {
        setDraftState((current) => ({
            ...createEmptyWorkflowDraftState(),
            statusMessage: current.statusMessage,
        }));
    };

    const refreshList = async () => {
        await utils.workflow.list.invalidate({
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
        });
    };

    const saveWorkflow = (branchAfterSave: boolean) => {
        void (async () => {
            setDraftState((current) => ({
                ...current,
                statusMessage: undefined,
            }));
            try {
                if (draftState.formMode === 'edit' && draftState.editingWorkflowId) {
                    const result = await updateWorkflowMutation.mutateAsync({
                        profileId: input.profileId,
                        workspaceFingerprint: input.workspaceFingerprint,
                        workflowId: draftState.editingWorkflowId,
                        label: draftState.label,
                        command: draftState.command,
                        enabled: draftState.enabled,
                    });
                    if (!result.updated) {
                        setDraftState((current) => ({
                            ...current,
                            statusMessage: 'The workflow no longer exists.',
                        }));
                        return;
                    }
                    await refreshList();
                    resetWorkflowDraft();
                    if (branchAfterSave) {
                        await input.onBranch(result.workflow.id);
                    }
                    return;
                }

                const created = await createWorkflowMutation.mutateAsync({
                    profileId: input.profileId,
                    workspaceFingerprint: input.workspaceFingerprint,
                    label: draftState.label,
                    command: draftState.command,
                    enabled: draftState.enabled,
                });
                await refreshList();
                resetWorkflowDraft();
                if (branchAfterSave) {
                    await input.onBranch(created.workflow.id);
                }
            } catch (error) {
                setDraftState((current) => ({
                    ...current,
                    statusMessage: error instanceof Error ? error.message : 'Workflow save failed.',
                }));
            }
        })();
    };

    const confirmDeleteWorkflow = (workflowId: string) => {
        void deleteWorkflowMutation
            .mutateAsync({
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                workflowId,
                confirm: true,
            })
            .then(async () => {
                setDraftState((current) => ({
                    ...current,
                    deleteCandidateId: undefined,
                }));
                if (draftState.editingWorkflowId === workflowId) {
                    resetWorkflowDraft();
                }
                await refreshList();
            })
            .catch((error: unknown) => {
                setDraftState((current) => ({
                    ...current,
                    statusMessage: error instanceof Error ? error.message : 'Workflow delete failed.',
                }));
            });
    };

    return {
        workflows: workflowsQuery.data?.workflows ?? [],
        isLoading: workflowsQuery.isLoading,
        busyForm,
        isBranchDisabled: input.busy,
        draftState,
        queryErrorMessage: workflowsQuery.error?.message,
        branchWithoutWorkflow: () => {
            void input.onBranch(undefined);
        },
        branchWithWorkflow: (workflowId: string) => {
            void input.onBranch(workflowId);
        },
        startCreateWorkflowDraft: () => {
            setDraftState({
                ...createEmptyWorkflowDraftState(),
                isFormVisible: true,
            });
        },
        startEditWorkflowDraft: (workflow: ProjectWorkflowRecord) => {
            setDraftState(createEditWorkflowDraftState(workflow));
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
        cancelWorkflowDraft: resetWorkflowDraft,
        saveWorkflow,
        requestDeleteWorkflow: (workflowId: string) => {
            setDraftState((current) => ({
                ...current,
                deleteCandidateId: workflowId,
                statusMessage: undefined,
            }));
        },
        confirmDeleteWorkflow,
        cancelDeleteWorkflow: () => {
            setDraftState((current) => ({
                ...current,
                deleteCandidateId: undefined,
            }));
        },
    };
}
