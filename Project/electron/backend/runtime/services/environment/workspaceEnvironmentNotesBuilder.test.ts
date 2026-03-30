import { describe, expect, it } from 'vitest';

import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentEffectivePreferences,
    WorkspaceEnvironmentMarkers,
} from '@/app/backend/runtime/contracts/types/runtime';
import { buildWorkspaceEnvironmentNotes } from '@/app/backend/runtime/services/environment/workspaceEnvironmentNotesBuilder';

function buildMarkers(input: Partial<WorkspaceEnvironmentMarkers>): WorkspaceEnvironmentMarkers {
    return {
        hasJjDirectory: input.hasJjDirectory ?? false,
        hasGitDirectory: input.hasGitDirectory ?? false,
        hasPackageJson: input.hasPackageJson ?? false,
        hasPnpmLock: input.hasPnpmLock ?? false,
        hasPackageLock: input.hasPackageLock ?? false,
        hasYarnLock: input.hasYarnLock ?? false,
        hasBunLock: input.hasBunLock ?? false,
        hasTsconfigJson: input.hasTsconfigJson ?? false,
        hasPyprojectToml: input.hasPyprojectToml ?? false,
        hasRequirementsTxt: input.hasRequirementsTxt ?? false,
    };
}

function buildCommands(input: Partial<WorkspaceEnvironmentCommandAvailability>): WorkspaceEnvironmentCommandAvailability {
    return {
        jj: input.jj ?? { available: false },
        git: input.git ?? { available: false },
        node: input.node ?? { available: false },
        python: input.python ?? { available: false },
        python3: input.python3 ?? { available: false },
        pnpm: input.pnpm ?? { available: false },
        npm: input.npm ?? { available: false },
        yarn: input.yarn ?? { available: false },
        bun: input.bun ?? { available: false },
        tsx: input.tsx ?? { available: false },
    };
}

function buildEffectivePreferences(input: {
    vcs: WorkspaceEnvironmentEffectivePreferences['vcs'];
    packageManager: WorkspaceEnvironmentEffectivePreferences['packageManager'];
}): WorkspaceEnvironmentEffectivePreferences {
    return {
        vcs: input.vcs,
        packageManager: input.packageManager,
        runtime: 'node',
        scriptRunner: 'tsx',
    };
}

describe('workspaceEnvironmentNotesBuilder', () => {
    it('describes shell, repo, runtime, and pinned override mismatches', () => {
        const notes = buildWorkspaceEnvironmentNotes({
            shellFamily: 'powershell',
            markers: buildMarkers({
                hasJjDirectory: true,
                hasPackageJson: true,
                hasTsconfigJson: true,
                hasPnpmLock: true,
            }),
            availableCommands: buildCommands({
                jj: { available: false },
                node: { available: true, executablePath: 'C:\\Tools\\node.exe' },
                tsx: { available: true, executablePath: 'C:\\Tools\\tsx.cmd' },
                python3: { available: true, executablePath: 'C:\\Tools\\python3.exe' },
            }),
            effectivePreferences: buildEffectivePreferences({
                vcs: {
                    family: 'jj',
                    source: 'override',
                    requestedOverride: 'jj',
                    available: false,
                    mismatch: true,
                },
                packageManager: {
                    family: 'pnpm',
                    source: 'detected',
                    requestedOverride: 'auto',
                    available: true,
                    mismatch: false,
                },
            }),
        });

        expect(notes).toEqual([
            'Command execution uses PowerShell. Do not assume POSIX shell syntax.',
            'This workspace appears to be jj-managed. Prefer jj for repo inspection and history operations.',
            'Detached git HEAD may be expected here because jj can manage the workspace.',
            'This workspace prefers pnpm.',
            'This workspace looks Node/TypeScript-oriented.',
            'tsx is available for TypeScript repo scripts and utilities.',
            'The pinned VCS preference "jj" is not available on this machine.',
        ]);
    });

    it('falls back to missing-tool warnings when a marker is present', () => {
        const notes = buildWorkspaceEnvironmentNotes({
            shellFamily: 'posix_sh',
            markers: buildMarkers({
                hasGitDirectory: true,
                hasPackageLock: true,
                hasRequirementsTxt: true,
            }),
            availableCommands: buildCommands({
                git: { available: false },
                npm: { available: false },
                python: { available: false },
                python3: { available: false },
            }),
            effectivePreferences: buildEffectivePreferences({
                vcs: {
                    family: 'unknown',
                    source: 'detected',
                    requestedOverride: 'auto',
                    available: false,
                    mismatch: false,
                },
                packageManager: {
                    family: 'unknown',
                    source: 'detected',
                    requestedOverride: 'auto',
                    available: false,
                    mismatch: false,
                },
            }),
        });

        expect(notes).toEqual([
            'Command execution uses a /bin/sh-style shell. Do not assume PowerShell syntax.',
            'This workspace has a .git marker, but git is not available on this machine.',
            'This workspace signals npm via package-lock.json, but npm is not available on this machine.',
            'Do not assume Python is available for repo-local scripts.',
        ]);
    });
});
