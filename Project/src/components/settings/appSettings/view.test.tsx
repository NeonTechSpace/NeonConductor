import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

const appSettingsTestState = vi.hoisted(() => ({
    confirmDialogProps: undefined as
        | {
              onConfirm: () => void;
              onCancel: () => void;
              busy: boolean;
              confirmDisabled: boolean;
          }
        | undefined,
    invalidateMock: vi.fn(),
    mutateAsyncMock: vi.fn(),
    useQueryMock: vi.fn(),
    useMutationMock: vi.fn(),
}));

vi.mock('@/web/components/settings/appSettings/mcpSection', () => ({
    McpSettingsSection: () => <div>mcp section</div>,
}));

vi.mock('@/web/components/window/privacyModeToggle', () => ({
    default: () => <div>privacy toggle</div>,
}));

vi.mock('@/web/components/ui/confirmDialog', () => ({
    ConfirmDialog: ({
        children,
        onConfirm,
        onCancel,
        busy,
        confirmDisabled,
    }: {
        children: ReactNode;
        onConfirm: () => void;
        onCancel: () => void;
        busy: boolean;
        confirmDisabled: boolean;
    }) => {
        appSettingsTestState.confirmDialogProps = {
            onConfirm,
            onCancel,
            busy,
            confirmDisabled,
        };
        return <div>{children}</div>;
    },
}));

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({
            runtime: {
                getShellBootstrap: { invalidate: appSettingsTestState.invalidateMock },
                getStorageInfo: { invalidate: appSettingsTestState.invalidateMock },
                getDiagnosticSnapshot: { invalidate: appSettingsTestState.invalidateMock },
                listWorkspaceRoots: { invalidate: appSettingsTestState.invalidateMock },
            },
            conversation: {
                listBuckets: { invalidate: appSettingsTestState.invalidateMock },
                listTags: { invalidate: appSettingsTestState.invalidateMock },
                listThreads: { invalidate: appSettingsTestState.invalidateMock },
                getEditPreference: { invalidate: appSettingsTestState.invalidateMock },
                getThreadTitlePreference: { invalidate: appSettingsTestState.invalidateMock },
            },
            session: {
                list: { invalidate: appSettingsTestState.invalidateMock },
                status: { invalidate: appSettingsTestState.invalidateMock },
                listRuns: { invalidate: appSettingsTestState.invalidateMock },
                listOutbox: { invalidate: appSettingsTestState.invalidateMock },
                getDevBrowserState: { invalidate: appSettingsTestState.invalidateMock },
                buildBrowserContextPacket: { invalidate: appSettingsTestState.invalidateMock },
                listMessages: { invalidate: appSettingsTestState.invalidateMock },
                getExecutionReceipt: { invalidate: appSettingsTestState.invalidateMock },
                getOutboxEntry: { invalidate: appSettingsTestState.invalidateMock },
                getAttachedRules: { invalidate: appSettingsTestState.invalidateMock },
                getAttachedSkills: { invalidate: appSettingsTestState.invalidateMock },
            },
            diff: {
                listByRun: { invalidate: appSettingsTestState.invalidateMock },
                getFilePatch: { invalidate: appSettingsTestState.invalidateMock },
            },
            checkpoint: { list: { invalidate: appSettingsTestState.invalidateMock } },
            provider: {
                listProviders: { invalidate: appSettingsTestState.invalidateMock },
                getDefaults: { invalidate: appSettingsTestState.invalidateMock },
                getEmbeddingControlPlane: { invalidate: appSettingsTestState.invalidateMock },
                listModels: { invalidate: appSettingsTestState.invalidateMock },
                getAuthState: { invalidate: appSettingsTestState.invalidateMock },
                getAccountContext: { invalidate: appSettingsTestState.invalidateMock },
                getConnectionProfile: { invalidate: appSettingsTestState.invalidateMock },
                getModelRoutingPreference: { invalidate: appSettingsTestState.invalidateMock },
                listModelProviders: { invalidate: appSettingsTestState.invalidateMock },
                getUsageSummary: { invalidate: appSettingsTestState.invalidateMock },
                getOpenAISubscriptionUsage: { invalidate: appSettingsTestState.invalidateMock },
                getOpenAISubscriptionRateLimits: { invalidate: appSettingsTestState.invalidateMock },
            },
            plan: { getActive: { invalidate: appSettingsTestState.invalidateMock } },
            orchestrator: { latestBySession: { invalidate: appSettingsTestState.invalidateMock } },
            profile: {
                list: { invalidate: appSettingsTestState.invalidateMock },
                getActive: { invalidate: appSettingsTestState.invalidateMock },
                getExecutionPreset: { invalidate: appSettingsTestState.invalidateMock },
                getUtilityModel: { invalidate: appSettingsTestState.invalidateMock },
                getMemoryRetrievalModel: { invalidate: appSettingsTestState.invalidateMock },
                getFileReadGuardSettings: { invalidate: appSettingsTestState.invalidateMock },
            },
            mode: {
                list: { invalidate: appSettingsTestState.invalidateMock },
                getActive: { invalidate: appSettingsTestState.invalidateMock },
            },
            registry: {
                listResolved: { invalidate: appSettingsTestState.invalidateMock },
                searchRules: { invalidate: appSettingsTestState.invalidateMock },
                searchSkills: { invalidate: appSettingsTestState.invalidateMock },
            },
            permission: { listPending: { invalidate: appSettingsTestState.invalidateMock } },
            tool: { list: { invalidate: appSettingsTestState.invalidateMock } },
            mcp: {
                listServers: { invalidate: appSettingsTestState.invalidateMock },
                getServer: { invalidate: appSettingsTestState.invalidateMock },
            },
            sandbox: { list: { invalidate: appSettingsTestState.invalidateMock } },
        }),
        runtime: {
            getStorageInfo: {
                useQuery: appSettingsTestState.useQueryMock,
            },
            factoryReset: {
                useMutation: appSettingsTestState.useMutationMock,
            },
        },
    },
}));

