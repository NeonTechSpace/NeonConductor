import { startTransition, useDeferredValue, useState } from 'react';

import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { ConfirmDialog } from '@/web/components/ui/confirmDialog';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import {
    WorkspaceDefaultsSection,
    buildWorkspaceModelOptions,
    formatTimestamp,
    resolveWorkspaceDefaultDraft,
    topLevelTabLabel,
} from '@/web/components/workspaces/workspacesSurfaceSections';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

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
    const utils = trpc.useUtils();
    const [searchValue, setSearchValue] = useState('');
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [workspaceLabelDraft, setWorkspaceLabelDraft] = useState('');
    const [workspacePathDraft, setWorkspacePathDraft] = useState('');
    const [isPickingWorkspaceDirectory, setIsPickingWorkspaceDirectory] = useState(false);
    const [workspaceDefaultTopLevelTabDraft, setWorkspaceDefaultTopLevelTabDraft] = useState<TopLevelTab>('agent');
    const [workspaceDefaultProviderIdDraft, setWorkspaceDefaultProviderIdDraft] = useState<RuntimeProviderId | undefined>(
        undefined
    );
    const [workspaceDefaultModelIdDraft, setWorkspaceDefaultModelIdDraft] = useState('');
    const [confirmDeleteWorkspaceFingerprint, setConfirmDeleteWorkspaceFingerprint] = useState<string | undefined>(undefined);
    const deferredSearchValue = useDeferredValue(searchValue.trim().toLowerCase());
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);

    const sessionsQuery = trpc.session.list.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const threadsQuery = trpc.conversation.listThreads.useQuery(
        {
            profileId,
            activeTab: 'chat',
            showAllModes: true,
            groupView: 'workspace',
            sort: 'latest',
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const sandboxesQuery = trpc.sandbox.list.useQuery(
        {
            profileId,
            ...(selectedWorkspaceFingerprint ? { workspaceFingerprint: selectedWorkspaceFingerprint } : {}),
        },
        {
            enabled: Boolean(selectedWorkspaceFingerprint),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const registryQuery = trpc.registry.listResolved.useQuery(
        {
            profileId,
            ...(selectedWorkspaceFingerprint ? { workspaceFingerprint: selectedWorkspaceFingerprint } : {}),
        },
        {
            enabled: Boolean(selectedWorkspaceFingerprint),
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            utils.runtime.getShellBootstrap.setData({ profileId }, (current) =>
                current
                    ? {
                          ...current,
                          workspacePreferences: [
                              workspacePreference,
                              ...current.workspacePreferences.filter(
                                  (record) => record.workspaceFingerprint !== workspacePreference.workspaceFingerprint
                              ),
                          ],
                      }
                    : current
            );
        },
    });
    const registerWorkspaceRootMutation = trpc.runtime.registerWorkspaceRoot.useMutation();
    const deleteWorkspaceThreadsMutation = trpc.conversation.deleteWorkspaceThreads.useMutation({
        onSuccess: async () => {
            setConfirmDeleteWorkspaceFingerprint(undefined);
            await Promise.all([
                utils.conversation.listBuckets.invalidate({ profileId }),
                utils.conversation.listThreads.invalidate(),
                utils.session.list.invalidate({ profileId }),
            ]);
        },
    });
    const refreshRegistryMutation = trpc.registry.refresh.useMutation({
        onSuccess: async (_result, variables) => {
            await utils.registry.listResolved.invalidate({
                profileId,
                ...(variables.workspaceFingerprint ? { workspaceFingerprint: variables.workspaceFingerprint } : {}),
            });
        },
    });

    const visibleWorkspaceRoots =
        deferredSearchValue.length > 0
            ? workspaceRoots.filter((root) =>
                  `${root.label} ${root.absolutePath} ${root.fingerprint}`.toLowerCase().includes(deferredSearchValue)
              )
            : workspaceRoots;

    const selectedWorkspace = selectedWorkspaceFingerprint
        ? workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === selectedWorkspaceFingerprint)
        : undefined;
    const providers = shellBootstrapQuery.data?.providers ?? [];
    const providerModels = shellBootstrapQuery.data?.providerModels ?? [];
    const workspacePreferences = shellBootstrapQuery.data?.workspacePreferences ?? [];
    const runtimeDefaults = shellBootstrapQuery.data?.defaults;
    const selectedWorkspacePreference = selectedWorkspaceFingerprint
        ? workspacePreferences.find((workspacePreference) => workspacePreference.workspaceFingerprint === selectedWorkspaceFingerprint)
        : undefined;
    const allThreads = threadsQuery.data?.threads ?? [];
    const allSessions = sessionsQuery.data?.sessions ?? [];
    const selectedWorkspaceThreads = selectedWorkspaceFingerprint
        ? allThreads.filter((thread) => thread.workspaceFingerprint === selectedWorkspaceFingerprint)
        : [];
    const selectedWorkspaceThreadIds = new Set(selectedWorkspaceThreads.map((thread) => thread.id));
    const selectedWorkspaceSessions = selectedWorkspaceFingerprint
        ? allSessions.filter((session) => selectedWorkspaceThreadIds.has(session.threadId))
        : [];
    const selectedWorkspaceSandboxes = sandboxesQuery.data?.sandboxes ?? [];
    const selectedWorkspaceRegistry = registryQuery.data;
    const pendingDeleteWorkspace = confirmDeleteWorkspaceFingerprint
        ? workspaceRoots.find((workspaceRoot) => workspaceRoot.fingerprint === confirmDeleteWorkspaceFingerprint)
        : undefined;
    const desktopBridge = typeof window !== 'undefined' ? window.neonDesktop : undefined;
    const hasDesktopDirectoryPicker = Boolean(desktopBridge);

    const openCreateWorkspace = () => {
        const initialDraft = resolveWorkspaceDefaultDraft({
            providers,
            providerModels,
            defaults: runtimeDefaults,
        });
        setWorkspaceLabelDraft('');
        setWorkspacePathDraft('');
        setWorkspaceDefaultTopLevelTabDraft(initialDraft.topLevelTab);
        setWorkspaceDefaultProviderIdDraft(initialDraft.providerId);
        setWorkspaceDefaultModelIdDraft(initialDraft.modelId);
        setIsCreateOpen(true);
    };

    const createDefaultProvider = workspaceDefaultProviderIdDraft
        ? providers.find((provider) => provider.id === workspaceDefaultProviderIdDraft)
        : undefined;
    const createModelOptions = buildWorkspaceModelOptions(createDefaultProvider, providerModels);
    const createSelectedModelId =
        workspaceDefaultModelIdDraft && createModelOptions.some((option) => option.id === workspaceDefaultModelIdDraft)
            ? workspaceDefaultModelIdDraft
            : createModelOptions[0]?.id ?? '';
    const createSelectedModelOption = createModelOptions.find((option) => option.id === createSelectedModelId);

    const handleCreateWorkspace = async () => {
        const result = await registerWorkspaceRootMutation.mutateAsync({
            profileId,
            absolutePath: workspacePathDraft,
            label: workspaceLabelDraft,
        });

        utils.runtime.listWorkspaceRoots.setData({ profileId }, (current) => ({
            workspaceRoots: current
                ? [result.workspaceRoot, ...current.workspaceRoots.filter((root) => root.fingerprint !== result.workspaceRoot.fingerprint)]
                : [result.workspaceRoot],
        }));
        utils.runtime.getShellBootstrap.setData({ profileId }, (current) =>
            current
                ? {
                      ...current,
                      workspaceRoots: [
                          result.workspaceRoot,
                          ...current.workspaceRoots.filter((root) => root.fingerprint !== result.workspaceRoot.fingerprint),
                      ],
                  }
                : current
        );

        await setWorkspacePreferenceMutation.mutateAsync({
            profileId,
            workspaceFingerprint: result.workspaceRoot.fingerprint,
            defaultTopLevelTab: workspaceDefaultTopLevelTabDraft,
            ...(workspaceDefaultProviderIdDraft
                ? { defaultProviderId: workspaceDefaultProviderIdDraft, defaultModelId: createSelectedModelId }
                : {}),
        });

        onSelectedWorkspaceFingerprintChange(result.workspaceRoot.fingerprint);
        setWorkspaceLabelDraft('');
        setWorkspacePathDraft('');
        setIsCreateOpen(false);
        onCreateThreadForWorkspace(result.workspaceRoot.fingerprint);
    };

    const browseForWorkspaceDirectory = () => {
        if (!desktopBridge || isPickingWorkspaceDirectory) {
            return;
        }

        setIsPickingWorkspaceDirectory(true);
        void desktopBridge
            .pickDirectory()
            .then((result) => {
                if (result.canceled) {
                    return;
                }

                setWorkspacePathDraft(result.absolutePath);
                if (workspaceLabelDraft.trim().length === 0) {
                    const nextLabel = result.absolutePath.split(/[\\/]/).filter(Boolean).at(-1);
                    if (nextLabel) {
                        setWorkspaceLabelDraft(nextLabel);
                    }
                }
            })
            .finally(() => {
                setIsPickingWorkspaceDirectory(false);
            });
    };

    return (
        <section className='flex h-full min-h-0 min-w-0 flex-1 overflow-hidden'>
            <aside className='border-border/80 bg-background/70 flex w-[288px] shrink-0 flex-col gap-4 border-r p-4'>
                <div className='space-y-1'>
                    <h2 className='text-sm font-semibold tracking-[0.18em] uppercase'>Workspaces</h2>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Register roots once, then keep sessions, sandboxes, and registry state anchored to them.
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
                            openCreateWorkspace();
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
                                <p className='text-muted-foreground mt-1 truncate text-xs'>{workspaceRoot.absolutePath}</p>
                            </button>
                        ))
                    ) : (
                        <div className='border-border/70 bg-card/30 rounded-[22px] border border-dashed px-4 py-5 text-sm text-muted-foreground'>
                            No workspaces match that search yet.
                        </div>
                    )}
                </div>
            </aside>

            <div className='min-h-0 min-w-0 flex-1 overflow-y-auto p-5 md:p-6'>
                {selectedWorkspace ? (
                    <div className='mx-auto flex max-w-5xl flex-col gap-5'>
                        <div className='flex flex-wrap items-start justify-between gap-3'>
                            <div className='space-y-1'>
                                <h3 className='text-2xl font-semibold text-balance'>{selectedWorkspace.label}</h3>
                                <p className='text-muted-foreground break-all text-sm leading-6'>
                                    {selectedWorkspace.absolutePath}
                                </p>
                            </div>

                            <div className='flex flex-wrap gap-2'>
                                <button
                                    type='button'
                                    className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-sm font-medium'
                                    onClick={() => {
                                        onOpenSessions();
                                    }}>
                                    Open sessions
                                </button>
                                <button
                                    type='button'
                                    className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-sm font-medium'
                                    disabled={refreshRegistryMutation.isPending}
                                    onClick={() => {
                                        void refreshRegistryMutation.mutateAsync({
                                            profileId,
                                            workspaceFingerprint: selectedWorkspace.fingerprint,
                                        });
                                    }}>
                                    {refreshRegistryMutation.isPending ? 'Refreshing…' : 'Refresh registry'}
                                </button>
                            </div>
                        </div>

                        <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                            <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Threads</p>
                                <p className='mt-2 text-2xl font-semibold'>{selectedWorkspaceThreads.length}</p>
                                <p className='text-muted-foreground mt-2 text-xs'>Conversations anchored to this workspace.</p>
                            </article>
                            <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Sessions</p>
                                <p className='mt-2 text-2xl font-semibold'>{selectedWorkspaceSessions.length}</p>
                                <p className='text-muted-foreground mt-2 text-xs'>Runnable sessions currently linked to these threads.</p>
                            </article>
                            <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Sandboxes</p>
                                <p className='mt-2 text-2xl font-semibold'>{selectedWorkspaceSandboxes.length}</p>
                                <p className='text-muted-foreground mt-2 text-xs'>Managed sandboxes for isolated execution.</p>
                            </article>
                            <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Last updated</p>
                                <p className='mt-2 text-sm font-semibold'>{formatTimestamp(selectedWorkspace.updatedAt)}</p>
                                <p className='text-muted-foreground mt-2 text-xs'>Workspace root registration timestamp.</p>
                            </article>
                        </div>

                        <section className='grid gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]'>
                            <div className='space-y-5'>
                                <article className='border-border/70 bg-card/55 rounded-[24px] border p-5'>
                                    <div className='space-y-1'>
                                        <p className='text-sm font-semibold'>Linked sessions</p>
                                        <p className='text-muted-foreground text-xs leading-5'>
                                            Sessions stay connected to the workspace through their conversation thread.
                                        </p>
                                    </div>

                                    <div className='mt-4 space-y-2'>
                                        {selectedWorkspaceSessions.length > 0 ? (
                                            selectedWorkspaceSessions.slice(0, 8).map((session) => (
                                                <div
                                                    key={session.id}
                                                    className='border-border/70 bg-background/70 rounded-2xl border px-3 py-3'>
                                                    <div className='flex items-center justify-between gap-3'>
                                                        <p className='text-sm font-medium'>{session.id}</p>
                                                        <span className='text-muted-foreground text-xs'>{session.runStatus}</span>
                                                    </div>
                                                    <p className='text-muted-foreground mt-2 text-xs'>
                                                        Updated {formatTimestamp(session.updatedAt)}
                                                    </p>
                                                </div>
                                            ))
                                        ) : (
                                            <p className='text-muted-foreground rounded-2xl border border-dashed px-4 py-5 text-sm'>
                                                No sessions are linked to this workspace yet.
                                            </p>
                                        )}
                                    </div>
                                </article>

                                <article className='border-border/70 bg-card/55 rounded-[24px] border p-5'>
                                    <div className='space-y-1'>
                                        <p className='text-sm font-semibold'>Registry and execution context</p>
                                        <p className='text-muted-foreground text-xs leading-5'>
                                            Workspace-local rules, skills, and sandboxes live here instead of being buried in
                                            settings.
                                        </p>
                                    </div>

                                    <div className='mt-4 grid gap-3 md:grid-cols-3'>
                                        <div className='rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                                            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Modes</p>
                                            <p className='mt-2 text-lg font-semibold'>
                                                {selectedWorkspaceRegistry?.resolved.modes.length ?? 0}
                                            </p>
                                        </div>
                                        <div className='rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                                            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Rules</p>
                                            <p className='mt-2 text-lg font-semibold'>
                                                {selectedWorkspaceRegistry?.resolved.rulesets.length ?? 0}
                                            </p>
                                        </div>
                                        <div className='rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                                            <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Skills</p>
                                            <p className='mt-2 text-lg font-semibold'>
                                                {selectedWorkspaceRegistry?.resolved.skillfiles.length ?? 0}
                                            </p>
                                        </div>
                                    </div>
                                </article>
                            </div>

                            <div className='space-y-5'>
                                <article className='border-border/70 bg-card/55 rounded-[24px] border p-5'>
                                    <div className='space-y-1'>
                                        <p className='text-sm font-semibold'>Workspace details</p>
                                        <p className='text-muted-foreground text-xs leading-5'>
                                            This root becomes the source of truth for workspace-scoped runs and registry discovery.
                                        </p>
                                    </div>

                                    <dl className='mt-4 space-y-3 text-sm'>
                                        <div>
                                            <dt className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Fingerprint</dt>
                                            <dd className='mt-1 break-all'>{selectedWorkspace.fingerprint}</dd>
                                        </div>
                                        <div>
                                            <dt className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Absolute path</dt>
                                            <dd className='mt-1 break-all'>{selectedWorkspace.absolutePath}</dd>
                                        </div>
                                    </dl>
                                </article>

                                <WorkspaceDefaultsSection
                                    key={selectedWorkspace.fingerprint}
                                    profileId={profileId}
                                    workspaceFingerprint={selectedWorkspace.fingerprint}
                                    providers={providers}
                                    providerModels={providerModels}
                                    defaults={runtimeDefaults}
                                    {...(selectedWorkspacePreference ? { workspacePreference: selectedWorkspacePreference } : {})}
                                />

                                <article className='border-destructive/30 bg-destructive/5 rounded-[24px] border p-5'>
                                    <div className='space-y-1'>
                                        <p className='text-sm font-semibold'>Destructive actions</p>
                                        <p className='text-muted-foreground text-xs leading-5'>
                                            Removing the workspace record itself is still a later cleanup. For now, destructive
                                            actions are scoped to conversations anchored here.
                                        </p>
                                    </div>

                                    <div className='mt-4 flex justify-end'>
                                        <button
                                            type='button'
                                            className='rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive disabled:cursor-not-allowed disabled:opacity-60'
                                            disabled={deleteWorkspaceThreadsMutation.isPending || selectedWorkspaceThreads.length === 0}
                                            onClick={() => {
                                                setConfirmDeleteWorkspaceFingerprint(selectedWorkspace.fingerprint);
                                            }}>
                                            Delete workspace conversations
                                        </button>
                                    </div>
                                </article>
                            </div>
                        </section>
                    </div>
                ) : (
                    <div className='mx-auto flex h-full max-w-3xl items-center justify-center'>
                        <div className='border-border/70 bg-card/40 space-y-2 rounded-[28px] border px-6 py-8 text-center'>
                            <p className='text-lg font-semibold'>No workspace selected</p>
                            <p className='text-muted-foreground text-sm leading-6'>
                                Choose an existing workspace from the rail or register a new root to make workspaces a
                                first-class part of the app.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <DialogSurface
                open={isCreateOpen}
                titleId='workspace-create-title'
                descriptionId='workspace-create-description'
                onClose={() => {
                    setIsCreateOpen(false);
                }}>
                <div className='border-border bg-background w-[min(92vw,34rem)] rounded-[28px] border p-5 shadow-xl'>
                    <div className='space-y-1'>
                        <h2 id='workspace-create-title' className='text-lg font-semibold'>
                            New workspace
                        </h2>
                        <p id='workspace-create-description' className='text-muted-foreground text-sm'>
                            Register the workspace once here, then use it across sessions, sandboxes, and registry flows.
                        </p>
                    </div>

                    <div className='mt-4 space-y-4'>
                        <label className='block space-y-2'>
                            <span className='text-sm font-medium'>Workspace name</span>
                            <input
                                type='text'
                                value={workspaceLabelDraft}
                                onChange={(event) => {
                                    setWorkspaceLabelDraft(event.target.value);
                                }}
                                className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                autoComplete='off'
                                placeholder='My workspace'
                            />
                        </label>

                        <div className='space-y-2'>
                            <span className='text-sm font-medium'>Folder path</span>
                            <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
                                <input
                                    type='text'
                                    value={workspacePathDraft}
                                    onChange={(event) => {
                                        setWorkspacePathDraft(event.target.value);
                                    }}
                                    className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                    autoComplete='off'
                                    placeholder=''
                                />
                                <button
                                    type='button'
                                    className='border-border bg-card hover:bg-accent rounded-2xl border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                                    disabled={isPickingWorkspaceDirectory || !hasDesktopDirectoryPicker}
                                    onClick={browseForWorkspaceDirectory}>
                                    {isPickingWorkspaceDirectory ? 'Opening…' : 'Browse…'}
                                </button>
                            </div>
                            <p className='text-muted-foreground text-xs'>
                                Paste a path directly or choose the folder in your OS file picker.
                            </p>
                        </div>

                        <div className='rounded-2xl border border-border/70 bg-card/35 px-4 py-3 text-sm'>
                            <p className='font-medium'>Detection preview</p>
                            <p className='text-muted-foreground mt-1 text-xs leading-5'>
                                NeonConductor will treat the selected folder as the workspace root and use it for
                                sessions, tool execution, and registry discovery.
                            </p>
                        </div>

                        <div className='space-y-4 rounded-2xl border border-border/70 bg-card/35 px-4 py-4'>
                            <div className='space-y-1'>
                                <p className='text-sm font-medium'>Workspace defaults</p>
                                <p className='text-muted-foreground text-xs leading-5'>
                                    These defaults seed new threads in the workspace before the active header can override them.
                                </p>
                            </div>

                            <div className='grid gap-4 md:grid-cols-[minmax(0,0.26fr)_minmax(0,0.26fr)_minmax(0,0.48fr)]'>
                                <label className='space-y-2'>
                                    <span className='text-sm font-medium'>Mode</span>
                                    <select
                                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                        value={workspaceDefaultTopLevelTabDraft}
                                        onChange={(event) => {
                                            const nextValue = event.target.value;
                                            if (nextValue === 'chat' || nextValue === 'agent' || nextValue === 'orchestrator') {
                                                setWorkspaceDefaultTopLevelTabDraft(nextValue);
                                            }
                                        }}>
                                        <option value='chat'>{topLevelTabLabel('chat')}</option>
                                        <option value='agent'>{topLevelTabLabel('agent')}</option>
                                        <option value='orchestrator'>{topLevelTabLabel('orchestrator')}</option>
                                    </select>
                                </label>

                                <label className='space-y-2'>
                                    <span className='text-sm font-medium'>Provider</span>
                                    <select
                                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                        value={workspaceDefaultProviderIdDraft ?? ''}
                                        onChange={(event) => {
                                            const nextProviderId = providers.find((provider) => provider.id === event.target.value)?.id;
                                            setWorkspaceDefaultProviderIdDraft(nextProviderId);
                                            const nextProvider = nextProviderId
                                                ? providers.find((provider) => provider.id === nextProviderId)
                                                : undefined;
                                            const nextModelId = buildWorkspaceModelOptions(nextProvider, providerModels)[0]?.id ?? '';
                                            setWorkspaceDefaultModelIdDraft(nextModelId);
                                        }}>
                                        {providers.map((provider) => (
                                            <option key={provider.id} value={provider.id}>
                                                {provider.label}
                                            </option>
                                        ))}
                                    </select>
                                </label>

                                <label className='space-y-2'>
                                    <span className='text-sm font-medium'>Model</span>
                                    <ModelPicker
                                        providerId={workspaceDefaultProviderIdDraft}
                                        selectedModelId={createSelectedModelId}
                                        models={createModelOptions}
                                        ariaLabel='Workspace default model'
                                        placeholder='Select a model'
                                        onSelectModel={setWorkspaceDefaultModelIdDraft}
                                        onSelectOption={(option: { providerId?: string; id: string }) => {
                                            if (option.providerId && option.providerId !== workspaceDefaultProviderIdDraft) {
                                                setWorkspaceDefaultProviderIdDraft(option.providerId as RuntimeProviderId);
                                            }
                                            setWorkspaceDefaultModelIdDraft(option.id);
                                        }}
                                    />
                                    {createSelectedModelOption?.compatibilityReason &&
                                    createSelectedModelOption.compatibilityScope !== 'provider' ? (
                                        <p className='text-muted-foreground text-xs'>{createSelectedModelOption.compatibilityReason}</p>
                                    ) : null}
                                </label>
                            </div>
                        </div>
                    </div>

                    <div className='mt-5 flex items-center justify-end gap-2 border-t border-border/70 pt-4'>
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                            onClick={() => {
                                setIsCreateOpen(false);
                            }}>
                            Cancel
                        </button>
                        <button
                            type='button'
                            className='rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={
                                registerWorkspaceRootMutation.isPending ||
                                setWorkspacePreferenceMutation.isPending ||
                                workspacePathDraft.trim().length === 0 ||
                                workspaceLabelDraft.trim().length === 0 ||
                                !workspaceDefaultProviderIdDraft ||
                                createSelectedModelId.length === 0
                            }
                            onClick={() => {
                                void handleCreateWorkspace();
                            }}>
                            {registerWorkspaceRootMutation.isPending || setWorkspacePreferenceMutation.isPending
                                ? 'Saving…'
                                : 'Save workspace'}
                        </button>
                    </div>
                </div>
            </DialogSurface>

            <ConfirmDialog
                open={Boolean(pendingDeleteWorkspace)}
                title='Delete Workspace Conversations'
                message='Delete all conversations anchored to this workspace? This does not remove the workspace root on disk.'
                confirmLabel='Delete conversations'
                destructive
                busy={deleteWorkspaceThreadsMutation.isPending}
                onCancel={() => {
                    setConfirmDeleteWorkspaceFingerprint(undefined);
                }}
                onConfirm={() => {
                    if (!pendingDeleteWorkspace) {
                        return;
                    }

                    void deleteWorkspaceThreadsMutation.mutateAsync({
                        profileId,
                        workspaceFingerprint: pendingDeleteWorkspace.fingerprint,
                        includeFavorites: false,
                    });
                }}
            />
        </section>
    );
}
