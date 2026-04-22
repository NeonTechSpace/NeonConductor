import { RouterProvider } from '@tanstack/react-router';
import { initLogger } from 'evlog';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { RendererBootStatusBootstrap } from '@/web/components/runtime/rendererBootStatusBootstrap';
import DevTools from '@/web/components/utils/devtools';
import { registerFirstPartyReactProvider } from '@/web/lib/devBrowser/registerFirstPartyReactProvider';
import { initializePrivacyMode } from '@/web/lib/privacy/privacy';
import Providers from '@/web/lib/providers';
import { initializeThemeClass } from '@/web/lib/theme/theme';
import { router } from '@/web/router';
import '@/web/styles/index.css';

const isDev = import.meta.env.DEV;

const rootElement = document.getElementById('root');
initializeThemeClass();
initializePrivacyMode();

if (isDev) {
    initLogger({
        enabled: true,
        pretty: true,
        stringify: true,
        env: {
            service: 'neon-conductor-renderer',
            environment: 'development',
        },
    });
    registerFirstPartyReactProvider();
}

if (rootElement) {
    createRoot(rootElement).render(
        <>
            <StrictMode>
                <RendererBootStatusBootstrap />
                <Providers>
                    <RouterProvider router={router} />
                </Providers>
            </StrictMode>
            {/* Keep DevTools outside StrictMode to avoid dev-only WS close noise from double-mount. */}
            {isDev && <DevTools router={router} />}
        </>
    );
}
