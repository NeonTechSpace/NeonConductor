import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { startWorkspaceBootPrefetchMock } = vi.hoisted(() => ({
    startWorkspaceBootPrefetchMock: vi.fn(),
}));
let capturedConversationShellProps: Record<string, unknown> | undefined;
let currentControllerContext: {
    controller: {
        resolvedProfileId?: string;
        profiles: Array<{ id: string; name: string }>;
        topLevelTab: string;
        currentWorkspaceFingerprint?: string;
        activeModeKey: string;
        modes: Array<unknown>;
        selectMode: ReturnType<typeof vi.fn>;
        setTopLevelTab: ReturnType<typeof vi.fn>;
        setCurrentWorkspaceFingerprint: ReturnType<typeof vi.fn>;
        selectProfile: ReturnType<typeof vi.fn>;
    };
    onConversationShellBootReadinessChange: ReturnType<typeof vi.fn>;
} = {
    controller: {
        profiles: [],
        topLevelTab: 'chat',
        activeModeKey: 'chat',
        modes: [],
        selectMode: vi.fn(),
        setTopLevelTab: vi.fn(),
        setCurrentWorkspaceFingerprint: vi.fn(),
        selectProfile: vi.fn(),
    },
    onConversationShellBootReadinessChange: vi.fn(),
};

vi.mock('@/web/components/runtime/workspaceBootLoader', () => ({
    startWorkspaceBootPrefetch: startWorkspaceBootPrefetchMock,
}));

vi.mock('@/web/components/runtime/workspaceSurfaceControllerContext', () => ({
    useWorkspaceSurfaceControllerContext: () => currentControllerContext,
}));

vi.mock('@/web/components/conversation/shell', () => ({
    ConversationShell: (props: Record<string, unknown>) => {
        capturedConversationShellProps = props;
        return <div>conversation shell</div>;
    },
}));

import { Route } from '@/web/routes/sessions';

function createRouteController(overrides: Record<string, unknown> = {}) {
    return {
        controller: {
            resolvedProfileId: 'profile_default',
            profiles: [{ id: 'profile_default', name: 'Default Profile' }],
            topLevelTab: 'chat',
            activeModeKey: 'chat',
            modes: [],
            selectMode: vi.fn(async () => undefined),
            setTopLevelTab: vi.fn(),
            setCurrentWorkspaceFingerprint: vi.fn(),
            selectProfile: vi.fn(async () => undefined),
            ...overrides,
        },
        onConversationShellBootReadinessChange: vi.fn(),
    };
}

describe('sessions route', () => {
    beforeEach(() => {
        capturedConversationShellProps = undefined;
        currentControllerContext = createRouteController();
        startWorkspaceBootPrefetchMock.mockReset();
    });

    it('prewarms the existing workspace boot data through the route loader', async () => {
        const trpcUtils = { runtime: 'utils' };

        await Route.options.loader?.({
            context: {
                trpcUtils,
            },
        } as never);

        expect(startWorkspaceBootPrefetchMock).toHaveBeenCalledWith({
            trpcUtils,
        });
    });

    it('renders the conversation shell with local hot shell state still owned by the controller', () => {
        const SessionsRouteComponent = Route.options.component as (() => ReactElement) | undefined;
        if (!SessionsRouteComponent) {
            throw new Error('Expected the sessions route component to be defined.');
        }

        const html = renderToStaticMarkup(<SessionsRouteComponent />);

        expect(html).toContain('conversation shell');
        expect(capturedConversationShellProps).toMatchObject({
            profileId: 'profile_default',
            selectedProfileId: 'profile_default',
            topLevelTab: 'chat',
            modeKey: 'chat',
        });
        expect(capturedConversationShellProps?.onSelectedWorkspaceFingerprintChange).toBe(
            currentControllerContext.controller.setCurrentWorkspaceFingerprint
        );
    });
});
