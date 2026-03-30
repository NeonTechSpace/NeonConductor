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
    mutateAsyncMock: vi.fn(),
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
        runtime: {
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
        appSettingsTestState.mutateAsyncMock.mockReset();
        appSettingsTestState.mutateAsyncMock.mockResolvedValue(undefined);
        appSettingsTestState.useMutationMock.mockReset();
        appSettingsTestState.useMutationMock.mockReturnValue({
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
        renderToStaticMarkup(<AppSettingsView profileId='profile_default' subsection='maintenance' />);

        expect(appSettingsTestState.confirmDialogProps).toBeDefined();
        appSettingsTestState.confirmDialogProps?.onConfirm();

        expect(appSettingsTestState.mutateAsyncMock).toHaveBeenCalledWith({
            confirm: true,
            confirmationText: '',
        });

        appSettingsTestState.mutateAsyncMock.mockRejectedValueOnce(new Error('reset failed'));
        appSettingsTestState.confirmDialogProps?.onConfirm();

        expect(appSettingsTestState.mutateAsyncMock).toHaveBeenCalledTimes(2);
    });
});
