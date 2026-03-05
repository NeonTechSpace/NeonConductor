import { messageStore, runStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import {
    profileInputSchema,
    sessionByIdInputSchema,
    sessionCreateInputSchema,
    sessionEditInputSchema,
    sessionListMessagesInputSchema,
    sessionListRunsInputSchema,
    sessionRevertInputSchema,
    sessionStartRunInputSchema,
} from '@/app/backend/runtime/contracts';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { sessionEditService } from '@/app/backend/runtime/services/sessionEdit/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';

export const sessionRouter = router({
    create: publicProcedure.input(sessionCreateInputSchema).mutation(async ({ input }) => {
        const session = await sessionStore.create(input.profileId, input.threadId, input.kind);
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
    list: publicProcedure.input(profileInputSchema).query(async ({ input }) => {
        return { sessions: await sessionStore.list(input.profileId) };
    }),
    status: publicProcedure.input(sessionByIdInputSchema).query(async ({ input }) => {
        return sessionStore.status(input.profileId, input.sessionId);
    }),
    startRun: publicProcedure.input(sessionStartRunInputSchema).mutation(async ({ input }) => {
        const result = await runExecutionService.startRun(input);

        if (result.accepted) {
            await runtimeEventLogService.append({
                entityType: 'session',
                entityId: input.sessionId,
                eventType: 'session.run.started',
                payload: {
                    runId: result.runId,
                    profileId: input.profileId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                    workspaceFingerprint: input.workspaceFingerprint ?? null,
                },
            });
        }

        return result;
    }),
    listRuns: publicProcedure.input(sessionListRunsInputSchema).query(async ({ input }) => {
        return {
            runs: await runStore.listBySession(input.profileId, input.sessionId),
        };
    }),
    listMessages: publicProcedure.input(sessionListMessagesInputSchema).query(async ({ input }) => {
        const [messages, messageParts] = await Promise.all([
            messageStore.listMessagesBySession(input.profileId, input.sessionId, input.runId),
            messageStore.listPartsBySession(input.profileId, input.sessionId, input.runId),
        ]);

        return {
            messages,
            messageParts,
        };
    }),
    abort: publicProcedure.input(sessionByIdInputSchema).mutation(async ({ input }) => {
        const result = await runExecutionService.abortRun(input.profileId, input.sessionId);
        if (result.aborted) {
            await runtimeEventLogService.append({
                entityType: 'session',
                entityId: input.sessionId,
                eventType: 'session.aborted',
                payload: {
                    runId: result.runId,
                    profileId: input.profileId,
                },
            });
        }

        return result;
    }),
    revert: publicProcedure.input(sessionRevertInputSchema).mutation(async ({ input }) => {
        if (input.topLevelTab === 'chat') {
            return {
                reverted: false as const,
                reason: 'unsupported_tab' as const,
                message: 'Checkpoint-style revert is only supported in agent and orchestrator tabs.',
            };
        }
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (!sessionThread) {
            return {
                reverted: false as const,
                reason: 'not_found' as const,
            };
        }
        if (sessionThread.thread.topLevelTab !== input.topLevelTab) {
            return {
                reverted: false as const,
                reason: 'thread_tab_mismatch' as const,
                message: `Thread belongs to "${sessionThread.thread.topLevelTab}" tab.`,
            };
        }

        const result = await sessionStore.revert(input.profileId, input.sessionId);
        if (result.reverted) {
            await runtimeEventLogService.append({
                entityType: 'session',
                entityId: input.sessionId,
                eventType: 'session.reverted',
                payload: {
                    session: result.session,
                    profileId: input.profileId,
                },
            });
        }

        return result;
    }),
    edit: publicProcedure.input(sessionEditInputSchema).mutation(async ({ input }) => {
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (!sessionThread) {
            return {
                edited: false as const,
                reason: 'session_not_found' as const,
            };
        }
        if (sessionThread.thread.topLevelTab !== input.topLevelTab) {
            return {
                edited: false as const,
                reason: 'thread_tab_mismatch' as const,
            };
        }

        const result = await sessionEditService.edit(input);
        if (result.edited) {
            await runtimeEventLogService.append({
                entityType: 'session',
                entityId: result.sessionId,
                eventType: 'session.edited',
                payload: {
                    profileId: input.profileId,
                    sourceSessionId: result.sourceSessionId,
                    sessionId: result.sessionId,
                    editMode: result.editMode,
                    started: result.started,
                    runId: result.runId ?? null,
                },
            });
        }

        return result;
    }),
});
