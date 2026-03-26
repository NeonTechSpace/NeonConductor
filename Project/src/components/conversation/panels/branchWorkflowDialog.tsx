import { useState } from 'react';

import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { trpc } from '@/web/trpc/client';

import type { ProjectWorkflowRecord } from '@/shared/contracts';

interface BranchWorkflowDialogProps {
    open: boolean;
    profileId: string;
    workspaceFingerprint: string;
    busy: boolean;
    onClose: () => void;
    onBranch: (workflowId?: string) => Promise<void>;
}

type WorkflowFormMode = 'create' | 'edit';

interface WorkflowDraftState {
    formMode: WorkflowFormMode;
    editingWorkflowId: string | undefined;
    label: string;
    command: string;
    enabled: boolean;
    isFormVisible: boolean;
    statusMessage: string | undefined;
    deleteCandidateId: string | undefined;
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

function WorkflowRow({
    workflow,
    isDeleting,
    onBranch,
    onEdit,
    onDelete,
    onConfirmDelete,
    onCancelDelete,
}: {
    workflow: ProjectWorkflowRecord;
    isDeleting: boolean;
    onBranch: (workflowId?: string) => void;
    onEdit: (workflow: ProjectWorkflowRecord) => void;
    onDelete: (workflowId: string) => void;
    onConfirmDelete: (workflowId: string) => void;
    onCancelDelete: () => void;
}) {
    return (
        <div className='border-border/70 bg-card/40 rounded-2xl border p-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-sm font-medium'>{workflow.label}</p>
                        <span className='text-muted-foreground border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                            {workflow.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    <p className='text-muted-foreground text-xs leading-5 break-all'>{workflow.command}</p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                    <button
                        type='button'
                        className='border-primary/40 bg-primary/10 text-primary rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60'
                        disabled={!workflow.enabled}
                        onClick={() => {
                            onBranch(workflow.id);
                        }}>
                        Branch with workflow
                    </button>
                    <button
                        type='button'
                        className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-xs font-medium'
                        onClick={() => {
                            onEdit(workflow);
                        }}>
                        Edit
                    </button>
                    {isDeleting ? (
                        <>
                            <button
                                type='button'
                                className='border-destructive/40 bg-destructive/10 text-destructive rounded-full border px-3 py-1.5 text-xs font-medium'
                                onClick={() => {
                                    onConfirmDelete(workflow.id);
                                }}>
                                Confirm delete
                            </button>
                            <button
                                type='button'
                                className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-xs font-medium'
                                onClick={onCancelDelete}>
                                Cancel
                            </button>
                        </>
                    ) : (
                        <button
                            type='button'
                            className='border-destructive/40 bg-destructive/10 text-destructive rounded-full border px-3 py-1.5 text-xs font-medium'
                            onClick={() => {
                                onDelete(workflow.id);
                            }}>
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function BranchWorkflowDialogBody({
    profileId,
    workspaceFingerprint,
    busy,
    onBranch,
}: Omit<BranchWorkflowDialogProps, 'open' | 'onClose'>) {
    const utils = trpc.useUtils();
    const workflowsQuery = trpc.workflow.list.useQuery(
        {
            profileId,
            workspaceFingerprint,
        },
        {
            enabled: true,
        }
    );
    const createWorkflowMutation = trpc.workflow.create.useMutation();
    const updateWorkflowMutation = trpc.workflow.update.useMutation();
    const deleteWorkflowMutation = trpc.workflow.delete.useMutation();
    const [draftState, setDraftState] = useState(() => createEmptyWorkflowDraftState());
    const { formMode, editingWorkflowId, label, command, enabled, isFormVisible, statusMessage, deleteCandidateId } =
        draftState;

    const busyForm =
        createWorkflowMutation.isPending || updateWorkflowMutation.isPending || deleteWorkflowMutation.isPending;

    const resetWorkflowDraft = () => {
        setDraftState((current) => ({
            ...createEmptyWorkflowDraftState(),
            statusMessage: current.statusMessage,
        }));
    };

    const startCreateWorkflowDraft = () => {
        setDraftState({
            ...createEmptyWorkflowDraftState(),
            isFormVisible: true,
        });
    };

    const startEditWorkflowDraft = (workflow: ProjectWorkflowRecord) => {
        setDraftState({
            formMode: 'edit',
            editingWorkflowId: workflow.id,
            label: workflow.label,
            command: workflow.command,
            enabled: workflow.enabled,
            isFormVisible: true,
            statusMessage: undefined,
            deleteCandidateId: undefined,
        });
    };

    const refreshList = async () => {
        await utils.workflow.list.invalidate({
            profileId,
            workspaceFingerprint,
        });
    };

    const saveWorkflow = async (branchAfterSave: boolean) => {
        setDraftState((current) => ({
            ...current,
            statusMessage: undefined,
        }));
        try {
            if (formMode === 'edit' && editingWorkflowId) {
                const result = await updateWorkflowMutation.mutateAsync({
                    profileId,
                    workspaceFingerprint,
                    workflowId: editingWorkflowId,
                    label,
                    command,
                    enabled,
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
                    await onBranch(result.workflow.id);
                }
                return;
            }

            const created = await createWorkflowMutation.mutateAsync({
                profileId,
                workspaceFingerprint,
                label,
                command,
                enabled,
            });
            await refreshList();
            resetWorkflowDraft();
            if (branchAfterSave) {
                await onBranch(created.workflow.id);
            }
        } catch (error) {
            setDraftState((current) => ({
                ...current,
                statusMessage: error instanceof Error ? error.message : 'Workflow save failed.',
            }));
        }
    };

    const workflows = workflowsQuery.data?.workflows ?? [];

    return (
        <div className='border-border bg-background w-[min(94vw,46rem)] rounded-[28px] border p-5 shadow-xl'>
            <div className='space-y-1'>
                <h2 id='branch-workflow-title' className='text-lg font-semibold'>
                    Branch workflow
                </h2>
                <p id='branch-workflow-description' className='text-muted-foreground text-sm'>
                    Branch into a fresh sandbox target, optionally running one saved project workflow command.
                </p>
            </div>

            <div className='mt-4 flex flex-wrap items-center gap-2'>
                <button
                    type='button'
                    className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60'
                    disabled={busy}
                    onClick={() => {
                        void onBranch(undefined);
                    }}>
                    Branch with no workflow
                </button>
                <button
                    type='button'
                    className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                    onClick={startCreateWorkflowDraft}>
                    Create workflow
                </button>
            </div>

            {isFormVisible ? (
                <div className='border-border/70 bg-card/40 mt-4 rounded-2xl border p-4'>
                    <div className='space-y-1'>
                        <p className='text-sm font-medium'>{formMode === 'edit' ? 'Edit workflow' : 'New workflow'}</p>
                        <p className='text-muted-foreground text-xs'>
                            One workflow is one reusable shell command stored under{' '}
                            <code>.neonconductor/workflows</code>.
                        </p>
                    </div>

                    <div className='mt-4 space-y-3'>
                        <label className='block space-y-2'>
                            <span className='text-sm font-medium'>Label</span>
                            <input
                                type='text'
                                value={label}
                                onChange={(event) => {
                                    setDraftState((current) => ({
                                        ...current,
                                        label: event.target.value,
                                    }));
                                }}
                                className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                autoComplete='off'
                                placeholder='Install dependencies'
                            />
                        </label>

                        <label className='block space-y-2'>
                            <span className='text-sm font-medium'>Command</span>
                            <textarea
                                value={command}
                                onChange={(event) => {
                                    setDraftState((current) => ({
                                        ...current,
                                        command: event.target.value,
                                    }));
                                }}
                                className='border-border bg-card min-h-28 w-full rounded-2xl border px-3 py-2 text-sm'
                                spellCheck={false}
                                placeholder='pnpm install'
                            />
                        </label>

                        <label className='flex items-center gap-2 text-sm'>
                            <input
                                type='checkbox'
                                checked={enabled}
                                onChange={(event) => {
                                    setDraftState((current) => ({
                                        ...current,
                                        enabled: event.target.checked,
                                    }));
                                }}
                            />
                            <span>Enabled</span>
                        </label>
                    </div>

                    <div className='mt-4 flex flex-wrap items-center justify-end gap-2'>
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                            onClick={resetWorkflowDraft}>
                            Cancel
                        </button>
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60'
                            disabled={busy || busyForm}
                            onClick={() => {
                                void saveWorkflow(false);
                            }}>
                            {busyForm ? 'Saving…' : formMode === 'edit' ? 'Save changes' : 'Save workflow'}
                        </button>
                        {formMode === 'create' ? (
                            <button
                                type='button'
                                className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60'
                                disabled={busy || busyForm}
                                onClick={() => {
                                    void saveWorkflow(true);
                                }}>
                                Save and branch
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className='mt-4 space-y-3'>
                {workflowsQuery.isLoading ? (
                    <div className='text-muted-foreground border-border/70 bg-card/30 rounded-2xl border px-4 py-5 text-sm'>
                        Loading workflows…
                    </div>
                ) : workflows.length === 0 ? (
                    <div className='text-muted-foreground border-border/70 bg-card/30 rounded-2xl border px-4 py-5 text-sm'>
                        No project workflows yet.
                    </div>
                ) : (
                    workflows.map((workflow) => (
                        <WorkflowRow
                            key={workflow.id}
                            workflow={workflow}
                            isDeleting={deleteCandidateId === workflow.id}
                            onBranch={(workflowId) => {
                                void onBranch(workflowId);
                            }}
                            onEdit={startEditWorkflowDraft}
                            onDelete={(workflowId) => {
                                setDraftState((current) => ({
                                    ...current,
                                    deleteCandidateId: workflowId,
                                    statusMessage: undefined,
                                }));
                            }}
                            onConfirmDelete={(workflowId) => {
                                void deleteWorkflowMutation
                                    .mutateAsync({
                                        profileId,
                                        workspaceFingerprint,
                                        workflowId,
                                        confirm: true,
                                    })
                                    .then(async () => {
                                        setDraftState((current) => ({
                                            ...current,
                                            deleteCandidateId: undefined,
                                        }));
                                        if (editingWorkflowId === workflowId) {
                                            resetWorkflowDraft();
                                        }
                                        await refreshList();
                                    })
                                    .catch((error: unknown) => {
                                        setDraftState((current) => ({
                                            ...current,
                                            statusMessage:
                                                error instanceof Error ? error.message : 'Workflow delete failed.',
                                        }));
                                    });
                            }}
                            onCancelDelete={() => {
                                setDraftState((current) => ({
                                    ...current,
                                    deleteCandidateId: undefined,
                                }));
                            }}
                        />
                    ))
                )}
            </div>

            {statusMessage || workflowsQuery.error?.message ? (
                <p className='text-destructive mt-4 text-sm'>{statusMessage ?? workflowsQuery.error?.message}</p>
            ) : null}
        </div>
    );
}

export function BranchWorkflowDialog({
    open,
    profileId,
    workspaceFingerprint,
    busy,
    onClose,
    onBranch,
}: BranchWorkflowDialogProps) {
    return (
        <DialogSurface
            open={open}
            titleId='branch-workflow-title'
            descriptionId='branch-workflow-description'
            onClose={onClose}>
            {open ? (
                <BranchWorkflowDialogBody
                    key={`${profileId}:${workspaceFingerprint}`}
                    profileId={profileId}
                    workspaceFingerprint={workspaceFingerprint}
                    busy={busy}
                    onBranch={onBranch}
                />
            ) : null}
        </DialogSurface>
    );
}
