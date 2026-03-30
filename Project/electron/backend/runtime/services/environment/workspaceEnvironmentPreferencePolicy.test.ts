import { describe, expect, it } from 'vitest';

import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentMarkers,
} from '@/app/backend/runtime/contracts/types/runtime';
import {
    buildWorkspaceEnvironmentDetectedPreferences,
    resolveWorkspaceEnvironmentDetectedPreferences,
    resolveWorkspaceEnvironmentPreferencePolicy,
} from '@/app/backend/runtime/services/environment/workspaceEnvironmentPreferencePolicy';

function buildCommandAvailability(input: Partial<WorkspaceEnvironmentCommandAvailability>): WorkspaceEnvironmentCommandAvailability {
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

describe('workspaceEnvironmentPreferencePolicy', () => {
    it('detects jj-managed pnpm node workspaces from marker and command availability truth', () => {
        const detectedPreferences = resolveWorkspaceEnvironmentDetectedPreferences({
            markers: buildMarkers({
                hasJjDirectory: true,
                hasPackageJson: true,
                hasPnpmLock: true,
                hasTsconfigJson: true,
            }),
            availableCommands: buildCommandAvailability({
                jj: { available: true, executablePath: 'C:\\Tools\\jj.exe' },
                node: { available: true, executablePath: 'C:\\Tools\\node.exe' },
                pnpm: { available: true, executablePath: 'C:\\Tools\\pnpm.cmd' },
                tsx: { available: true, executablePath: 'C:\\Tools\\tsx.cmd' },
            }),
        });

        expect(detectedPreferences).toEqual({
            vcs: 'jj',
            packageManager: 'pnpm',
            runtime: 'node',
            scriptRunner: 'tsx',
        });
    });

    it('keeps detected preferences when auto is requested', () => {
        const detectedPreferences = buildWorkspaceEnvironmentDetectedPreferences({
            vcs: 'git',
            packageManager: 'npm',
            runtime: 'node',
            scriptRunner: 'node',
        });

        const policy = resolveWorkspaceEnvironmentPreferencePolicy({
            detectedPreferences,
            overrides: {
                preferredVcs: 'auto',
                preferredPackageManager: 'auto',
            },
            availableCommands: buildCommandAvailability({
                git: { available: true, executablePath: '/usr/bin/git' },
                npm: { available: true, executablePath: '/usr/bin/npm' },
            }),
        });

        expect(policy).toEqual({
            vcs: {
                family: 'git',
                source: 'detected',
                requestedOverride: 'auto',
                available: true,
                mismatch: false,
            },
            packageManager: {
                family: 'npm',
                source: 'detected',
                requestedOverride: 'auto',
                available: true,
                mismatch: false,
            },
            runtime: 'node',
            scriptRunner: 'node',
        });
    });

    it('marks pinned overrides as mismatches when the command is missing', () => {
        const detectedPreferences = buildWorkspaceEnvironmentDetectedPreferences({
            vcs: 'git',
            packageManager: 'npm',
            runtime: 'node',
            scriptRunner: 'tsx',
        });

        const policy = resolveWorkspaceEnvironmentPreferencePolicy({
            detectedPreferences,
            overrides: {
                preferredVcs: 'jj',
                preferredPackageManager: 'pnpm',
            },
            availableCommands: buildCommandAvailability({
                git: { available: true, executablePath: '/usr/bin/git' },
                npm: { available: true, executablePath: '/usr/bin/npm' },
            }),
        });

        expect(policy.vcs).toEqual({
            family: 'jj',
            source: 'override',
            requestedOverride: 'jj',
            available: false,
            mismatch: true,
        });
        expect(policy.packageManager).toEqual({
            family: 'pnpm',
            source: 'override',
            requestedOverride: 'pnpm',
            available: false,
            mismatch: true,
        });
    });
});
