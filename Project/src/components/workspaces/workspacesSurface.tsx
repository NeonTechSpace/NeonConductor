import { startTransition, useDeferredValue, useState } from 'react';

import { useWorkspacesSurfaceController } from '@/web/components/workspaces/useWorkspacesSurfaceController';
import { WorkspaceCreateDialog } from '@/web/components/workspaces/workspaceCreateDialog';
import { WorkspaceDeleteConversationsDialog } from '@/web/components/workspaces/workspaceDeleteConversationsDialog';
import { WorkspaceDetailsPanel } from '@/web/components/workspaces/workspaceDetailsPanel';

interface WorkspacesSurfaceProps {
    profileId: string;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
        updatedAt: string;
    }>;
    selectedWorkspaceFingerprint: string | undefined;
    onSelectedWorkspaceFingerprintChange: (workspaceFingerprint: string | undefined) => void;
    onOpenSessions: () => void;
    onCreateThreadForWorkspace: (workspaceFingerprint: string) => void;
}

export function WorkspacesSurface({
    profileId,
    workspaceRoots,
    selectedWorkspaceFingerprint,
    onSelectedWorkspaceFingerprintChange,
    onOpenSessions,
    onCreateThreadForWorkspace,
}: WorkspacesSurfaceProps) {
    const [searchValue, setSearchValue] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [confirmDeleteWorkspaceFingerprint, setConfirmDeleteWorkspaceFingerprint] = useState<string | undefined>(
        undefined
    );
    const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());
    const controller = useWorkspacesSurfaceController({
        profileId,
        workspaceRoots,
        selectedWorkspaceFingerprint,
        onSelectedWorkspaceFingerprintChange,
        onCreateThreadForWorkspace,
    });
    const visibleWorkspaceRoots =
        deferredSearchValue.length > 0
            ? workspaceRoots.filter((root) =>
                  `${root.label} ${root.absolutePath} ${root.fingerprint}`.toLowerCase().includes(deferredSearchValue)
              )
            : workspaceRoots;
    const pendingDeleteWorkspace = confirmDeleteWorkspaceFingerprint
        ? workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === confirmDeleteWorkspaceFingerprint)
        : undefined;
    const selectedWorkspace = controller.selectedWorkspace;

    async function handleConfirmDeleteWorkspaceConversations() {
        if (!pendingDeleteWorkspace) {
            return;
        }

        try {
            await controller.deleteWorkspaceConversations(pendingDeleteWorkspace.fingerprint);
            setConfirmDeleteWorkspaceFingerprint(undefined);
        } catch {
            return;
        }
    }

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
            <aside className='border-border/80 bg-background/70 flex w-[288px] shrink-0 flex-col gap-4 border-r p-4'>
                <div className='space-y-1'>
                    <h2 className='text-sm font-semibold tracking-[0.18em] uppercase'>Workspaces</h2>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Add a folder once, then reuse it for sessions, isolated runs, rules, and skills tied to that
                        workspace.
                    </p>
                </div>

                <div className='space-y-2'>
                    <input
                        type='search'
                        value={searchValue}
                        onChange={(event) => {
                            setSearchValue(event.target.value);
                        }}
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='Search workspaces…'
                    />
                    <button
                        type='button'
                        className='border-border bg-card hover:bg-accent w-full rounded-2xl border px-3 py-2 text-sm font-medium'
                        onClick={() => {
                            setIsCreateOpen(true);
                        }}>
                        New workspace
                    </button>
                </div>

                <div className='min-h-0 flex-1 space-y-2 overflow-y-auto'>
                    {visibleWorkspaceRoots.length > 0 ? (
                        visibleWorkspaceRoots.map((workspaceRoot) => (
                            <button
                                key={workspaceRoot.fingerprint}
                                type='button'
                                className={`w-full rounded-[22px] border px-3 py-3 text-left transition-colors ${
                                    workspaceRoot.fingerprint === selectedWorkspaceFingerprint
                                        ? 'border-primary bg-primary/10 text-primary shadow-sm'
                                        : 'border-border bg-card hover:bg-accent'
                                }`}
                                onClick={() => {
                                    startTransition(() => {
                                        onSelectedWorkspaceFingerprintChange(workspaceRoot.fingerprint);
                                    });
                                }}>
                                <p className='text-sm font-semibold'>{workspaceRoot.label}</p>
                                <p className='text-muted-foreground mt-1 truncate text-xs'>
                                    {workspaceRoot.absolutePath}
                                </p>
                            </button>
                        ))
                    ) : (
                        <div className='border-border/70 bg-card/30 text-muted-foreground rounded-[22px] border border-dashed px-4 py-5 text-sm'>
                            No workspaces match that search yet.
                        </div>
                    )}
                </div>
            </aside>

            <div className='min-h-0 min-w-0 flex-1 overflow-y-auto p-5 md:p-6'>
                {selectedWorkspace ? (
                    <WorkspaceDetailsPanel
                        profileId={profileId}
                        selectedWorkspace={selectedWorkspace}
                        selectedWorkspaceThreads={controller.selectedWorkspaceThreads}
                        selectedWorkspaceSessions={controller.selectedWorkspaceSessions}
                        selectedWorkspaceSandboxes={controller.selectedWorkspaceSandboxes}
                        selectedWorkspaceRegistry={controller.selectedWorkspaceRegistry}
                        {...(controller.selectedWorkspacePreference
                            ? { selectedWorkspacePreference: controller.selectedWorkspacePreference }
                            : {})}
                        providers={controller.providers}
                        providerModels={controller.providerModels}
                        defaults={controller.runtimeDefaults}
                        isRefreshingRegistry={controller.isRefreshingRegistry}
                        isDeletingWorkspaceConversations={controller.isDeletingWorkspaceConversations}
                        onOpenSessions={onOpenSessions}
                        onRefreshRegistry={() => {
                            void controller.refreshRegistry(selectedWorkspace.fingerprint);
                        }}
                        onRequestDeleteConversations={() => {
                            setConfirmDeleteWorkspaceFingerprint(selectedWorkspace.fingerprint);
                        }}
                    />
                ) : (
                    <div className='mx-auto flex h-full max-w-3xl items-center justify-center'>
                        <div className='border-border/70 bg-card/40 space-y-2 rounded-[28px] border px-6 py-8 text-center'>
                            <p className='text-lg font-semibold'>No workspace selected</p>
                            <p className='text-muted-foreground text-sm leading-6'>
                                Choose a workspace from the rail or add a new folder to start using workspace-specific
                                sessions and tools.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <WorkspaceCreateDialog
                open={isCreateOpen}
                profileId={profileId}
                providers={controller.providers}
                providerModels={controller.providerModels}
                defaults={controller.runtimeDefaults}
                isSaving={controller.isCreatingWorkspace}
                onClose={() => {
                    setIsCreateOpen(false);
                }}
                onCreateWorkspace={controller.createWorkspace}
            />

            <WorkspaceDeleteConversationsDialog
                open={Boolean(pendingDeleteWorkspace)}
                {...(pendingDeleteWorkspace?.label ? { workspaceLabel: pendingDeleteWorkspace.label } : {})}
                busy={controller.isDeletingWorkspaceConversations}
                onCancel={() => {
                    setConfirmDeleteWorkspaceFingerprint(undefined);
                }}
                onConfirm={() => {
                    void handleConfirmDeleteWorkspaceConversations();
                }}
            />
        </section>
    );
}
