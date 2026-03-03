/**
 * Root tRPC router.
 * Mounts all domain routers here; AppRouter type is exported for client inference.
 */

import { router } from '@/app/backend/trpc/init';
import { mcpRouter } from '@/app/backend/trpc/routers/mcp';
import { permissionRouter } from '@/app/backend/trpc/routers/permission';
import { providerRouter } from '@/app/backend/trpc/routers/provider';
import { runtimeRouter } from '@/app/backend/trpc/routers/runtime';
import { sessionRouter } from '@/app/backend/trpc/routers/session';
import { systemRouter } from '@/app/backend/trpc/routers/system';
import { toolRouter } from '@/app/backend/trpc/routers/tool';
import { updatesRouter } from '@/app/backend/trpc/routers/updates';

export const appRouter = router({
    runtime: runtimeRouter,
    session: sessionRouter,
    provider: providerRouter,
    permission: permissionRouter,
    tool: toolRouter,
    mcp: mcpRouter,
    system: systemRouter,
    updates: updatesRouter,
});

export type AppRouter = typeof appRouter;
