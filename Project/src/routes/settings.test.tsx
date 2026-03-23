import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { Route } from '@/web/routes/settings';

import type { ReactElement } from 'react';

const { navigateMock, preloadRouteMock, prefetchSettingsRouteDataMock } = vi.hoisted(() => ({
    navigateMock: vi.fn(),
    preloadRouteMock: vi.fn(),
    prefetchSettingsRouteDataMock: vi.fn(),
}));
let currentRouteSearch: { section?: string; subsection?: string } = {};
let currentControllerContext: {
    controller: {
        resolvedProfileId?: string;
        setResolvedProfile: ReturnType<typeof vi.fn>;
    };
} = {
    controller: {
        setResolvedProfile: vi.fn(),
    },
};
let capturedSettingsWorkspaceProps: Record<string, unknown> | undefined;

vi.mock('@tanstack/react-router', async () => {
    const actual = await vi.importActual<typeof import('@tanstack/react-router')>('@tanstack/react-router');
    return {
        ...actual,
        useNavigate: () => navigateMock,
        useRouter: () => ({
            preloadRoute: preloadRouteMock,
        }),
    };
});

vi.mock('@/web/components/runtime/workspaceSurfaceControllerContext', () => ({
    useWorkspaceSurfaceControllerContext: () => currentControllerContext,
}));

vi.mock('@/web/components/settings/settingsRoutePrefetch', () => ({
    prefetchSettingsRouteData: prefetchSettingsRouteDataMock,
}));

vi.mock('@/web/components/settings/settingsWorkspace', () => ({
    SettingsWorkspace: (props: Record<string, unknown>) => {
        capturedSettingsWorkspaceProps = props;
        return <div>settings workspace</div>;
    },
}));

function createRouteController(overrides: Record<string, unknown> = {}) {
    return {
        controller: {
            resolvedProfileId: 'profile_default',
            setResolvedProfile: vi.fn(),
            ...overrides,
        },
    };
}

describe('settings route', () => {
    beforeEach(() => {
        navigateMock.mockReset();
        preloadRouteMock.mockReset();
        prefetchSettingsRouteDataMock.mockReset();
        capturedSettingsWorkspaceProps = undefined;
        currentRouteSearch = {};
        currentControllerContext = createRouteController();
        Route.useSearch = (() => currentRouteSearch) as typeof Route.useSearch;
    });

    it('prewarms the default settings data through the route loader', async () => {
        const trpcClient = { profile: 'client' };
        const trpcUtils = { provider: 'utils' };
        const routeLoader = Route.options.loader;

        if (typeof routeLoader !== 'function') {
            throw new Error('Expected the settings route loader to be callable.');
        }

        await routeLoader({
            context: {
                trpcClient,
                trpcUtils,
            },
        } as never);

        expect(prefetchSettingsRouteDataMock).toHaveBeenCalledWith({
            trpcClient,
            trpcUtils,
        });
    });

    it('resolves missing or invalid search state to the documented settings default', () => {
        currentRouteSearch = {
            section: 'profiles',
            subsection: 'not-real',
        };
        Route.useSearch = (() => currentRouteSearch) as typeof Route.useSearch;

        const SettingsRouteComponent = Route.options.component as (() => ReactElement) | undefined;
        if (!SettingsRouteComponent) {
            throw new Error('Expected the settings route component to be defined.');
        }

        const html = renderToStaticMarkup(<SettingsRouteComponent />);

        expect(html).toContain('settings workspace');
        expect(capturedSettingsWorkspaceProps?.selection).toEqual({
            section: 'profiles',
            subsection: 'management',
        });
    });

    it('navigates back to /sessions and previews that route from the settings surface', () => {
        const SettingsRouteComponent = Route.options.component as (() => ReactElement) | undefined;
        if (!SettingsRouteComponent) {
            throw new Error('Expected the settings route component to be defined.');
        }

        renderToStaticMarkup(<SettingsRouteComponent />);

        (capturedSettingsWorkspaceProps?.onReturnToSessions as (() => void) | undefined)?.();
        (capturedSettingsWorkspaceProps?.onPreviewReturnToSessions as (() => void) | undefined)?.();

        expect(navigateMock).toHaveBeenCalledWith({
            to: '/sessions',
        });
        expect(preloadRouteMock).toHaveBeenCalledWith({
            to: '/sessions',
        });
    });

    it('writes settings selection changes back into typed route search state', () => {
        const SettingsRouteComponent = Route.options.component as (() => ReactElement) | undefined;
        if (!SettingsRouteComponent) {
            throw new Error('Expected the settings route component to be defined.');
        }

        renderToStaticMarkup(<SettingsRouteComponent />);

        (
            capturedSettingsWorkspaceProps?.onSelectionChange as
                | ((selection: { section: string; subsection: string }) => void)
                | undefined
        )?.({
            section: 'context',
            subsection: 'budgeting',
        });

        expect(navigateMock).toHaveBeenCalledWith({
            search: {
                section: 'context',
                subsection: 'budgeting',
            },
        });
    });
});
