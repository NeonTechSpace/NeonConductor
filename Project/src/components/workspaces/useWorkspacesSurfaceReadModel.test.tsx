import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { WorkspacePreferenceRecord } from '@/shared/contracts';

const readModelTestState = vi.hoisted(() => ({
    getShellBootstrapUseQueryMock: vi.fn<(...args: any[]) => unknown>(),
    sessionListUseQueryMock: vi.fn<(...args: any[]) => unknown>(),
    conversationListThreadsUseQueryMock: vi.fn<(...args: any[]) => unknown>(),
    sandboxListUseQueryMock: vi.fn<(...args: any[]) => unknown>(),
    registryListResolvedUseQueryMock: vi.fn<(...args: any[]) => unknown>(),
    listProviderControlProvidersMock: vi.fn((..._args: unknown[]) => [{ id: 'openai', label: 'OpenAI' }]),
    listProviderControlModelsMock: vi.fn((..._args: unknown[]) => [{ id: 'model_alpha', label: 'Model Alpha' }]),
    getProviderControlDefaultsMock: vi.fn((..._args: unknown[]) => ({ providerId: 'openai', modelId: 'model_alpha' })),
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        runtime: {
            getShellBootstrap: {
                useQuery: (input: unknown, options: unknown) =>
                    readModelTestState.getShellBootstrapUseQueryMock(input, options),
            },
        },
        session: {
            list: {
                useQuery: (input: unknown, options: unknown) => readModelTestState.sessionListUseQueryMock(input, options),
            },
        },
        conversation: {
            listThreads: {
                useQuery: (input: unknown, options: unknown) =>
                    readModelTestState.conversationListThreadsUseQueryMock(input, options),
            },
        },
        sandbox: {
            list: {
                useQuery: (input: unknown, options: unknown) =>
                    readModelTestState.sandboxListUseQueryMock(input, options),
            },
        },
        registry: {
            listResolved: {
                useQuery: (input: unknown, options: unknown) =>
                    readModelTestState.registryListResolvedUseQueryMock(input, options),
            },
        },
    },
}));

vi.mock('@/web/lib/providerControl/selectors', () => ({
    getProviderControlDefaults: (providerControl: unknown) =>
        readModelTestState.getProviderControlDefaultsMock(providerControl),
    listProviderControlModels: (providerControl: unknown) =>
        readModelTestState.listProviderControlModelsMock(providerControl),
    listProviderControlProviders: (providerControl: unknown) =>
        readModelTestState.listProviderControlProvidersMock(providerControl),
}));

import { useWorkspacesSurfaceReadModel } from '@/web/components/workspaces/useWorkspacesSurfaceReadModel';

let lastReadModel: ReturnType<typeof useWorkspacesSurfaceReadModel> | undefined;

function ReadModelProbe(props: {
    profileId: string;
    workspaceRoots: Array<{
        fingerprint: string;
        label: string;
        absolutePath: string;
        updatedAt: string;
    }>;
    selectedWorkspaceFingerprint: string | undefined;
}) {
    lastReadModel = useWorkspacesSurfaceReadModel(props);
    return <span data-selected={lastReadModel.selectedWorkspace?.fingerprint ?? ''} />;
}

