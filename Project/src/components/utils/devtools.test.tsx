import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import DevTools from '@/web/components/utils/devtools';

const { tanStackDevtoolsMock } = vi.hoisted(() => ({
    tanStackDevtoolsMock: vi.fn(),
}));

vi.mock('@tanstack/react-devtools', () => ({
    TanStackDevtools: (props: Record<string, unknown>) => {
        tanStackDevtoolsMock(props);
        return <div>devtools shell</div>;
    },
}));

vi.mock('@tanstack/react-router-devtools', () => ({
    TanStackRouterDevtoolsPanel: () => <div>router panel</div>,
}));

vi.mock('@tanstack/react-query-devtools', () => ({
    ReactQueryDevtoolsPanel: () => <div>query panel</div>,
}));

vi.mock('@tanstack/react-form-devtools', () => ({
    FormDevtoolsPanel: () => <div>form panel</div>,
}));

describe('DevTools', () => {
    it('registers the Neon Runtime plugin alongside the generic TanStack panels', () => {
        renderToStaticMarkup(<DevTools router={{} as never} />);

        const plugins = tanStackDevtoolsMock.mock.calls[0]?.[0]?.plugins as Array<{ name: string }> | undefined;
        expect(plugins?.map((plugin) => plugin.name)).toEqual([
            'Neon Runtime',
            'TanStack Router',
            'TanStack Query',
            'TanStack Form',
        ]);
    });
});
