import { TanStackDevtools } from '@tanstack/react-devtools';
import { FormDevtoolsPanel } from '@tanstack/react-form-devtools';
import { ReactQueryDevtoolsPanel } from '@tanstack/react-query-devtools';
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools';

import { NeonRuntimeDevtoolsPanel } from '@/web/components/utils/neonRuntimeDevtoolsPanel';

import type { AnyRouter } from '@tanstack/react-router';

export interface DevToolsProps {
    router: AnyRouter;
}

export default function DevTools({ router }: DevToolsProps) {
    return (
        <TanStackDevtools
            plugins={[
                {
                    id: 'neon-runtime',
                    name: 'Neon Runtime',
                    render: <NeonRuntimeDevtoolsPanel />,
                },
                {
                    name: 'TanStack Router',
                    render: <TanStackRouterDevtoolsPanel router={router} />,
                },
                {
                    name: 'TanStack Query',
                    render: <ReactQueryDevtoolsPanel />,
                },
                {
                    name: 'TanStack Form',
                    render: <FormDevtoolsPanel />,
                },
            ]}
            eventBusConfig={{
                connectToServerBus: true,
            }}
        />
    );
}
