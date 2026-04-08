import { useWorkspaceEnvironmentPreferencesController } from '@/web/components/workspaces/useWorkspaceEnvironmentPreferencesController';

import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceProjectNodeExpectation,
    WorkspaceEnvironmentSnapshot,
    WorkspacePreferenceRecord,
    WorkspacePreferredPackageManager,
    WorkspacePreferredVcs,
} from '@/shared/contracts/types/runtime';

const commandAvailabilityKeys = [
    'jj',
    'git',
    'node',
    'python',
    'python3',
    'pnpm',
    'npm',
    'yarn',
    'bun',
    'tsx',
] as const satisfies ReadonlyArray<keyof WorkspaceEnvironmentCommandAvailability>;

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

    if (value === 'cmd') {
        return 'Command Prompt';
    }

    if (value === 'win32') {
        return 'Windows';
    }

    if (value === 'darwin') {
        return 'macOS';
    }

    if (value === 'linux') {
        return 'Linux';
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

function getAvailableCommandLabels(snapshot: WorkspaceEnvironmentSnapshot): string[] {
    return commandAvailabilityKeys.filter((command) => snapshot.availableCommands[command].available);
}

function listAvailableCommands(snapshot: WorkspaceEnvironmentSnapshot): string {
    const labels = getAvailableCommandLabels(snapshot);

    return labels.length > 0 ? labels.join(', ') : 'None detected';
}

function formatShellSummary(snapshot: WorkspaceEnvironmentSnapshot): string {
    if (snapshot.platform === 'win32' && !snapshot.shellExecutable) {
        return 'Windows shell unresolved';
    }

    const familyLabel = formatFamilyLabel(snapshot.shellFamily);
    if (!snapshot.shellExecutable) {
        return `${formatFamilyLabel(snapshot.platform)} via ${familyLabel}`;
    }

    return `${formatFamilyLabel(snapshot.platform)} via ${familyLabel} (${snapshot.shellExecutable})`;
}

function formatVendoredNodeSummary(snapshot: WorkspaceEnvironmentSnapshot): string {
    if (snapshot.vendoredNode.available) {
        const targetSuffix = snapshot.vendoredNode.targetKey ? ` (${snapshot.vendoredNode.targetKey})` : '';
        return `Vendored Node v${snapshot.vendoredNode.version} available${targetSuffix}`;
    }

    if (snapshot.vendoredNode.reason === 'unsupported_target') {
        return `Vendored Node v${snapshot.vendoredNode.version}: Unavailable for this platform/architecture`;
    }

    return `Vendored Node v${snapshot.vendoredNode.version}: Missing packaged/runtime asset`;
}

function formatProjectNodeExpectationSource(
    source: WorkspaceProjectNodeExpectation['source']
): string {
    if (source === 'package_json_engines') {
        return 'package.json engines';
    }

    if (source === 'nvmrc') {
        return '.nvmrc';
    }

    if (source === 'node_version_file') {
        return '.node-version';
    }

    return 'workspace markers';
}

function formatProjectNodeExpectation(snapshot: WorkspaceEnvironmentSnapshot): string | undefined {
    if (!snapshot.projectNodeExpectation) {
        return undefined;
    }

    if (snapshot.projectNodeExpectation.source === 'node_workspace_heuristic') {
        return 'No explicit root Node version found';
    }

    const rawValue = snapshot.projectNodeExpectation.rawValue?.trim();
    if (!rawValue) {
        return undefined;
    }

    return `Workspace expects ${rawValue} from ${formatProjectNodeExpectationSource(snapshot.projectNodeExpectation.source)}`;
}

function formatProjectNodeCompatibility(snapshot: WorkspaceEnvironmentSnapshot): string | undefined {
    if (!snapshot.projectNodeExpectation) {
        return undefined;
    }

    if (snapshot.projectNodeExpectation.satisfiesVendoredNode === true) {
        return 'Matches vendored Node';
    }

    if (snapshot.projectNodeExpectation.satisfiesVendoredNode === false) {
        return 'Does not match vendored Node';
    }

    return undefined;
}

function RuntimeEnvironmentSummary({ snapshot }: { snapshot: WorkspaceEnvironmentSnapshot }) {
    const projectNodeExpectation = formatProjectNodeExpectation(snapshot);
    const projectNodeCompatibility = formatProjectNodeCompatibility(snapshot);

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
                    <p className='text-muted-foreground mt-1 text-xs leading-5'>{formatVendoredNodeSummary(snapshot)}</p>
                    {projectNodeExpectation ? (
                        <p className='text-muted-foreground mt-1 text-xs leading-5'>{projectNodeExpectation}</p>
                    ) : null}
                    {projectNodeCompatibility ? (
                        <p className='text-muted-foreground mt-1 text-xs leading-5'>{projectNodeCompatibility}</p>
                    ) : null}
                </div>
            </div>

            <div className='border-border/70 bg-background/70 rounded-2xl border px-4 py-3'>
                <p className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    Platform and Commands
                </p>
                <p className='mt-2 text-sm'>{formatShellSummary(snapshot)}</p>
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
    const controller = useWorkspaceEnvironmentPreferencesController({
        profileId: input.profileId,
        workspaceFingerprint: input.workspaceFingerprint,
        ...(input.workspacePreference ? { workspacePreference: input.workspacePreference } : {}),
    });

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
                {controller.environmentIsLoading ? (
                    <p className='text-muted-foreground text-sm'>Inspecting the workspace environment…</p>
                ) : controller.environmentErrorMessage ? (
                    <p className='text-destructive text-sm'>{controller.environmentErrorMessage}</p>
                ) : controller.environmentSnapshot ? (
                    <RuntimeEnvironmentSummary snapshot={controller.environmentSnapshot} />
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
                        value={controller.preferredVcs}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === 'auto' || nextValue === 'jj' || nextValue === 'git') {
                                controller.selectPreferredVcs(nextValue);
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
                        value={controller.preferredPackageManager}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            if (
                                nextValue === 'auto' ||
                                nextValue === 'pnpm' ||
                                nextValue === 'npm' ||
                                nextValue === 'yarn' ||
                                nextValue === 'bun'
                            ) {
                                controller.selectPreferredPackageManager(nextValue);
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
                {controller.feedbackMessage ? (
                    <p className='text-muted-foreground mr-auto text-xs'>{controller.feedbackMessage}</p>
                ) : null}
                <button
                    type='button'
                    className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={!controller.hasPendingChanges || controller.isSaving}
                    onClick={() => {
                        void controller.savePreferences();
                    }}>
                    {controller.isSaving ? 'Saving…' : 'Save tool preferences'}
                </button>
            </div>
        </article>
    );
}

