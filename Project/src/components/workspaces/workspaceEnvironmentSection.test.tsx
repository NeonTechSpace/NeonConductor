import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import {
    WorkspaceEnvironmentPreviewCard,
    WorkspaceEnvironmentSection,
} from '@/web/components/workspaces/workspaceEnvironmentSection';

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
    notes: [
        'This workspace prefers pnpm.',
        'The pinned VCS preference "jj" is not available on this machine.',
    ],
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

        expect(html).toContain('Detection preview');
        expect(html).toContain('pnpm');
        expect(html).toContain('PowerShell');
        expect(html).toContain('The pinned VCS preference');
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

        expect(html).toContain('Environment and toolchain');
        expect(html).toContain('Preferred VCS');
        expect(html).toContain('Preferred Package Manager');
        expect(html).toContain('This workspace prefers pnpm.');
        expect(html).toContain('The pinned VCS preference');
    });
});
