import { describe, expect, it } from 'vitest';

import type { WorkspaceEnvironmentSnapshot } from '@/app/backend/runtime/contracts/types/runtime';
import { buildWorkspaceEnvironmentGuidance } from '@/app/backend/runtime/services/environment/workspaceEnvironmentGuidanceBuilder';
import { VENDORED_NODE_VERSION } from '@/shared/tooling/vendoredNode';

function buildSnapshot(overrides: Partial<WorkspaceEnvironmentSnapshot>): WorkspaceEnvironmentSnapshot {
    return {
        platform: 'win32',
        shellFamily: 'powershell',
        shellExecutable: 'pwsh.exe',
        workspaceRootPath: 'C:\\Repo',
        markers: {
            hasJjDirectory: false,
            hasGitDirectory: true,
            hasPackageJson: true,
            hasPnpmLock: true,
            hasPackageLock: false,
            hasYarnLock: false,
            hasBunLock: false,
            hasTsconfigJson: true,
            hasPyprojectToml: false,
            hasRequirementsTxt: false,
        },
        availableCommands: {
            jj: { available: false },
            git: { available: true, executablePath: 'C:\\git.exe' },
            node: { available: true, executablePath: 'C:\\node.exe' },
            python: { available: false },
            python3: { available: false },
            pnpm: { available: true, executablePath: 'C:\\pnpm.cmd' },
            npm: { available: true, executablePath: 'C:\\npm.cmd' },
            yarn: { available: false },
            bun: { available: false },
            tsx: { available: true, executablePath: 'C:\\tsx.cmd' },
        },
        detectedPreferences: {
            vcs: 'git',
            packageManager: 'pnpm',
            runtime: 'node',
            scriptRunner: 'tsx',
        },
        effectivePreferences: {
            vcs: {
                family: 'git',
                source: 'detected',
                requestedOverride: 'auto',
                available: true,
                mismatch: false,
            },
            packageManager: {
                family: 'pnpm',
                source: 'detected',
                requestedOverride: 'auto',
                available: true,
                mismatch: false,
            },
            runtime: 'node',
            scriptRunner: 'tsx',
        },
        overrides: {
            preferredVcs: 'auto',
            preferredPackageManager: 'auto',
        },
        vendoredNode: {
            version: VENDORED_NODE_VERSION,
            available: true,
            targetKey: 'win32-x64',
            executablePath: 'C:\\Repo\\vendor\\node\\win32-x64\\node.exe',
        },
        notes: [],
        ...overrides,
    };
}

describe('workspaceEnvironmentGuidanceBuilder', () => {
    it('includes explicit vendored runtime summary and rg/search guidance when vendored ripgrep is available', () => {
        const guidance = buildWorkspaceEnvironmentGuidance(
            buildSnapshot({
                projectNodeExpectation: {
                    source: 'package_json_engines',
                    rawValue: '^24',
                    detectedMajor: 24,
                    satisfiesVendoredNode: true,
                },
            }),
            {
            vendoredRipgrepAvailable: true,
            }
        );

        expect(guidance).toContain('Shell family: powershell. Shell executable: pwsh.exe.');
        expect(guidance).toContain(`Vendored code runtime: Node v${VENDORED_NODE_VERSION}. Target: win32-x64.`);
        expect(guidance).toContain('Workspace Node expectation: "^24" from package.json engines.');
        expect(guidance).toContain('Vendored Node satisfies that expectation.');
        expect(guidance).toContain('prefer the native search_files tool');
        expect(guidance).toContain('prefer rg and rg --files');
    });

    it('describes unresolved Windows shells explicitly', () => {
        const snapshot = buildSnapshot({
            shellFamily: 'cmd',
        });
        const { shellExecutable: _shellExecutable, ...unresolvedSnapshot } = snapshot;
        const guidance = buildWorkspaceEnvironmentGuidance(unresolvedSnapshot);

        expect(guidance).toContain('Windows shell could not be resolved.');
    });

    it('describes vendored runtime mismatch and heuristic workspaces without duplicating runtime notes', () => {
        const guidance = buildWorkspaceEnvironmentGuidance(
            buildSnapshot({
                projectNodeExpectation: {
                    source: 'package_json_engines',
                    rawValue: '^22',
                    detectedMajor: 22,
                    satisfiesVendoredNode: false,
                },
                notes: [
                    'This workspace looks Node/TypeScript-oriented.',
                    'This workspace prefers pnpm.',
                ],
            })
        );

        expect(guidance).toContain('Workspace Node expectation: "^22" from package.json engines.');
        expect(guidance).toContain('Vendored Node does not satisfy that expectation.');
        expect(guidance).toContain('This workspace looks Node/TypeScript-oriented.');
        expect(guidance).not.toContain(`Vendored Node v${VENDORED_NODE_VERSION} is available for Neon's code runtime.`);
    });

    it('describes unavailable vendored runtimes and heuristic fallback explicitly', () => {
        const guidance = buildWorkspaceEnvironmentGuidance(
            buildSnapshot({
                vendoredNode: {
                    version: VENDORED_NODE_VERSION,
                    available: false,
                    reason: 'missing_asset',
                },
                projectNodeExpectation: {
                    source: 'node_workspace_heuristic',
                },
            })
        );

        expect(guidance).toContain(
            `Vendored code runtime: Node v${VENDORED_NODE_VERSION}. Status: packaged/runtime asset missing.`
        );
        expect(guidance).toContain(
            'Workspace looks Node/TypeScript-oriented, but no explicit root Node version expectation was found.'
        );
    });
});
