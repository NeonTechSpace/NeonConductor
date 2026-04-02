/**
 * Root tRPC router.
 * Mounts all domain routers here; AppRouter type is exported for client inference.
 */

import { router } from '@/app/backend/trpc/init';
import { branchWorkflowRouter } from '@/app/backend/trpc/routers/branchWorkflow';
import { checkpointRouter } from '@/app/backend/trpc/routers/checkpoint';
import { composerRouter } from '@/app/backend/trpc/routers/composer';
import { contextRouter } from '@/app/backend/trpc/routers/context';
import { conversationRouter } from '@/app/backend/trpc/routers/conversation';
import { diffRouter } from '@/app/backend/trpc/routers/diff';
import { mcpRouter } from '@/app/backend/trpc/routers/mcp';
import { memoryRouter } from '@/app/backend/trpc/routers/memory';
import { modeRouter } from '@/app/backend/trpc/routers/mode';
import { orchestratorRouter } from '@/app/backend/trpc/routers/orchestrator';
import { permissionRouter } from '@/app/backend/trpc/routers/permission';
import { planRouter } from '@/app/backend/trpc/routers/plan';
import { profileRouter } from '@/app/backend/trpc/routers/profile';
import { promptRouter } from '@/app/backend/trpc/routers/prompt';
import { providerRouter } from '@/app/backend/trpc/routers/provider';
import { registryRouter } from '@/app/backend/trpc/routers/registry';
import { runtimeRouter } from '@/app/backend/trpc/routers/runtime';
import { sandboxRouter } from '@/app/backend/trpc/routers/sandbox';
import { sessionRouter } from '@/app/backend/trpc/routers/session';
import { systemRouter } from '@/app/backend/trpc/routers/system';
import { toolRouter } from '@/app/backend/trpc/routers/tool';
import { updatesRouter } from '@/app/backend/trpc/routers/updates';

export const appRouter = router({
    runtime: runtimeRouter,
    composer: composerRouter,
    context: contextRouter,
    checkpoint: checkpointRouter,
    conversation: conversationRouter,
    diff: diffRouter,
    session: sessionRouter,
    provider: providerRouter,
    registry: registryRouter,
    permission: permissionRouter,
    tool: toolRouter,
    mcp: mcpRouter,
    memory: memoryRouter,
    mode: modeRouter,
    prompt: promptRouter,
    plan: planRouter,
    orchestrator: orchestratorRouter,
    profile: profileRouter,
    system: systemRouter,
    sandbox: sandboxRouter,
    branchWorkflow: branchWorkflowRouter,
    updates: updatesRouter,
});

export type AppRouter = typeof appRouter;
