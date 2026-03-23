import { useEffect, useState } from 'react';

import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { trpc } from '@/web/trpc/client';

import type { ProjectWorkflowRecord } from '@/app/backend/runtime/contracts';

interface BranchWorkflowDialogProps {
    open: boolean;
    profileId: string;
    workspaceFingerprint: string;
    busy: boolean;
    onClose: () => void;
    onBranch: (workflowId?: string) => Promise<void>;
}

type WorkflowFormMode = 'create' | 'edit';

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
        <div className='rounded-2xl border border-border/70 bg-card/40 p-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-sm font-medium'>{workflow.label}</p>
                        <span className='text-muted-foreground rounded-full border border-border/70 px-2 py-0.5 text-[11px]'>
                            {workflow.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    <p className='text-muted-foreground break-all text-xs leading-5'>{workflow.command}</p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                    <button
                        type='button'
                        className='rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary disabled:opacity-60'
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
                                className='rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive'
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
                            className='rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs font-medium text-destructive'
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

export function BranchWorkflowDialog({
    open,
    profileId,
    workspaceFingerprint,
    busy,
    onClose,
    onBranch,
}: BranchWorkflowDialogProps) {
    const utils = trpc.useUtils();
    const workflowsQuery = trpc.workflow.list.useQuery(
        {
            profileId,
            workspaceFingerprint,
        },
        {
            enabled: open,
        }
    );
    const createWorkflowMutation = trpc.workflow.create.useMutation();
    const updateWorkflowMutation = trpc.workflow.update.useMutation();
    const deleteWorkflowMutation = trpc.workflow.delete.useMutation();
    const [formMode, setFormMode] = useState<WorkflowFormMode>('create');
    const [editingWorkflowId, setEditingWorkflowId] = useState<string | undefined>(undefined);
    const [label, setLabel] = useState('');
    const [command, setCommand] = useState('');
    const [enabled, setEnabled] = useState(true);
    const [isFormVisible, setIsFormVisible] = useState(false);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);
    const [deleteCandidateId, setDeleteCandidateId] = useState<string | undefined>(undefined);

    useEffect(() => {
        if (!open) {
            return;
        }

        setFormMode('create');
        setEditingWorkflowId(undefined);
        setLabel('');
        setCommand('');
        setEnabled(true);
        setIsFormVisible(false);
        setStatusMessage(undefined);
        setDeleteCandidateId(undefined);
    }, [open]);

    const busyForm = createWorkflowMutation.isPending || updateWorkflowMutation.isPending || deleteWorkflowMutation.isPending;

    const resetForm = () => {
        setFormMode('create');
        setEditingWorkflowId(undefined);
        setLabel('');
        setCommand('');
        setEnabled(true);
        setIsFormVisible(false);
    };

    const refreshList = async () => {
        await utils.workflow.list.invalidate({
            profileId,
            workspaceFingerprint,
        });
    };

    const saveWorkflow = async (branchAfterSave: boolean) => {
        setStatusMessage(undefined);
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
                    setStatusMessage('The workflow no longer exists.');
                    return;
                }
                await refreshList();
                resetForm();
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
            resetForm();
            if (branchAfterSave) {
                await onBranch(created.workflow.id);
            }
        } catch (error) {
            setStatusMessage(error instanceof Error ? error.message : 'Workflow save failed.');
        }
    };

    const workflows = workflowsQuery.data?.workflows ?? [];

    return (
        <DialogSurface
            open={open}
            titleId='branch-workflow-title'
            descriptionId='branch-workflow-description'
            onClose={onClose}>
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
                        className='rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary disabled:opacity-60'
                        disabled={busy}
                        onClick={() => {
                            void onBranch(undefined);
                        }}>
                        Branch with no workflow
                    </button>
                    <button
                        type='button'
                        className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                        onClick={() => {
                            setFormMode('create');
                            setEditingWorkflowId(undefined);
                            setLabel('');
                            setCommand('');
                            setEnabled(true);
                            setIsFormVisible(true);
                            setDeleteCandidateId(undefined);
                            setStatusMessage(undefined);
                        }}>
                        Create workflow
                    </button>
                </div>

                {isFormVisible ? (
                    <div className='mt-4 rounded-2xl border border-border/70 bg-card/40 p-4'>
                        <div className='space-y-1'>
                            <p className='text-sm font-medium'>
                                {formMode === 'edit' ? 'Edit workflow' : 'New workflow'}
                            </p>
                            <p className='text-muted-foreground text-xs'>
                                One workflow is one reusable shell command stored under <code>.neonconductor/workflows</code>.
                            </p>
                        </div>

                        <div className='mt-4 space-y-3'>
                            <label className='block space-y-2'>
                                <span className='text-sm font-medium'>Label</span>
                                <input
                                    type='text'
                                    value={label}
                                    onChange={(event) => {
                                        setLabel(event.target.value);
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
                                        setCommand(event.target.value);
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
                                        setEnabled(event.target.checked);
                                    }}
                                />
                                <span>Enabled</span>
                            </label>
                        </div>

                        <div className='mt-4 flex flex-wrap items-center justify-end gap-2'>
                            <button
                                type='button'
                                className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                                onClick={resetForm}>
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
                                    className='rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary disabled:opacity-60'
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
                        <div className='text-muted-foreground rounded-2xl border border-border/70 bg-card/30 px-4 py-5 text-sm'>
                            Loading workflows…
                        </div>
                    ) : workflows.length === 0 ? (
                        <div className='text-muted-foreground rounded-2xl border border-border/70 bg-card/30 px-4 py-5 text-sm'>
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
                                onEdit={(selectedWorkflow) => {
                                    setFormMode('edit');
                                    setEditingWorkflowId(selectedWorkflow.id);
                                    setLabel(selectedWorkflow.label);
                                    setCommand(selectedWorkflow.command);
                                    setEnabled(selectedWorkflow.enabled);
                                    setIsFormVisible(true);
                                    setDeleteCandidateId(undefined);
                                    setStatusMessage(undefined);
                                }}
                                onDelete={(workflowId) => {
                                    setDeleteCandidateId(workflowId);
                                    setStatusMessage(undefined);
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
                                            setDeleteCandidateId(undefined);
                                            if (editingWorkflowId === workflowId) {
                                                resetForm();
                                            }
                                            await refreshList();
                                        })
                                        .catch((error) => {
                                            setStatusMessage(
                                                error instanceof Error ? error.message : 'Workflow delete failed.'
                                            );
                                        });
                                }}
                                onCancelDelete={() => {
                                    setDeleteCandidateId(undefined);
                                }}
                            />
                        ))
                    )}
                </div>

                {statusMessage || workflowsQuery.error?.message ? (
                    <p className='text-destructive mt-4 text-sm'>{statusMessage ?? workflowsQuery.error?.message}</p>
                ) : null}
            </div>
        </DialogSurface>
    );
}
