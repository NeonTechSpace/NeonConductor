/*
Why: Single TanStack Router configured with hash history for Electron; routeTree is generated and centralizes navigation.
*/

import { createHashHistory, createRouter } from '@tanstack/react-router';

import { routerContextValue } from './routerContextValue';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
    routeTree,
    history: createHashHistory(),
    context: routerContextValue,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
});
export type AppRouter = typeof router;

declare module '@tanstack/react-router' {
    interface Register {
        router: AppRouter;
    }
}
