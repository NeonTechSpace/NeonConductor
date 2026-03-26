import { useState } from 'react';

import {
    resolveExecutionEnvironmentDraftState,
    type ExecutionEnvironmentDraftState,
    type ExecutionEnvironmentScope,
} from '@/web/components/conversation/panels/executionEnvironmentPanelState';
import { Button } from '@/web/components/ui/button';

import type { ThreadListRecord, SandboxRecord } from '@/app/backend/persistence/types';

import type { TopLevelTab } from '@/shared/contracts';

interface ExecutionEnvironmentPanelProps {
    topLevelTab: TopLevelTab;
    selectedThread: ThreadListRecord | undefined;
    workspaceScope: ExecutionEnvironmentScope;
    sandboxes: SandboxRecord[];
    busy: boolean;
    feedbackMessage?: string;
    feedbackTone?: 'success' | 'error' | 'info';
    onConfigureThread: (input: { mode: 'local' | 'new_sandbox' | 'sandbox'; sandboxId?: string }) => void;
    onRefreshSandbox: (sandboxId: string) => void;
    onRemoveSandbox: (sandboxId: string) => void;
    onRemoveOrphaned: () => void;
}

export function ExecutionEnvironmentPanel({
    topLevelTab,
    selectedThread,
    workspaceScope,
    sandboxes,
    busy,
    feedbackMessage,
    feedbackTone = 'info',
    onConfigureThread,
    onRefreshSandbox,
    onRemoveSandbox,
    onRemoveOrphaned,
}: ExecutionEnvironmentPanelProps) {
    const [draftState, setDraftState] = useState<ExecutionEnvironmentDraftState | undefined>(undefined);
    const resolvedDraftState = resolveExecutionEnvironmentDraftState({
        workspaceScope,
        draftState,
    });
    const draftMode = resolvedDraftState.draftMode;
    const selectedSandboxId = resolvedDraftState.selectedSandboxId;

    if (!selectedThread) {
        return null;
    }

    if (topLevelTab === 'chat') {
        return (
            <section className='border-border bg-card mb-3 rounded-2xl border p-3'>
                <p className='text-sm font-semibold'>Conversation Branching</p>
                <p className='text-muted-foreground mt-1 text-xs'>
                    Chat uses read-only conversation branches only. Selecting “Conversation Branches” in the sidebar
                    changes message lineage, not the filesystem. Chat never creates a managed sandbox.
                </p>
            </section>
        );
    }

    if (workspaceScope.kind === 'detached') {
        return (
            <section className='border-border bg-card mb-3 rounded-2xl border p-3'>
                <p className='text-sm font-semibold'>Execution Environment</p>
                <p className='text-muted-foreground mt-1 text-xs'>
                    Detached threads have no filesystem authority. Use a workspace thread to choose between the local
                    workspace and a managed sandbox environment.
                </p>
            </section>
        );
    }

    return (
        <section className='border-border bg-card mb-3 rounded-2xl border p-3'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div>
                    <p className='text-sm font-semibold'>Execution Environment</p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Agent and orchestrator threads can run in the local workspace or a managed sandbox. Sandbox
                        materialization stays lazy until the first mutating run.
                    </p>
                </div>
                <div className='text-muted-foreground text-right text-xs [font-variant-numeric:tabular-nums]'>
                    <p>{sandboxes.length} managed</p>
                    <p>{workspaceScope.kind === 'sandbox' ? workspaceScope.label : 'local workspace'}</p>
                </div>
            </div>

            <div className='mt-3 grid gap-2 md:grid-cols-3'>
                <Button
                    type='button'
                    variant={draftMode === 'local' ? 'secondary' : 'outline'}
                    disabled={busy}
                    onClick={() => {
                        setDraftState({
                            ...resolvedDraftState,
                            draftMode: 'local',
                        });
                    }}>
                    Local Workspace
                </Button>
                <Button
                    type='button'
                    variant={draftMode === 'new_sandbox' ? 'secondary' : 'outline'}
                    disabled={busy}
                    onClick={() => {
                        setDraftState({
                            ...resolvedDraftState,
                            draftMode: 'new_sandbox',
                        });
                    }}>
                    Managed Sandbox
                </Button>
                <Button
                    type='button'
                    variant={draftMode === 'sandbox' ? 'secondary' : 'outline'}
                    disabled={busy || sandboxes.length === 0}
                    onClick={() => {
                        setDraftState({
                            ...resolvedDraftState,
                            draftMode: 'sandbox',
                        });
                    }}>
                    Existing Sandbox
                </Button>
            </div>

            {draftMode === 'new_sandbox' ? (
                <div className='border-border bg-background/60 text-muted-foreground mt-3 rounded-xl border px-3 py-2 text-xs'>
                    This thread will receive its own sticky managed sandbox on the first mutating run. The app will not
                    fall back to the local workspace if sandbox materialization fails.
                </div>
            ) : null}

            {draftMode === 'sandbox' ? (
                <select
                    value={selectedSandboxId}
                    onChange={(event) => {
                        setDraftState({
                            ...resolvedDraftState,
                            selectedSandboxId: event.target.value,
                        });
                    }}
                    className='border-border bg-background mt-3 h-11 w-full rounded-xl border px-3 text-sm'>
                    <option value=''>Select managed sandbox</option>
                    {sandboxes.map((sandbox) => (
                        <option key={sandbox.id} value={sandbox.id}>
                            {sandbox.label} · {sandbox.status}
                        </option>
                    ))}
                </select>
            ) : null}

            <div className='mt-3 flex flex-wrap gap-2'>
                <Button
                    type='button'
                    disabled={busy || (draftMode === 'sandbox' && selectedSandboxId.trim().length === 0)}
                    onClick={() => {
                        onConfigureThread({
                            mode: draftMode,
                            ...(draftMode === 'sandbox' ? { sandboxId: selectedSandboxId } : {}),
                        });
                    }}>
                    {draftMode === 'local'
                        ? 'Use Local Workspace'
                        : draftMode === 'new_sandbox'
                          ? 'Use Managed Sandbox'
                          : 'Attach Existing Sandbox'}
                </Button>
                {workspaceScope.kind === 'sandbox' ? (
                    <>
                        <Button
                            type='button'
                            variant='outline'
                            disabled={busy}
                            onClick={() => {
                                onRefreshSandbox(workspaceScope.sandboxId);
                            }}>
                            Refresh Status
                        </Button>
                        <Button
                            type='button'
                            variant='outline'
                            disabled={busy}
                            onClick={() => {
                                onRemoveSandbox(workspaceScope.sandboxId);
                            }}>
                            Remove Sandbox
                        </Button>
                    </>
                ) : null}
                <Button
                    type='button'
                    variant='outline'
                    disabled={busy || sandboxes.length === 0}
                    onClick={onRemoveOrphaned}>
                    Cleanup Orphaned
                </Button>
            </div>

            {feedbackMessage ? (
                <div
                    aria-live='polite'
                    className={`mt-3 rounded-xl border px-3 py-2 text-xs ${
                        feedbackTone === 'error'
                            ? 'border-destructive/20 bg-destructive/10 text-destructive'
                            : feedbackTone === 'success'
                              ? 'border-primary/20 bg-primary/10 text-primary'
                              : 'border-border bg-background/70 text-muted-foreground'
                    }`}>
                    {feedbackMessage}
                </div>
            ) : null}

            <div className='text-muted-foreground mt-3 text-xs'>
                {workspaceScope.kind === 'sandbox' ? (
                    <p>
                        Running in managed sandbox{' '}
                        <span className='text-foreground font-medium'>{workspaceScope.label}</span> from{' '}
                        {workspaceScope.baseWorkspaceLabel}. Filesystem operations, checkpoints, and shell commands use{' '}
                        {workspaceScope.absolutePath}.
                    </p>
                ) : (
                    <p>
                        Running in the local workspace at {workspaceScope.absolutePath}. Managed sandbox mode creates a
                        sticky per-thread execution target on first mutating run.
                    </p>
                )}
            </div>
        </section>
    );
}
