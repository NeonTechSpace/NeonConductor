import {
    createEmptyBranchWorkflowDraftState,
    useBranchWorkflowLibraryController,
    type BranchWorkflowLibraryController,
} from '@/web/components/conversation/panels/useBranchWorkflowLibraryController';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type { ProjectBranchWorkflowRecord } from '@/shared/contracts';

export interface BranchWorkflowDialogProps {
    open: boolean;
    profileId: string;
    workspaceFingerprint: string;
    busy: boolean;
    onClose: () => void;
    onBranch: (branchWorkflowId?: string) => Promise<void>;
}

function BranchWorkflowRow({
    branchWorkflow,
    isDeleting,
    onBranch,
    onEdit,
    onDelete,
    onConfirmDelete,
    onCancelDelete,
}: {
    branchWorkflow: ProjectBranchWorkflowRecord;
    isDeleting: boolean;
    onBranch: (branchWorkflowId?: string) => void;
    onEdit: (branchWorkflow: ProjectBranchWorkflowRecord) => void;
    onDelete: (branchWorkflowId: string) => void;
    onConfirmDelete: (branchWorkflowId: string) => void;
    onCancelDelete: () => void;
}) {
    return (
        <div className='border-border/70 bg-card/40 rounded-2xl border p-4'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <div className='flex flex-wrap items-center gap-2'>
                        <p className='text-sm font-medium'>{branchWorkflow.label}</p>
                        <span className='text-muted-foreground border-border/70 rounded-full border px-2 py-0.5 text-[11px]'>
                            {branchWorkflow.enabled ? 'Enabled' : 'Disabled'}
                        </span>
                    </div>
                    <p className='text-muted-foreground text-xs leading-5 break-all'>{branchWorkflow.command}</p>
                </div>
                <div className='flex flex-wrap items-center gap-2'>
                    <button
                        type='button'
                        className='border-primary/40 bg-primary/10 text-primary rounded-full border px-3 py-1.5 text-xs font-medium disabled:opacity-60'
                        disabled={!branchWorkflow.enabled}
                        onClick={() => {
                            onBranch(branchWorkflow.id);
                        }}>
                        Branch with branch workflow
                    </button>
                    <button
                        type='button'
                        className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-xs font-medium'
                        onClick={() => {
                            onEdit(branchWorkflow);
                        }}>
                        Edit
                    </button>
                    {isDeleting ? (
                        <>
                            <button
                                type='button'
                                className='border-destructive/40 bg-destructive/10 text-destructive rounded-full border px-3 py-1.5 text-xs font-medium'
                                onClick={() => {
                                    onConfirmDelete(branchWorkflow.id);
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
                                onDelete(branchWorkflow.id);
                            }}>
                            Delete
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function BranchWorkflowDialogContent({ controller }: { controller: BranchWorkflowLibraryController }) {
    const { draftState } = controller;

    return (
        <div className='border-border bg-background w-[min(94vw,46rem)] rounded-[28px] border p-5 shadow-xl'>
            <div className='space-y-1'>
                <h2 id='branch-workflow-title' className='text-lg font-semibold'>
                    Branch workflow
                </h2>
                <p id='branch-workflow-description' className='text-muted-foreground text-sm'>
                    Branch into a fresh sandbox target, optionally running one saved branch workflow command.
                </p>
            </div>

            <div className='mt-4 flex flex-wrap items-center gap-2'>
                <button
                    type='button'
                    className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60'
                    disabled={controller.isBranchDisabled}
                    onClick={controller.branchWithoutWorkflow}>
                    Branch with no branch workflow
                </button>
                <button
                    type='button'
                    className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                    onClick={controller.startCreateBranchWorkflowDraft}>
                    Create branch workflow
                </button>
            </div>

            {draftState.isFormVisible ? (
                <div className='border-border/70 bg-card/40 mt-4 rounded-2xl border p-4'>
                    <div className='space-y-1'>
                        <p className='text-sm font-medium'>
                            {draftState.formMode === 'edit' ? 'Edit branch workflow' : 'New branch workflow'}
                        </p>
                        <p className='text-muted-foreground text-xs'>
                            One branch workflow is one reusable shell command stored under{' '}
                            <code>.neonconductor/branch-workflows</code>.
                        </p>
                    </div>

                    <div className='mt-4 space-y-3'>
                        <label className='block space-y-2'>
                            <span className='text-sm font-medium'>Label</span>
                            <input
                                type='text'
                                value={draftState.label}
                                onChange={(event) => {
                                    controller.updateLabel(event.target.value);
                                }}
                                className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                autoComplete='off'
                                placeholder='Install dependencies'
                            />
                        </label>

                        <label className='block space-y-2'>
                            <span className='text-sm font-medium'>Command</span>
                            <textarea
                                value={draftState.command}
                                onChange={(event) => {
                                    controller.updateCommand(event.target.value);
                                }}
                                className='border-border bg-card min-h-28 w-full rounded-2xl border px-3 py-2 text-sm'
                                spellCheck={false}
                                placeholder='pnpm install'
                            />
                        </label>

                        <label className='flex items-center gap-2 text-sm'>
                            <input
                                type='checkbox'
                                checked={draftState.enabled}
                                onChange={(event) => {
                                    controller.updateEnabled(event.target.checked);
                                }}
                            />
                            <span>Enabled</span>
                        </label>
                    </div>

                    <div className='mt-4 flex flex-wrap items-center justify-end gap-2'>
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                            onClick={controller.cancelBranchWorkflowDraft}>
                            Cancel
                        </button>
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60'
                            disabled={controller.isBranchDisabled || controller.busyForm}
                            onClick={() => {
                                controller.saveBranchWorkflow(false);
                            }}>
                            {controller.busyForm
                                ? 'Saving…'
                                : draftState.formMode === 'edit'
                                  ? 'Save changes'
                                  : 'Save branch workflow'}
                        </button>
                        {draftState.formMode === 'create' ? (
                            <button
                                type='button'
                                className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:opacity-60'
                                disabled={controller.isBranchDisabled || controller.busyForm}
                                onClick={() => {
                                    controller.saveBranchWorkflow(true);
                                }}>
                                Save and branch
                            </button>
                        ) : null}
                    </div>
                </div>
            ) : null}

            <div className='mt-4 space-y-3'>
                {controller.isLoading ? (
                    <div className='text-muted-foreground border-border/70 bg-card/30 rounded-2xl border px-4 py-5 text-sm'>
                        Loading branch workflows…
                    </div>
                ) : controller.branchWorkflows.length === 0 ? (
                    <div className='text-muted-foreground border-border/70 bg-card/30 rounded-2xl border px-4 py-5 text-sm'>
                        No branch workflows yet.
                    </div>
                ) : (
                    controller.branchWorkflows.map((branchWorkflow) => (
                        <BranchWorkflowRow
                            key={branchWorkflow.id}
                            branchWorkflow={branchWorkflow}
                            isDeleting={draftState.deleteCandidateId === branchWorkflow.id}
                            onBranch={(branchWorkflowId) => {
                                if (branchWorkflowId) {
                                    controller.branchWithWorkflow(branchWorkflowId);
                                }
                            }}
                            onEdit={controller.startEditBranchWorkflowDraft}
                            onDelete={controller.requestDeleteBranchWorkflow}
                            onConfirmDelete={controller.confirmDeleteBranchWorkflow}
                            onCancelDelete={controller.cancelDeleteBranchWorkflow}
                        />
                    ))
                )}
            </div>

            {draftState.statusMessage || controller.queryErrorMessage ? (
                <p className='text-destructive mt-4 text-sm'>
                    {draftState.statusMessage ?? controller.queryErrorMessage}
                </p>
            ) : null}
        </div>
    );
}

function BranchWorkflowDialogBody({
    profileId,
    workspaceFingerprint,
    busy,
    onBranch,
}: Omit<BranchWorkflowDialogProps, 'open' | 'onClose'>) {
    const controller = useBranchWorkflowLibraryController({
        profileId,
        workspaceFingerprint,
        busy,
        onBranch,
    });

    return <BranchWorkflowDialogContent controller={controller} />;
}

export { createEmptyBranchWorkflowDraftState };

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
