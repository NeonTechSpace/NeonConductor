import { useState } from 'react';

import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentCommandAvailabilityEntry,
    WorkspaceEnvironmentSnapshot,
    WorkspacePreferenceRecord,
    WorkspacePreferredPackageManager,
    WorkspacePreferredVcs,
} from '@/shared/contracts/types/runtime';

function formatFamilyLabel(value: string): string {
    if (value === 'unknown') {
        return 'Not detected';
    }

    if (value === 'posix_sh') {
        return 'POSIX sh';
    }

    if (value === 'powershell') {
        return 'PowerShell';
    }

    if (value === 'jj') {
        return 'Jujutsu (jj)';
    }

    if (value === 'git') {
        return 'Git';
    }

    if (value === 'node') {
        return 'Node.js';
    }

    if (value === 'python3') {
        return 'Python 3';
    }

    return value;
}

function formatOverrideLabel(value: WorkspacePreferredVcs | WorkspacePreferredPackageManager): string {
    if (value === 'auto') {
        return 'Auto';
    }

    return value;
}

function listAvailableCommands(snapshot: WorkspaceEnvironmentSnapshot): string {
    const labels = (Object.entries(snapshot.availableCommands) as Array<
        [keyof WorkspaceEnvironmentCommandAvailability, WorkspaceEnvironmentCommandAvailabilityEntry]
    >)
        .filter(([, details]) => details.available)
        .map(([command]) => command);

    return labels.length > 0 ? labels.join(', ') : 'None detected';
}

function RuntimeEnvironmentSummary({ snapshot }: { snapshot: WorkspaceEnvironmentSnapshot }) {
    return (
        <div className='space-y-3'>
            <div className='grid gap-3 md:grid-cols-3'>
                <div className='border-border/70 bg-background/70 rounded-2xl border px-4 py-3'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Version control
                    </p>
                    <p className='mt-2 text-sm font-semibold'>
                        {formatFamilyLabel(snapshot.effectivePreferences.vcs.family)}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Detected {formatFamilyLabel(snapshot.detectedPreferences.vcs)}
                    </p>
                </div>
                <div className='border-border/70 bg-background/70 rounded-2xl border px-4 py-3'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Package Manager
                    </p>
                    <p className='mt-2 text-sm font-semibold'>
                        {formatFamilyLabel(snapshot.effectivePreferences.packageManager.family)}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Detected {formatFamilyLabel(snapshot.detectedPreferences.packageManager)}
                    </p>
                </div>
                <div className='border-border/70 bg-background/70 rounded-2xl border px-4 py-3'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Runtime
                    </p>
                    <p className='mt-2 text-sm font-semibold'>
                        {formatFamilyLabel(snapshot.effectivePreferences.runtime)}
                    </p>
                    <p className='text-muted-foreground mt-1 text-xs'>
                        Script runner {formatFamilyLabel(snapshot.effectivePreferences.scriptRunner)}
                    </p>
                </div>
            </div>

            <div className='border-border/70 bg-background/70 rounded-2xl border px-4 py-3'>
                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    Platform and Commands
                </p>
                <p className='mt-2 text-sm'>
                    {formatFamilyLabel(snapshot.platform)} via {formatFamilyLabel(snapshot.shellFamily)}
                </p>
                <p className='text-muted-foreground mt-1 text-xs leading-5'>
                    Available commands: {listAvailableCommands(snapshot)}
                </p>
            </div>

            {snapshot.notes.length > 0 ? (
                <div className='border-border/70 bg-background/70 rounded-2xl border px-4 py-3'>
                    <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Guidance
                    </p>
                    <div className='mt-2 space-y-1'>
                        {snapshot.notes.map((note) => (
                            <p key={note} className='text-muted-foreground text-xs leading-5'>
                                {note}
                            </p>
                        ))}
                    </div>
                </div>
            ) : null}
        </div>
    );
}

export function WorkspaceEnvironmentPreviewCard(input: {
    snapshot: WorkspaceEnvironmentSnapshot | undefined;
    isLoading: boolean;
    errorMessage: string | undefined;
    emptyMessage: string;
}) {
    return (
        <div className='border-border/70 bg-card/35 rounded-2xl border px-4 py-3 text-sm'>
            <p className='font-medium'>Tool detection preview</p>
            {input.isLoading ? (
                <p className='text-muted-foreground mt-1 text-xs leading-5'>
                    Checking which tools this folder can use…
                </p>
            ) : input.errorMessage ? (
                <p className='text-destructive mt-1 text-xs leading-5'>{input.errorMessage}</p>
            ) : input.snapshot ? (
                <div className='mt-3'>
                    <RuntimeEnvironmentSummary snapshot={input.snapshot} />
                </div>
            ) : (
                <p className='text-muted-foreground mt-1 text-xs leading-5'>{input.emptyMessage}</p>
            )}
        </div>
    );
}

