import { sessionStore } from '@/app/backend/persistence/stores';
import {
    sessionByIdInputSchema,
    sessionCreateInputSchema,
    sessionPromptInputSchema,
} from '@/app/backend/runtime/contracts';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const sessionRouter = router({
    create: publicProcedure.input(sessionCreateInputSchema).mutation(async ({ input }) => {
        const session = await sessionStore.create(input.scope, input.kind, input.workspaceFingerprint);
        await runtimeEventLogService.append({
            entityType: 'session',
            entityId: session.id,
            eventType: 'session.created',
            payload: {
                session,
            },
        });

        return { session };
    }),
    list: publicProcedure.query(async () => {
        return { sessions: await sessionStore.list() };
    }),
    status: publicProcedure.input(sessionByIdInputSchema).query(async ({ input }) => {
        return sessionStore.status(input.sessionId);
    }),
    prompt: publicProcedure.input(sessionPromptInputSchema).mutation(async ({ input }) => {
        const result = await sessionStore.prompt(input.sessionId, input.prompt);

        if (result.accepted) {
            await runtimeEventLogService.append({
                entityType: 'session',
                entityId: input.sessionId,
                eventType: 'session.prompted',
                payload: {
                    runId: result.runId,
                    turnCount: result.turnCount,
                },
            });
        }

        return result;
    }),
    abort: publicProcedure.input(sessionByIdInputSchema).mutation(async ({ input }) => {
        const result = await sessionStore.abort(input.sessionId);
        if (result.aborted) {
            await runtimeEventLogService.append({
                entityType: 'session',
                entityId: input.sessionId,
                eventType: 'session.aborted',
                payload: {
                    session: result.session,
                },
            });
        }

        return result;
    }),
    revert: publicProcedure.input(sessionByIdInputSchema).mutation(async ({ input }) => {
        const result = await sessionStore.revert(input.sessionId);
        if (result.reverted) {
            await runtimeEventLogService.append({
                entityType: 'session',
                entityId: input.sessionId,
                eventType: 'session.reverted',
                payload: {
                    session: result.session,
                },
            });
        }

        return result;
    }),
});