import { AppSettingsView } from '@/web/components/settings/appSettings/view';

describe('AppSettingsView', () => {
    beforeEach(() => {
        appSettingsTestState.confirmDialogProps = undefined;
        appSettingsTestState.invalidateMock.mockReset();
        appSettingsTestState.invalidateMock.mockResolvedValue(undefined);
        appSettingsTestState.mutateAsyncMock.mockReset();
        appSettingsTestState.mutateAsyncMock.mockResolvedValue(undefined);
        appSettingsTestState.useQueryMock.mockReset();
        appSettingsTestState.useQueryMock.mockReturnValue({
            data: {
                runtimeNamespace: 'alpha',
                dbPath: 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor\\runtime\\alpha\\neonconductor.db',
                runtimeRoot: 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor\\runtime\\alpha',
                userDataRoot: 'C:\\Users\\Neon\\AppData\\Roaming\\neon-conductor',
            },
            error: null,
            isLoading: false,
        });
        appSettingsTestState.useMutationMock.mockReset();
        appSettingsTestState.useMutationMock.mockReturnValue({
            data: undefined,
            error: null,
            isPending: false,
            mutateAsync: appSettingsTestState.mutateAsyncMock,
        });
    });

    it('renders the MCP subsection inside App settings', () => {
        const html = renderToStaticMarkup(<AppSettingsView profileId='profile_default' subsection='mcp' />);

        expect(html).toContain('MCP');
        expect(html).toContain('mcp section');
    });

    it('keeps factory reset fail-closed and preserves the mutation payload', async () => {
        const html = renderToStaticMarkup(<AppSettingsView profileId='profile_default' subsection='maintenance' />);

        expect(html).toContain('Factory reset alpha app data');
        expect(html).toContain('neonconductor.db');

        expect(appSettingsTestState.confirmDialogProps).toBeDefined();
        expect(appSettingsTestState.confirmDialogProps?.confirmDisabled).toBe(true);
        appSettingsTestState.confirmDialogProps?.onConfirm();

        expect(appSettingsTestState.mutateAsyncMock).toHaveBeenCalledWith({
            confirm: true,
            confirmationText: '',
        });

        appSettingsTestState.mutateAsyncMock.mockRejectedValueOnce(new Error('reset failed'));
        appSettingsTestState.confirmDialogProps?.onConfirm();

        expect(appSettingsTestState.mutateAsyncMock).toHaveBeenCalledTimes(2);
    });

    it('disables factory reset when storage info cannot be resolved', () => {
        appSettingsTestState.useQueryMock.mockReturnValue({
            data: undefined,
            error: new Error('storage unavailable'),
            isLoading: false,
        });

        const html = renderToStaticMarkup(<AppSettingsView profileId='profile_default' subsection='maintenance' />);

        expect(html).toContain('storage unavailable');
        expect(html).toContain('disabled=""');
    });
});
