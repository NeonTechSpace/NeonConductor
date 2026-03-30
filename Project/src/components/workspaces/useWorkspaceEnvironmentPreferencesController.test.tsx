import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
    ENVIRONMENT_SAVE_ERROR_MESSAGE,
    ENVIRONMENT_SAVE_SUCCESS_MESSAGE,
} from '@/web/components/workspaces/useWorkspaceEnvironmentPreferencesController';

const environmentTestState = vi.hoisted(() => ({
    shellBootstrapSetDataMock: vi.fn(),
    setWorkspacePreferenceMutateAsyncMock: vi.fn(),
    inspectWorkspaceEnvironmentUseQueryMock: vi.fn(),
    useUtilsMock: vi.fn(),
    useMutationMock: vi.fn(),
    refetchMock: vi.fn(),
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: environmentTestState.useUtilsMock,
        runtime: {
            inspectWorkspaceEnvironment: {
                useQuery: environmentTestState.inspectWorkspaceEnvironmentUseQueryMock,
            },
            setWorkspacePreference: {
                useMutation: environmentTestState.useMutationMock,
            },
        },
    },
}));

import { useWorkspaceEnvironmentPreferencesController } from '@/web/components/workspaces/useWorkspaceEnvironmentPreferencesController';

let latestController: ReturnType<typeof useWorkspaceEnvironmentPreferencesController> | undefined;

function EnvironmentControllerProbe() {
    latestController = useWorkspaceEnvironmentPreferencesController({
        profileId: 'profile_default',
        workspaceFingerprint: 'ws_123',
        workspacePreference: {
            profileId: 'profile_default',
            workspaceFingerprint: 'ws_123',
            preferredVcs: 'jj',
            preferredPackageManager: 'pnpm',
            updatedAt: '2026-03-25T10:00:00.000Z',
        },
    });

    return (
        <div
            data-vcs={latestController.preferredVcs}
            data-package-manager={latestController.preferredPackageManager}
            data-pending={latestController.hasPendingChanges ? 'true' : 'false'}
            data-feedback={latestController.feedbackMessage ?? ''}
        />
    );
}

describe('useWorkspaceEnvironmentPreferencesController', () => {
    beforeEach(() => {
        latestController = undefined;
        environmentTestState.shellBootstrapSetDataMock.mockClear();
        environmentTestState.setWorkspacePreferenceMutateAsyncMock.mockClear();
        environmentTestState.inspectWorkspaceEnvironmentUseQueryMock.mockClear();
        environmentTestState.useUtilsMock.mockClear();
        environmentTestState.useMutationMock.mockClear();
        environmentTestState.refetchMock.mockReset();
        environmentTestState.refetchMock.mockResolvedValue(undefined);
        environmentTestState.useUtilsMock.mockReturnValue({
            runtime: {
                getShellBootstrap: {
                    setData: environmentTestState.shellBootstrapSetDataMock,
                },
            },
        });
        environmentTestState.inspectWorkspaceEnvironmentUseQueryMock.mockReturnValue({
            isLoading: false,
            error: undefined,
            data: {
                snapshot: {
                    platform: 'win32',
                    shellFamily: 'powershell',
                    workspaceRootPath: 'C:/workspace',
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
                        jj: { available: true, executablePath: 'C:/jj.exe' },
                        git: { available: true, executablePath: 'C:/git.exe' },
                        node: { available: true, executablePath: 'C:/node.exe' },
                        python: { available: false },
                        python3: { available: false },
                        pnpm: { available: true, executablePath: 'C:/pnpm.cmd' },
                        npm: { available: true, executablePath: 'C:/npm.cmd' },
                        yarn: { available: false },
                        bun: { available: false },
                        tsx: { available: true, executablePath: 'C:/tsx.cmd' },
                    },
                    detectedPreferences: {
                        vcs: 'jj',
                        packageManager: 'pnpm',
                        runtime: 'node',
                        scriptRunner: 'tsx',
                    },
                    effectivePreferences: {
                        vcs: {
                            family: 'jj',
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
                    notes: [],
                },
            },
            refetch: environmentTestState.refetchMock,
        });
        environmentTestState.useMutationMock.mockImplementation(() => {
            return {
                isPending: false,
                mutateAsync: environmentTestState.setWorkspacePreferenceMutateAsyncMock,
            };
        });
        environmentTestState.setWorkspacePreferenceMutateAsyncMock.mockImplementation(async (input: any) => ({
            workspacePreference: {
                profileId: input.profileId,
                workspaceFingerprint: input.workspaceFingerprint,
                preferredVcs: input.preferredVcs,
                preferredPackageManager: input.preferredPackageManager,
                updatedAt: '2026-03-25T12:00:00.000Z',
            },
        }));
    });

    it('projects the inspected environment and refetches after saving overrides', async () => {
        const html = renderToStaticMarkup(<EnvironmentControllerProbe />);

        expect(html).toContain('data-vcs="jj"');
        expect(html).toContain('data-package-manager="pnpm"');
        expect(html).toContain('data-pending="false"');
        expect(ENVIRONMENT_SAVE_SUCCESS_MESSAGE).toBe(
            'Saved the tool preferences Neon should use for this workspace.'
        );
        expect(ENVIRONMENT_SAVE_ERROR_MESSAGE).toBe('Could not save workspace tool preferences.');

        await latestController?.savePreferences();

        expect(environmentTestState.setWorkspacePreferenceMutateAsyncMock).toHaveBeenCalledWith({
            profileId: 'profile_default',
            workspaceFingerprint: 'ws_123',
            preferredVcs: 'jj',
            preferredPackageManager: 'pnpm',
        });
        expect(environmentTestState.shellBootstrapSetDataMock).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.any(Function)
        );
        expect(environmentTestState.refetchMock).toHaveBeenCalledTimes(1);
    });

    it('keeps save failure fail-closed and preserves the existing error feedback', async () => {
        renderToStaticMarkup(<EnvironmentControllerProbe />);
        environmentTestState.setWorkspacePreferenceMutateAsyncMock.mockRejectedValueOnce(new Error('save failed'));

        await latestController?.savePreferences();

        expect(environmentTestState.shellBootstrapSetDataMock).not.toHaveBeenCalled();
        expect(environmentTestState.refetchMock).not.toHaveBeenCalled();
        expect(ENVIRONMENT_SAVE_ERROR_MESSAGE).toBe('Could not save workspace tool preferences.');
    });
});
