import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let currentPathname = '/sessions';
const navigateMock = vi.fn();
const preloadRouteMock = vi.fn();
let capturedHeaderProps: Record<string, unknown> | undefined;
let capturedPaletteProps: Record<string, unknown> | undefined;

vi.mock('@tanstack/react-router', () => ({
    Outlet: () => <div>{currentPathname === '/settings' ? 'settings route' : 'sessions route'}</div>,
    useNavigate: () => navigateMock,
    useRouter: () => ({
        preloadRoute: preloadRouteMock,
    }),
    useRouterState: ({ select }: { select: (state: { location: { pathname: string } }) => string }) =>
        select({
            location: {
                pathname: currentPathname,
            },
        }),
}));

vi.mock('@/web/components/runtime/workspaceSurfaceController', () => ({
    useWorkspaceSurfaceController: vi.fn(),
}));

import { WorkspaceSurface } from '@/web/components/runtime/workspaceSurface';
import { useWorkspaceSurfaceController } from '@/web/components/runtime/workspaceSurfaceController';

function createControllerState(overrides: Record<string, unknown> = {}) {
    return {
        profiles: [
            {
                id: 'profile_default',
                name: 'Local Default',
                createdAt: '2026-03-19T10:00:00.000Z',
                updatedAt: '2026-03-19T10:00:00.000Z',
                isActive: true,
            },
        ],
        resolvedProfileId: 'profile_default',
        profilePending: false,
        profileErrorMessage: undefined,
        hasProfiles: true,
        hasResolvedInitialMode: true,
        modePending: false,
        modeErrorMessage: undefined,
        profileSetActiveMutation: {
            isPending: false,
        },
        setActiveModeMutation: {
            isPending: false,
        },
        topLevelTab: 'chat',
        currentWorkspaceFingerprint: undefined,
        modes: [],
        activeModeKey: 'chat',
        workspaceRoots: [],
        selectedWorkspaceRoot: undefined,
        isCommandPaletteOpen: false,
        setIsCommandPaletteOpen: vi.fn(),
        setTopLevelTab: vi.fn(),
        setCurrentWorkspaceFingerprint: vi.fn(),
        setResolvedProfile: vi.fn(),
        selectProfile: vi.fn(() => Promise.resolve(undefined)),
        selectMode: vi.fn(() => Promise.resolve(undefined)),
        ...overrides,
    };
}

vi.mock('@/web/trpc/client', () => ({
    trpc: {
        useUtils: () => ({}),
    },
}));

vi.mock('@/web/lib/trpcClient', () => ({
    trpcClient: {
        profile: {
            list: {
                query: vi.fn(),
            },
            getActive: {
                query: vi.fn(),
            },
        },
    },
}));

vi.mock('@/web/components/runtime/useWorkspaceBootPrefetch', () => ({
    useWorkspaceBootPrefetch: vi.fn(),
}));

vi.mock('@/web/components/runtime/useRendererBootReadySignal', () => ({
    useRendererBootReadySignal: () => ({ readySignalState: 'sent' as const }),
}));

vi.mock('@/web/components/runtime/useRendererBootStatusReporter', () => ({
    useRendererBootStatusReporter: vi.fn(),
}));

vi.mock('@/web/components/runtime/bootReadiness', () => ({
    INITIAL_CONVERSATION_SHELL_BOOT_CHROME_READINESS: {
        shellBootstrapSettled: true,
    },
    getWorkspaceBootDiagnostics: () => ({
        status: 'ready',
        hasCriticalError: false,
    }),
    isWorkspaceBootReady: () => true,
}));

vi.mock('@/web/components/runtime/workspaceBootDiagnosticsPanel', () => ({
    WorkspaceBootDiagnosticsPanel: () => <div>boot diagnostics</div>,
}));

vi.mock('@/web/components/runtime/workspaceCommandPalette', () => ({
    WorkspaceCommandPalette: (props: Record<string, unknown>) => {
        capturedPaletteProps = props;
        return <div>command palette</div>;
    },
}));

