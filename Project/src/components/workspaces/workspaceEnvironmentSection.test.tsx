import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
    WorkspaceEnvironmentPreviewCard,
    WorkspaceEnvironmentSection,
} from '@/web/components/workspaces/workspaceEnvironmentSection';
import { VENDORED_NODE_VERSION } from '@/shared/tooling/vendoredNode';

const inspectWorkspaceEnvironmentUseQueryMock = vi.fn();
const setWorkspacePreferenceMutateAsyncMock = vi.fn();
const shellBootstrapSetDataMock = vi.fn();

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        runtime: {
            inspectWorkspaceEnvironment: {
                useQuery: (...arguments_: unknown[]) => inspectWorkspaceEnvironmentUseQueryMock(...arguments_),
            },
            setWorkspacePreference: {
                useMutation: () => ({
                    isPending: false,
                    mutateAsync: setWorkspacePreferenceMutateAsyncMock,
                }),
            },
        },
        useUtils: () => ({
            runtime: {
                getShellBootstrap: {
                    setData: shellBootstrapSetDataMock,
                },
            },
        }),
    },
}));

const snapshot = {
    platform: 'win32' as const,
    shellFamily: 'powershell' as const,
    shellExecutable: 'pwsh.exe',
    workspaceRootPath: 'C:\\Repo',
    markers: {
        hasJjDirectory: true,
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
        vcs: 'unknown' as const,
        packageManager: 'pnpm' as const,
        runtime: 'node' as const,
        scriptRunner: 'tsx' as const,
    },
    effectivePreferences: {
        vcs: {
            family: 'jj' as const,
            source: 'override' as const,
            requestedOverride: 'jj' as const,
            available: false,
            mismatch: true,
        },
        packageManager: {
            family: 'pnpm' as const,
            source: 'detected' as const,
            requestedOverride: 'auto' as const,
            available: true,
            mismatch: false,
        },
        runtime: 'node' as const,
        scriptRunner: 'tsx' as const,
    },
    overrides: {
        preferredVcs: 'jj' as const,
        preferredPackageManager: 'auto' as const,
    },
    vendoredNode: {
        version: VENDORED_NODE_VERSION,
        available: true,
        targetKey: 'win32-x64' as const,
        executablePath: 'C:\\vendor\\node.exe',
    },
    projectNodeExpectation: {
        source: 'package_json_engines' as const,
        rawValue: '^24',
        detectedMajor: 24,
        satisfiesVendoredNode: true,
    },
    notes: ['This workspace prefers pnpm.', 'The pinned VCS preference "jj" is not available on this machine.'],
};

const snapshotWithNoAvailableCommands = {
    ...snapshot,
    availableCommands: {
        jj: { available: false },
        git: { available: false },
        node: { available: false },
        python: { available: false },
        python3: { available: false },
        pnpm: { available: false },
        npm: { available: false },
        yarn: { available: false },
        bun: { available: false },
        tsx: { available: false },
    },
};

const unavailableVendoredNodeSnapshot = {
    ...snapshot,
    vendoredNode: {
        version: VENDORED_NODE_VERSION,
        available: false,
        reason: 'missing_asset' as const,
    },
};

const mismatchedProjectNodeSnapshot = {
    ...snapshot,
    projectNodeExpectation: {
        source: 'package_json_engines' as const,
        rawValue: '>=25',
        detectedMajor: 25,
        satisfiesVendoredNode: false,
    },
};

describe('WorkspaceEnvironmentPreviewCard', () => {
    it('renders backend snapshot guidance', () => {
        const html = renderToStaticMarkup(
            <WorkspaceEnvironmentPreviewCard
                isLoading={false}
                errorMessage={undefined}
                snapshot={snapshot}
                emptyMessage='No preview yet.'
            />
        );

        expect(html).toContain('Tool detection preview');
        expect(html).toContain('pnpm');
        expect(html).toContain('PowerShell');
        expect(html).toContain('pwsh.exe');
        expect(html).toContain(`Vendored Node v${VENDORED_NODE_VERSION} available (win32-x64)`);
        expect(html).toContain('Workspace expects ^24 from package.json engines');
        expect(html).toContain('Matches vendored Node');
        expect(html).toContain('The pinned VCS preference');
    });

    it('renders the no-commands fallback when nothing is available', () => {
        const html = renderToStaticMarkup(
            <WorkspaceEnvironmentPreviewCard
                isLoading={false}
                errorMessage={undefined}
                snapshot={snapshotWithNoAvailableCommands}
                emptyMessage='No preview yet.'
            />
        );

        expect(html).toContain('None detected');
    });

    it('renders cmd.exe fallback clearly', () => {
        const html = renderToStaticMarkup(
            <WorkspaceEnvironmentPreviewCard
                isLoading={false}
                errorMessage={undefined}
                snapshot={{
                    ...snapshot,
                    shellFamily: 'cmd',
                    shellExecutable: 'cmd.exe',
                }}
                emptyMessage='No preview yet.'
            />
        );

        expect(html).toContain('Command Prompt');
        expect(html).toContain('cmd.exe');
    });

    it('renders vendored runtime unavailability explicitly', () => {
        const html = renderToStaticMarkup(
            <WorkspaceEnvironmentPreviewCard
                isLoading={false}
                errorMessage={undefined}
                snapshot={unavailableVendoredNodeSnapshot}
                emptyMessage='No preview yet.'
            />
        );

        expect(html).toContain(`Vendored Node v${VENDORED_NODE_VERSION}: Missing packaged/runtime asset`);
    });

    it('renders explicit runtime mismatch state', () => {
        const html = renderToStaticMarkup(
            <WorkspaceEnvironmentPreviewCard
                isLoading={false}
                errorMessage={undefined}
                snapshot={mismatchedProjectNodeSnapshot}
                emptyMessage='No preview yet.'
            />
        );

        expect(html).toContain('Workspace expects &gt;=25 from package.json engines');
        expect(html).toContain('Does not match vendored Node');
    });

    it('renders error state when inspection fails', () => {
        const html = renderToStaticMarkup(
            <WorkspaceEnvironmentPreviewCard
                isLoading={false}
                errorMessage='Workspace path could not be inspected.'
                snapshot={undefined}
                emptyMessage='No preview yet.'
            />
        );

        expect(html).toContain('Workspace path could not be inspected.');
    });
});

describe('WorkspaceEnvironmentSection', () => {
    it('projects the inspected environment and override controls', () => {
        inspectWorkspaceEnvironmentUseQueryMock.mockReturnValue({
            data: { snapshot },
            isLoading: false,
            error: undefined,
            refetch: vi.fn(),
        });

        const html = renderToStaticMarkup(
            <WorkspaceEnvironmentSection
                profileId='profile_default'
                workspaceFingerprint='ws_123'
                workspacePreference={{
                    profileId: 'profile_default',
                    workspaceFingerprint: 'ws_123',
                    preferredVcs: 'jj',
                    preferredPackageManager: 'auto',
                    updatedAt: '2026-03-25T10:00:00.000Z',
                }}
            />
        );

        expect(html).toContain('Tools Neon should use in this workspace');
        expect(html).toContain('Version control to prefer');
        expect(html).toContain('Package manager to prefer');
        expect(html).toContain('This workspace prefers pnpm.');
        expect(html).toContain(`Vendored Node v${VENDORED_NODE_VERSION} available (win32-x64)`);
        expect(html).toContain('Workspace expects ^24 from package.json engines');
        expect(html).toContain('The pinned VCS preference');
    });
});
