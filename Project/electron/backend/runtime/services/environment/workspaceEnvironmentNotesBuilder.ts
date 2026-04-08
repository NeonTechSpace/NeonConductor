import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentMarkers,
    WorkspaceEnvironmentEffectivePreferences,
    WorkspaceProjectNodeExpectation,
    WorkspaceEnvironmentSnapshot,
} from '@/app/backend/runtime/contracts/types/runtime';

function isNodeWorkspace(markers: WorkspaceEnvironmentMarkers): boolean {
    return markers.hasPackageJson || markers.hasTsconfigJson;
}

function isPythonWorkspace(markers: WorkspaceEnvironmentMarkers): boolean {
    return markers.hasPyprojectToml || markers.hasRequirementsTxt;
}

export function buildWorkspaceEnvironmentNotes(input: {
    platform: WorkspaceEnvironmentSnapshot['platform'];
    shellFamily: WorkspaceEnvironmentSnapshot['shellFamily'];
    shellExecutable?: WorkspaceEnvironmentSnapshot['shellExecutable'];
    markers: WorkspaceEnvironmentMarkers;
    availableCommands: WorkspaceEnvironmentCommandAvailability;
    effectivePreferences: WorkspaceEnvironmentEffectivePreferences;
    vendoredNode: WorkspaceEnvironmentSnapshot['vendoredNode'];
    projectNodeExpectation?: WorkspaceProjectNodeExpectation;
}): string[] {
    const notes: string[] = [];

    if (input.platform === 'win32' && !input.shellExecutable) {
        notes.push('Windows command execution could not resolve pwsh.exe, powershell.exe, or cmd.exe.');
    } else if (input.shellFamily === 'powershell') {
        if (input.shellExecutable === 'pwsh.exe') {
            notes.push('Command execution uses PowerShell 7 via pwsh.exe. Do not assume POSIX shell syntax.');
        } else if (input.shellExecutable === 'powershell.exe') {
            notes.push('Command execution uses legacy Windows PowerShell via powershell.exe. Do not assume POSIX shell syntax.');
        } else {
            notes.push('Windows command execution is configured for PowerShell, but no supported PowerShell executable was resolved.');
        }
    } else if (input.shellFamily === 'cmd') {
        notes.push('Command execution uses Windows Command Prompt via cmd.exe fallback. Do not assume PowerShell or POSIX shell syntax.');
    } else {
        notes.push('Command execution uses a /bin/sh-style shell. Do not assume PowerShell syntax.');
    }

    if (input.effectivePreferences.vcs.family === 'jj') {
        notes.push('This workspace appears to be jj-managed. Prefer jj for repo inspection and history operations.');
        if (input.markers.hasJjDirectory) {
            notes.push('Detached git HEAD may be expected here because jj can manage the workspace.');
        }
    } else if (input.effectivePreferences.vcs.family === 'git') {
        notes.push('This workspace appears to prefer git for repo inspection and history operations.');
    } else if (input.markers.hasJjDirectory && !input.availableCommands.jj.available) {
        notes.push('This workspace has a .jj marker, but jj is not available on this machine.');
    } else if (input.markers.hasGitDirectory && !input.availableCommands.git.available) {
        notes.push('This workspace has a .git marker, but git is not available on this machine.');
    }

    if (input.effectivePreferences.packageManager.family !== 'unknown') {
        notes.push(`This workspace prefers ${input.effectivePreferences.packageManager.family}.`);
    } else if (input.markers.hasPnpmLock && !input.availableCommands.pnpm.available) {
        notes.push('This workspace signals pnpm via pnpm-lock.yaml, but pnpm is not available on this machine.');
    } else if (input.markers.hasPackageLock && !input.availableCommands.npm.available) {
        notes.push('This workspace signals npm via package-lock.json, but npm is not available on this machine.');
    } else if (input.markers.hasYarnLock && !input.availableCommands.yarn.available) {
        notes.push('This workspace signals yarn via yarn.lock, but yarn is not available on this machine.');
    } else if (input.markers.hasBunLock && !input.availableCommands.bun.available) {
        notes.push('This workspace signals bun via a bun lockfile, but bun is not available on this machine.');
    }

    if (isNodeWorkspace(input.markers)) {
        if (input.availableCommands.node.available) {
            notes.push('This workspace looks Node/TypeScript-oriented.');
        } else {
            notes.push('This workspace looks Node/TypeScript-oriented, but node is not available on this machine.');
        }
    }

    if (input.availableCommands.tsx.available && isNodeWorkspace(input.markers)) {
        notes.push('tsx is available for TypeScript repo scripts and utilities.');
    }

    if (!input.availableCommands.python.available && !input.availableCommands.python3.available) {
        notes.push('Do not assume Python is available for repo-local scripts.');
    } else if (
        isPythonWorkspace(input.markers) &&
        !input.availableCommands.python.available &&
        input.availableCommands.python3.available
    ) {
        notes.push('Python is available through python3 rather than python.');
    }

    if (input.effectivePreferences.vcs.mismatch) {
        notes.push(
            `The pinned VCS preference "${input.effectivePreferences.vcs.family}" is not available on this machine.`
        );
    }

    if (input.effectivePreferences.packageManager.mismatch) {
        notes.push(
            `The pinned package manager preference "${input.effectivePreferences.packageManager.family}" is not available on this machine.`
        );
    }

    return notes;
}