vi.mock('@/web/components/runtime/workspaceSurfaceHeader', () => ({
    WorkspaceSurfaceHeader: (props: Record<string, unknown>) => {
        capturedHeaderProps = props;
        return <header>surface header</header>;
    },
}));

describe('workspace surface', () => {
    beforeEach(() => {
        currentPathname = '/sessions';
        navigateMock.mockReset();
        preloadRouteMock.mockReset();
        capturedHeaderProps = undefined;
        capturedPaletteProps = undefined;
    });

    it('renders the routed sessions content while the sessions route is active', () => {
        vi.mocked(useWorkspaceSurfaceController).mockReturnValue(
            createControllerState() as unknown as ReturnType<typeof useWorkspaceSurfaceController>
        );

        const html = renderToStaticMarkup(<WorkspaceSurface />);

        expect(html).toContain('surface header');
        expect(html).toContain('sessions route');
        expect(html).not.toContain('settings route');
    });

    it('renders the routed settings content while the settings route is active', () => {
        currentPathname = '/settings';
        vi.mocked(useWorkspaceSurfaceController).mockReturnValue(
            createControllerState() as unknown as ReturnType<typeof useWorkspaceSurfaceController>
        );

        const html = renderToStaticMarkup(<WorkspaceSurface />);

        expect(html).toContain('surface header');
        expect(html).toContain('settings route');
        expect(html).not.toContain('sessions route');
    });

    it('navigates to the settings route from the header affordance', () => {
        vi.mocked(useWorkspaceSurfaceController).mockReturnValue(
            createControllerState() as unknown as ReturnType<typeof useWorkspaceSurfaceController>
        );

        renderToStaticMarkup(<WorkspaceSurface />);
        (capturedHeaderProps?.onOpenSettings as (() => void) | undefined)?.();

        expect(navigateMock).toHaveBeenCalledWith({
            to: '/settings',
        });
    });

    it('preloads the settings route from the header affordance', () => {
        vi.mocked(useWorkspaceSurfaceController).mockReturnValue(
            createControllerState() as unknown as ReturnType<typeof useWorkspaceSurfaceController>
        );

        renderToStaticMarkup(<WorkspaceSurface />);
        (capturedHeaderProps?.onPreviewSettings as (() => void) | undefined)?.();

        expect(preloadRouteMock).toHaveBeenCalledWith({
            to: '/settings',
        });
    });

    it('navigates coarse shell sections through the router from the command palette', () => {
        vi.mocked(useWorkspaceSurfaceController).mockReturnValue(
            createControllerState() as unknown as ReturnType<typeof useWorkspaceSurfaceController>
        );

        renderToStaticMarkup(<WorkspaceSurface />);
        (capturedPaletteProps?.onSectionChange as ((section: 'sessions' | 'settings') => void) | undefined)?.(
            'settings'
        );

        expect(navigateMock).toHaveBeenCalledWith({
            to: '/settings',
        });
    });

    it('preloads coarse shell sections through the router from the command palette', () => {
        vi.mocked(useWorkspaceSurfaceController).mockReturnValue(
            createControllerState() as unknown as ReturnType<typeof useWorkspaceSurfaceController>
        );

        renderToStaticMarkup(<WorkspaceSurface />);
        (capturedPaletteProps?.onPreviewSectionChange as ((section: 'sessions' | 'settings') => void) | undefined)?.(
            'settings'
        );

        expect(preloadRouteMock).toHaveBeenCalledWith({
            to: '/settings',
        });
    });

    it('shows the local loading state until a profile is resolved', () => {
        vi.mocked(useWorkspaceSurfaceController).mockReturnValue(
            createControllerState({
                resolvedProfileId: undefined,
            }) as unknown as ReturnType<typeof useWorkspaceSurfaceController>
        );

        const html = renderToStaticMarkup(<WorkspaceSurface />);

        expect(html).toContain('Loading profile state...');
        expect(html).not.toContain('sessions route');
        expect(html).not.toContain('settings route');
    });
});