describe('useWorkspacesSurfaceReadModel', () => {
    beforeEach(() => {
        lastReadModel = undefined;
        readModelTestState.getShellBootstrapUseQueryMock.mockReset();
        readModelTestState.sessionListUseQueryMock.mockReset();
        readModelTestState.conversationListThreadsUseQueryMock.mockReset();
        readModelTestState.sandboxListUseQueryMock.mockReset();
        readModelTestState.registryListResolvedUseQueryMock.mockReset();
        readModelTestState.listProviderControlProvidersMock.mockClear();
        readModelTestState.listProviderControlModelsMock.mockClear();
        readModelTestState.getProviderControlDefaultsMock.mockClear();
    });

    it('composes the workspace read model and filters selected workspace data', () => {
        const workspacePreference: WorkspacePreferenceRecord = {
            profileId: 'profile_default',
            workspaceFingerprint: 'wsf_alpha',
            defaultTopLevelTab: 'agent',
            defaultProviderId: 'openai',
            defaultModelId: 'model_alpha',
            preferredVcs: 'jj',
            preferredPackageManager: 'pnpm',
            updatedAt: '2026-03-24T00:00:00.000Z',
        };

        readModelTestState.getShellBootstrapUseQueryMock.mockReturnValue({
            data: {
                providerControl: { provider: 'control_plane' },
                workspacePreferences: [workspacePreference],
            },
        });
        readModelTestState.sessionListUseQueryMock.mockReturnValue({
            data: {
                sessions: [
                    { id: 'sess_selected', threadId: 'thr_selected', runStatus: 'idle', updatedAt: '2026-03-24T00:00:00.000Z' },
                    { id: 'sess_other', threadId: 'thr_other', runStatus: 'idle', updatedAt: '2026-03-24T00:00:00.000Z' },
                ],
            },
        });
        readModelTestState.conversationListThreadsUseQueryMock.mockReturnValue({
            data: {
                threads: [
                    { id: 'thr_selected', workspaceFingerprint: 'wsf_alpha' },
                    { id: 'thr_other', workspaceFingerprint: 'wsf_beta' },
                ],
            },
        });
        readModelTestState.sandboxListUseQueryMock.mockReturnValue({
            data: {
                sandboxes: [{ id: 'sandbox_1' }],
            },
        });
        readModelTestState.registryListResolvedUseQueryMock.mockReturnValue({
            data: {
                resolved: {
                    modes: [{ id: 'mode_1' }],
                    rulesets: [{ id: 'ruleset_1' }],
                    skillfiles: [{ id: 'skill_1' }],
                },
            },
        });

        const html = renderToStaticMarkup(
            <ReadModelProbe
                profileId='profile_default'
                workspaceRoots={[
                    {
                        fingerprint: 'wsf_alpha',
                        label: 'Alpha Workspace',
                        absolutePath: 'C:/alpha',
                        updatedAt: '2026-03-24T00:00:00.000Z',
                    },
                    {
                        fingerprint: 'wsf_beta',
                        label: 'Beta Workspace',
                        absolutePath: 'C:/beta',
                        updatedAt: '2026-03-24T00:00:00.000Z',
                    },
                ]}
                selectedWorkspaceFingerprint='wsf_alpha'
            />
        );

        expect(readModelTestState.getShellBootstrapUseQueryMock).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.any(Object)
        );
        expect(readModelTestState.sessionListUseQueryMock).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.any(Object)
        );
        expect(readModelTestState.conversationListThreadsUseQueryMock).toHaveBeenCalledWith(
            {
                profileId: 'profile_default',
                activeTab: 'chat',
                showAllModes: true,
                groupView: 'workspace',
                sort: 'latest',
            },
            expect.any(Object)
        );
        expect(readModelTestState.sandboxListUseQueryMock).toHaveBeenCalledWith(
            {
                profileId: 'profile_default',
                workspaceFingerprint: 'wsf_alpha',
            },
            expect.objectContaining({
                enabled: true,
            })
        );
        expect(readModelTestState.registryListResolvedUseQueryMock).toHaveBeenCalledWith(
            {
                profileId: 'profile_default',
                workspaceFingerprint: 'wsf_alpha',
            },
            expect.objectContaining({
                enabled: true,
            })
        );
        expect(lastReadModel?.providers).toEqual([{ id: 'openai', label: 'OpenAI' }]);
        expect(lastReadModel?.providerModels).toEqual([{ id: 'model_alpha', label: 'Model Alpha' }]);
        expect(lastReadModel?.runtimeDefaults).toEqual({ providerId: 'openai', modelId: 'model_alpha' });
        expect(lastReadModel?.selectedWorkspace).toEqual({
            fingerprint: 'wsf_alpha',
            label: 'Alpha Workspace',
            absolutePath: 'C:/alpha',
            updatedAt: '2026-03-24T00:00:00.000Z',
        });
        expect(lastReadModel?.selectedWorkspacePreference).toEqual(workspacePreference);
        expect(lastReadModel?.selectedWorkspaceThreads).toEqual([{ id: 'thr_selected', workspaceFingerprint: 'wsf_alpha' }]);
        expect(lastReadModel?.selectedWorkspaceSessions).toEqual([
            { id: 'sess_selected', threadId: 'thr_selected', runStatus: 'idle', updatedAt: '2026-03-24T00:00:00.000Z' },
        ]);
        expect(lastReadModel?.selectedWorkspaceSandboxes).toEqual([{ id: 'sandbox_1' }]);
        expect(lastReadModel?.selectedWorkspaceRegistry).toEqual({
            resolved: {
                modes: [{ id: 'mode_1' }],
                rulesets: [{ id: 'ruleset_1' }],
                skillfiles: [{ id: 'skill_1' }],
            },
        });
        expect(html).toContain('data-selected="wsf_alpha"');
    });

    it('keeps workspace-scoped queries disabled when no workspace is selected', () => {
        readModelTestState.getShellBootstrapUseQueryMock.mockReturnValue({
            data: {
                providerControl: undefined,
                workspacePreferences: [],
            },
        });
        readModelTestState.sessionListUseQueryMock.mockReturnValue({ data: { sessions: [] } });
        readModelTestState.conversationListThreadsUseQueryMock.mockReturnValue({ data: { threads: [] } });
        readModelTestState.sandboxListUseQueryMock.mockReturnValue({ data: undefined });
        readModelTestState.registryListResolvedUseQueryMock.mockReturnValue({ data: undefined });

        renderToStaticMarkup(
            <ReadModelProbe
                profileId='profile_default'
                workspaceRoots={[]}
                selectedWorkspaceFingerprint={undefined}
            />
        );

        expect(readModelTestState.sandboxListUseQueryMock).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.objectContaining({
                enabled: false,
            })
        );
        expect(readModelTestState.registryListResolvedUseQueryMock).toHaveBeenCalledWith(
            { profileId: 'profile_default' },
            expect.objectContaining({
                enabled: false,
            })
        );
        expect(lastReadModel?.selectedWorkspace).toBeUndefined();
        expect(lastReadModel?.selectedWorkspaceThreads).toEqual([]);
        expect(lastReadModel?.selectedWorkspaceSessions).toEqual([]);
    });
});
