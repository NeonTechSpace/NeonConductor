import { WorkspaceDefaultsSection, formatTimestamp } from '@/web/components/workspaces/workspacesSurfaceSections';
import { WorkspaceEnvironmentSection } from '@/web/components/workspaces/workspaceEnvironmentSection';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';
import type { WorkspacePreferenceRecord } from '@/app/backend/runtime/contracts/types/runtime';

export function WorkspaceDetailsPanel(input: {
    profileId: string;
    selectedWorkspace: {
        fingerprint: string;
        label: string;
        absolutePath: string;
        updatedAt: string;
    };
    selectedWorkspaceThreads: Array<{ id: string }>;
    selectedWorkspaceSessions: Array<{ id: string; updatedAt: string; runStatus: string }>;
    selectedWorkspaceSandboxes: unknown[];
    selectedWorkspaceRegistry:
        | {
              resolved: {
                  modes: unknown[];
                  rulesets: unknown[];
                  skillfiles: unknown[];
              };
          }
        | undefined;
    selectedWorkspacePreference?: WorkspacePreferenceRecord;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    isRefreshingRegistry: boolean;
    isDeletingWorkspaceConversations: boolean;
    onOpenSessions: () => void;
    onRefreshRegistry: () => void;
    onRequestDeleteConversations: () => void;
}) {
    return (
        <div className='mx-auto flex max-w-5xl flex-col gap-5'>
            <div className='flex flex-wrap items-start justify-between gap-3'>
                <div className='space-y-1'>
                    <h3 className='text-2xl font-semibold text-balance'>{input.selectedWorkspace.label}</h3>
                    <p className='text-muted-foreground break-all text-sm leading-6'>
                        {input.selectedWorkspace.absolutePath}
                    </p>
                </div>

                <div className='flex flex-wrap gap-2'>
                    <button
                        type='button'
                        className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-sm font-medium'
                        onClick={input.onOpenSessions}>
                        Open sessions
                    </button>
                    <button
                        type='button'
                        className='border-border bg-card hover:bg-accent rounded-full border px-3 py-1.5 text-sm font-medium'
                        disabled={input.isRefreshingRegistry}
                        onClick={input.onRefreshRegistry}>
                        {input.isRefreshingRegistry ? 'Refreshing…' : 'Refresh registry'}
                    </button>
                </div>
            </div>

            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-4'>
                <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Threads</p>
                    <p className='mt-2 text-2xl font-semibold'>{input.selectedWorkspaceThreads.length}</p>
                    <p className='text-muted-foreground mt-2 text-xs'>Conversations anchored to this workspace.</p>
                </article>
                <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Sessions</p>
                    <p className='mt-2 text-2xl font-semibold'>{input.selectedWorkspaceSessions.length}</p>
                    <p className='text-muted-foreground mt-2 text-xs'>Runnable sessions currently linked to these threads.</p>
                </article>
                <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Sandboxes</p>
                    <p className='mt-2 text-2xl font-semibold'>{input.selectedWorkspaceSandboxes.length}</p>
                    <p className='text-muted-foreground mt-2 text-xs'>Managed sandboxes for isolated execution.</p>
                </article>
                <article className='border-border/70 bg-card/55 rounded-[22px] border p-4'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.14em] uppercase'>Last updated</p>
                    <p className='mt-2 text-sm font-semibold'>{formatTimestamp(input.selectedWorkspace.updatedAt)}</p>
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
                            {input.selectedWorkspaceSessions.length > 0 ? (
                                input.selectedWorkspaceSessions.slice(0, 8).map((session) => (
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
                                Workspace-local rules, skills, and sandboxes live here instead of being buried in settings.
                            </p>
                        </div>

                        <div className='mt-4 grid gap-3 md:grid-cols-3'>
                            <div className='rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Modes</p>
                                <p className='mt-2 text-lg font-semibold'>
                                    {input.selectedWorkspaceRegistry?.resolved.modes.length ?? 0}
                                </p>
                            </div>
                            <div className='rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Rules</p>
                                <p className='mt-2 text-lg font-semibold'>
                                    {input.selectedWorkspaceRegistry?.resolved.rulesets.length ?? 0}
                                </p>
                            </div>
                            <div className='rounded-2xl border border-border/70 bg-background/70 px-4 py-3'>
                                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>Skills</p>
                                <p className='mt-2 text-lg font-semibold'>
                                    {input.selectedWorkspaceRegistry?.resolved.skillfiles.length ?? 0}
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
                                <dd className='mt-1 break-all'>{input.selectedWorkspace.fingerprint}</dd>
                            </div>
                            <div>
                                <dt className='text-muted-foreground text-xs font-semibold tracking-[0.12em] uppercase'>Absolute path</dt>
                                <dd className='mt-1 break-all'>{input.selectedWorkspace.absolutePath}</dd>
                            </div>
                        </dl>
                    </article>

                    <WorkspaceDefaultsSection
                        key={input.selectedWorkspace.fingerprint}
                        profileId={input.profileId}
                        workspaceFingerprint={input.selectedWorkspace.fingerprint}
                        providers={input.providers}
                        providerModels={input.providerModels}
                        defaults={input.defaults}
                        {...(input.selectedWorkspacePreference ? { workspacePreference: input.selectedWorkspacePreference } : {})}
                    />

                    <WorkspaceEnvironmentSection
                        key={`environment-${input.selectedWorkspace.fingerprint}`}
                        profileId={input.profileId}
                        workspaceFingerprint={input.selectedWorkspace.fingerprint}
                        {...(input.selectedWorkspacePreference ? { workspacePreference: input.selectedWorkspacePreference } : {})}
                    />

                    <article className='border-destructive/30 bg-destructive/5 rounded-[24px] border p-5'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>Destructive actions</p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                Removing the workspace record itself is still a later cleanup. For now, destructive actions
                                are scoped to conversations anchored here.
                            </p>
                        </div>

                        <div className='mt-4 flex justify-end'>
                            <button
                                type='button'
                                className='rounded-full border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive disabled:cursor-not-allowed disabled:opacity-60'
                                disabled={
                                    input.isDeletingWorkspaceConversations || input.selectedWorkspaceThreads.length === 0
                                }
                                onClick={input.onRequestDeleteConversations}>
                                Delete workspace conversations
                            </button>
                        </div>
                    </article>
                </div>
            </section>
        </div>
    );
}