export function WorkspaceEnvironmentSection(input: {
    profileId: string;
    workspaceFingerprint: string;
    workspacePreference?: WorkspacePreferenceRecord;
}) {
    const utils = trpc.useUtils();
    const [preferredVcs, setPreferredVcs] = useState<WorkspacePreferredVcs>(
        input.workspacePreference?.preferredVcs ?? 'auto'
    );
    const [preferredPackageManager, setPreferredPackageManager] = useState<WorkspacePreferredPackageManager>(
        input.workspacePreference?.preferredPackageManager ?? 'auto'
    );
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const environmentQuery = trpc.runtime.inspectWorkspaceEnvironment.useQuery(
        {
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
        },
        PROGRESSIVE_QUERY_OPTIONS
    );
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            utils.runtime.getShellBootstrap.setData({ profileId: input.profileId }, (current) =>
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
            setFeedbackMessage('Saved the tool preferences Neon should use for this workspace.');
            void environmentQuery.refetch();
        },
        onError: () => {
            setFeedbackMessage('Could not save workspace tool preferences.');
        },
    });
    const currentPreferredVcs = input.workspacePreference?.preferredVcs ?? 'auto';
    const currentPreferredPackageManager = input.workspacePreference?.preferredPackageManager ?? 'auto';
    const hasPendingChanges =
        preferredVcs !== currentPreferredVcs || preferredPackageManager !== currentPreferredPackageManager;

    async function handleSaveOverrides() {
        await setWorkspacePreferenceMutation.mutateAsync({
            profileId: input.profileId,
            workspaceFingerprint: input.workspaceFingerprint,
            preferredVcs,
            preferredPackageManager,
        });
    }

    return (
        <article className='border-border/70 bg-card/55 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Tools Neon should use in this workspace</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Neon detects which tools are available in this folder. The choices below only tell Neon which tool
                    to prefer when more than one is available.
                </p>
            </div>

            <div className='mt-4'>
                {environmentQuery.isLoading ? (
                    <p className='text-muted-foreground text-sm'>Inspecting the workspace environment…</p>
                ) : environmentQuery.error ? (
                    <p className='text-destructive text-sm'>{environmentQuery.error.message}</p>
                ) : environmentQuery.data ? (
                    <RuntimeEnvironmentSummary snapshot={environmentQuery.data.snapshot} />
                ) : (
                    <p className='text-muted-foreground text-sm'>
                        Environment data is not available for this workspace yet.
                    </p>
                )}
            </div>

            <div className='border-border/70 mt-4 grid gap-4 border-t pt-4 md:grid-cols-2'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Version control to prefer
                    </span>
                    <select
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        value={preferredVcs}
                        onChange={(event) => {
                            setFeedbackMessage(undefined);
                            const nextValue = event.target.value;
                            if (nextValue === 'auto' || nextValue === 'jj' || nextValue === 'git') {
                                setPreferredVcs(nextValue);
                            }
                        }}>
                        <option value='auto'>{formatOverrideLabel('auto')}</option>
                        <option value='jj'>{formatOverrideLabel('jj')}</option>
                        <option value='git'>{formatOverrideLabel('git')}</option>
                    </select>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Auto uses the version control tool Neon detected for this folder.
                    </p>
                </label>

                <label className='space-y-2'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Package manager to prefer
                    </span>
                    <select
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        value={preferredPackageManager}
                        onChange={(event) => {
                            setFeedbackMessage(undefined);
                            const nextValue = event.target.value;
                            if (
                                nextValue === 'auto' ||
                                nextValue === 'pnpm' ||
                                nextValue === 'npm' ||
                                nextValue === 'yarn' ||
                                nextValue === 'bun'
                            ) {
                                setPreferredPackageManager(nextValue);
                            }
                        }}>
                        <option value='auto'>{formatOverrideLabel('auto')}</option>
                        <option value='pnpm'>{formatOverrideLabel('pnpm')}</option>
                        <option value='npm'>{formatOverrideLabel('npm')}</option>
                        <option value='yarn'>{formatOverrideLabel('yarn')}</option>
                        <option value='bun'>{formatOverrideLabel('bun')}</option>
                    </select>
                    <p className='text-muted-foreground text-xs leading-5'>
                        Auto uses the package manager Neon detected for this folder.
                    </p>
                </label>
            </div>

            <div className='border-border/70 mt-4 flex items-center justify-end gap-2 border-t pt-4'>
                {feedbackMessage ? <p className='text-muted-foreground mr-auto text-xs'>{feedbackMessage}</p> : null}
                <button
                    type='button'
                    className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={!hasPendingChanges || setWorkspacePreferenceMutation.isPending}
                    onClick={() => {
                        void handleSaveOverrides();
                    }}>
                    {setWorkspacePreferenceMutation.isPending ? 'Saving…' : 'Save tool preferences'}
                </button>
            </div>
        </article>
    );
}

