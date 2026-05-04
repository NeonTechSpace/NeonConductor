import { describe, expect, it } from 'vitest';

import type {
    WorkspaceEnvironmentCommandAvailability,
    WorkspaceEnvironmentMarkers,
    WorkspaceEnvironmentOverrides,
} from '@/app/backend/runtime/contracts/types/runtime';
import { buildSandboxPolicySummary } from '@/app/backend/runtime/services/environment/sandboxPolicySummaryBuilder';
import { resolveWorkspaceEnvironmentInspection } from '@/app/backend/runtime/services/environment/workspaceEnvironmentSnapshotBuilder';

import { VENDORED_NODE_VERSION } from '@/shared/tooling/vendoredNode';

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

function buildCommands(
    input: Partial<WorkspaceEnvironmentCommandAvailability>
): WorkspaceEnvironmentCommandAvailability {
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

describe('workspace environment snapshot builder', () => {
    it('resolves a Windows-shaped inspection snapshot with guidance inputs intact', () => {
        const overrides: WorkspaceEnvironmentOverrides = {
            preferredVcs: 'auto',
            preferredPackageManager: 'auto',
        };

        const snapshot = resolveWorkspaceEnvironmentInspection({
            platform: 'win32',
            shellFamily: 'powershell',
            shellExecutable: 'pwsh.exe',
            workspaceRootPath: 'C:\\workspaces\\neon',
            baseWorkspaceRootPath: 'C:\\workspaces',
            markers: buildMarkers({
                hasJjDirectory: true,
                hasPackageJson: true,
                hasPnpmLock: true,
                hasTsconfigJson: true,
            }),
            availableCommands: buildCommands({
                jj: { available: true, executablePath: 'C:\\Tools\\jj.exe' },
                node: { available: true, executablePath: 'C:\\Tools\\node.exe' },
                pnpm: { available: true, executablePath: 'C:\\Tools\\pnpm.cmd' },
                tsx: { available: true, executablePath: 'C:\\Tools\\tsx.cmd' },
            }),
            vendoredNode: {
                version: VENDORED_NODE_VERSION,
                available: true,
                targetKey: 'win32-x64',
                executablePath: 'C:\\vendor\\node.exe',
            },
            sandboxPolicySummary: buildSandboxPolicySummary({
                platform: 'win32',
                workspaceRootPath: 'C:\\workspaces\\neon',
                baseWorkspaceRootPath: 'C:\\workspaces',
            }),
            overrides,
        });

        expect(snapshot.platform).toBe('win32');
        expect(snapshot.shellFamily).toBe('powershell');
        expect(snapshot.shellExecutable).toBe('pwsh.exe');
        expect(snapshot.baseWorkspaceRootPath).toBe('C:\\workspaces');
        expect(snapshot.detectedPreferences).toEqual({
            vcs: 'jj',
            packageManager: 'pnpm',
            runtime: 'node',
            scriptRunner: 'tsx',
        });
        expect(snapshot.effectivePreferences.vcs.family).toBe('jj');
        expect(snapshot.effectivePreferences.packageManager.family).toBe('pnpm');
        expect(snapshot.notes).toContain(
            'This workspace appears to be jj-managed. Prefer jj for repo inspection and history operations.'
        );
        expect(snapshot.notes).toContain('This workspace prefers pnpm.');
        expect(snapshot.sandboxPolicySummary.filesystem.kind).toBe('local_workspace');
        expect(snapshot.sandboxPolicySummary.process.nativeEnforcement).toBe(false);
    });

    it('keeps unknown preferences when no matching tool is present', () => {
        const snapshot = resolveWorkspaceEnvironmentInspection({
            platform: 'linux',
            shellFamily: 'posix_sh',
            shellExecutable: '/bin/sh',
            workspaceRootPath: '/workspaces/neon',
            markers: buildMarkers({
                hasGitDirectory: true,
                hasPackageLock: true,
            }),
            availableCommands: buildCommands({}),
            vendoredNode: {
                version: VENDORED_NODE_VERSION,
                available: false,
                reason: 'missing_asset',
            },
            sandboxPolicySummary: buildSandboxPolicySummary({
                platform: 'linux',
                workspaceRootPath: '/workspaces/neon',
            }),
            overrides: {
                preferredVcs: 'jj',
                preferredPackageManager: 'pnpm',
            },
        });

        expect(snapshot.detectedPreferences).toEqual({
            vcs: 'unknown',
            packageManager: 'unknown',
            runtime: 'unknown',
            scriptRunner: 'unknown',
        });
        expect(snapshot.shellExecutable).toBe('/bin/sh');
        expect(snapshot.effectivePreferences.vcs).toEqual({
            family: 'jj',
            source: 'override',
            requestedOverride: 'jj',
            available: false,
            mismatch: true,
        });
        expect(snapshot.notes).toContain(
            'This workspace appears to be jj-managed. Prefer jj for repo inspection and history operations.'
        );
        expect(snapshot.notes).toContain('The pinned VCS preference "jj" is not available on this machine.');
        expect(snapshot.notes).toContain(
            'The pinned package manager preference "pnpm" is not available on this machine.'
        );
    });

    it('preserves cmd shell family in Windows fallback snapshots', () => {
        const snapshot = resolveWorkspaceEnvironmentInspection({
            platform: 'win32',
            shellFamily: 'cmd',
            shellExecutable: 'cmd.exe',
            workspaceRootPath: 'C:\\workspaces\\fallback',
            markers: buildMarkers({}),
            availableCommands: buildCommands({}),
            vendoredNode: {
                version: VENDORED_NODE_VERSION,
                available: true,
                targetKey: 'win32-x64',
                executablePath: 'C:\\vendor\\node.exe',
            },
            sandboxPolicySummary: buildSandboxPolicySummary({
                platform: 'win32',
                workspaceRootPath: 'C:\\workspaces\\fallback',
            }),
            overrides: {
                preferredVcs: 'auto',
                preferredPackageManager: 'auto',
            },
        });

        expect(snapshot.shellFamily).toBe('cmd');
        expect(snapshot.shellExecutable).toBe('cmd.exe');
        expect(snapshot.notes).toContain(
            'Command execution uses Windows Command Prompt via cmd.exe fallback. Do not assume PowerShell or POSIX shell syntax.'
        );
    });
});
