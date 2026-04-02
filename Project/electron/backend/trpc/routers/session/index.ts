import { messageMediaStore, messageStore, runStore, sessionStore, threadStore } from '@/app/backend/persistence/stores';
import {
    profileInputSchema,
    sessionBranchFromMessageInputSchema,
    sessionBranchFromMessageWithBranchWorkflowInputSchema,
    sessionByIdInputSchema,
    sessionCreateInputSchema,
    sessionEditInputSchema,
    sessionGetAttachedRulesInputSchema,
    sessionGetAttachedSkillsInputSchema,
    sessionGetMessageMediaInputSchema,
    sessionListMessagesInputSchema,
    sessionListRunsInputSchema,
    sessionRevertInputSchema,
    sessionSetAttachedRulesInputSchema,
    sessionSetAttachedSkillsInputSchema,
    sessionStartRunInputSchema,
    type SessionAttachedRulesResult,
    type SessionAttachedSkillsResult,
} from '@/app/backend/runtime/contracts';
import { eventMetadata } from '@/app/backend/runtime/services/common/logContext';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';
import { runtimeStatusEvent, runtimeUpsertEvent } from '@/app/backend/runtime/services/runtimeEventEnvelope';
import { runtimeEventLogService } from '@/app/backend/runtime/services/runtimeEventLog';
import { sessionBranchService } from '@/app/backend/runtime/services/sessionBranch/service';
import { sessionEditService } from '@/app/backend/runtime/services/sessionEdit/service';
import { sessionHistoryService } from '@/app/backend/runtime/services/sessionHistory/service';
import { getAttachedRules, setAttachedRules } from '@/app/backend/runtime/services/sessionRules/service';
import { getAttachedSkills, setAttachedSkills } from '@/app/backend/runtime/services/sessionSkills/service';
import { publicProcedure, router } from '@/app/backend/trpc/init';
import { raiseMappedTrpcError, toTrpcError, unwrapResultOrThrow } from '@/app/backend/trpc/trpcErrorMap';

export const sessionRouter = router({
    create: publicProcedure.input(sessionCreateInputSchema).mutation(async ({ input, ctx }) => {
        const session = await sessionStore.create(input.profileId, input.threadId, input.kind);
        if (!session.created) {
            return {
                created: false as const,
                reason: session.reason,
            };
        }
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'session',
                domain: 'session',
                entityId: session.session.id,
                eventType: 'session.created',
                payload: {
                    session: session.session,
                },
                ...eventMetadata({
                    requestId: ctx.requestId,
                    correlationId: ctx.correlationId,
                    origin: 'trpc.session.create',
                }),
            })
        );

        const thread = await threadStore.getListRecordById(input.profileId, session.session.threadId);

        return {
            created: true as const,
            session: session.session,
            ...(thread ? { thread } : {}),
        };
    }),
    list: publicProcedure.input(profileInputSchema).query(async ({ input }) => {
        return { sessions: await sessionStore.list(input.profileId) };
    }),
    status: publicProcedure.input(sessionByIdInputSchema).query(async ({ input }) => {
        return sessionStore.status(input.profileId, input.sessionId);
    }),
    getAttachedRules: publicProcedure.input(sessionGetAttachedRulesInputSchema).query(async ({ input }) => {
        const result = await getAttachedRules(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    getAttachedSkills: publicProcedure.input(sessionGetAttachedSkillsInputSchema).query(async ({ input }) => {
        const result = await getAttachedSkills(input);
        return unwrapResultOrThrow(result, toTrpcError);
    }),
    setAttachedRules: publicProcedure.input(sessionSetAttachedRulesInputSchema).mutation(async ({ input, ctx }) => {
        const attachedRules = (await setAttachedRules(input)).match(
            (value: SessionAttachedRulesResult) => value,
            (error: Parameters<typeof raiseMappedTrpcError>[0]) => raiseMappedTrpcError(error, toTrpcError)
        );
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'session',
                domain: 'session',
                entityId: input.sessionId,
                eventType: 'session.attached_rules.updated',
                payload: {
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    assetKeys: attachedRules.rulesets.map((ruleset) => ruleset.assetKey),
                    presetKeys: attachedRules.presetKeys,
                    ...(attachedRules.missingAssetKeys ? { missingAssetKeys: attachedRules.missingAssetKeys } : {}),
                },
                ...eventMetadata({
                    requestId: ctx.requestId,
                    correlationId: ctx.correlationId,
                    origin: 'trpc.session.setAttachedRules',
                }),
            })
        );

        return attachedRules;
    }),
    setAttachedSkills: publicProcedure.input(sessionSetAttachedSkillsInputSchema).mutation(async ({ input, ctx }) => {
        const attachedSkills = (await setAttachedSkills(input)).match(
            (value: SessionAttachedSkillsResult) => value,
            (error: Parameters<typeof raiseMappedTrpcError>[0]) => raiseMappedTrpcError(error, toTrpcError)
        );
        await runtimeEventLogService.append(
            runtimeUpsertEvent({
                entityType: 'session',
                domain: 'session',
                entityId: input.sessionId,
                eventType: 'session.attached_skills.updated',
                payload: {
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    assetKeys: attachedSkills.skillfiles.map((skillfile: { assetKey: string }) => skillfile.assetKey),
                    ...(attachedSkills.missingAssetKeys ? { missingAssetKeys: attachedSkills.missingAssetKeys } : {}),
                },
                ...eventMetadata({
                    requestId: ctx.requestId,
                    correlationId: ctx.correlationId,
                    origin: 'trpc.session.setAttachedSkills',
                }),
            })
        );

        return attachedSkills;
    }),
    startRun: publicProcedure.input(sessionStartRunInputSchema).mutation(async ({ input, ctx }) => {
        const result = await runExecutionService.startRun({
            ...input,
            requestId: ctx.requestId,
            correlationId: ctx.correlationId,
        });

        if (result.accepted) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'session',
                    domain: 'session',
                    entityId: input.sessionId,
                    eventType: 'session.run.started',
                    payload: {
                        runId: result.runId,
                        profileId: input.profileId,
                        topLevelTab: input.topLevelTab,
                        modeKey: input.modeKey,
                        workspaceFingerprint: input.workspaceFingerprint ?? null,
                    },
                    ...eventMetadata({
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                        origin: 'trpc.session.startRun',
                    }),
                })
            );
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
    getMessageMedia: publicProcedure.input(sessionGetMessageMediaInputSchema).query(async ({ input }) => {
        const media = await messageMediaStore.getPayloadForProfile(input.profileId, input.mediaId);

        return {
            found: media !== null,
            ...(media ?? {}),
        };
    }),
    abort: publicProcedure.input(sessionByIdInputSchema).mutation(async ({ input, ctx }) => {
        const result = await runExecutionService.abortRun(input.profileId, input.sessionId);
        if (result.aborted) {
            await runtimeEventLogService.append(
                runtimeStatusEvent({
                    entityType: 'session',
                    domain: 'session',
                    entityId: input.sessionId,
                    eventType: 'session.aborted',
                    payload: {
                        runId: result.runId,
                        profileId: input.profileId,
                    },
                    ...eventMetadata({
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                        origin: 'trpc.session.abort',
                    }),
                })
            );
        }

        return result;
    }),
    revert: publicProcedure.input(sessionRevertInputSchema).mutation(async ({ input, ctx }) => {
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

        const result = await sessionHistoryService.revert(input.profileId, input.sessionId);
        if (result.reverted) {
            await runtimeEventLogService.append(
                runtimeUpsertEvent({
                    entityType: 'session',
                    domain: 'session',
                    entityId: input.sessionId,
                    eventType: 'session.reverted',
                    payload: {
                        session: result.session,
                        profileId: input.profileId,
                    },
                    ...eventMetadata({
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                        origin: 'trpc.session.revert',
                    }),
                })
            );
        }

        return result;
    }),
    edit: publicProcedure.input(sessionEditInputSchema).mutation(async ({ input, ctx }) => {
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
            await runtimeEventLogService.append(
                runtimeUpsertEvent({
                    entityType: 'session',
                    domain: 'session',
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
                    ...eventMetadata({
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                        origin: 'trpc.session.edit',
                    }),
                })
            );
        }

        return result;
    }),
    branchFromMessage: publicProcedure.input(sessionBranchFromMessageInputSchema).mutation(async ({ input, ctx }) => {
        const result = await sessionBranchService.branchFromMessage(input);
        if (result.branched) {
            await runtimeEventLogService.append(
                runtimeUpsertEvent({
                    entityType: 'session',
                    domain: 'session',
                    entityId: result.sessionId,
                    eventType: 'session.branched_from_message',
                    payload: {
                        profileId: input.profileId,
                        sourceSessionId: result.sourceSessionId,
                        sessionId: result.sessionId,
                        sourceThreadId: result.sourceThreadId,
                        threadId: result.threadId,
                        messageId: input.messageId,
                    },
                    ...eventMetadata({
                        requestId: ctx.requestId,
                        correlationId: ctx.correlationId,
                        origin: 'trpc.session.branchFromMessage',
                    }),
                })
            );
        }

        return result;
    }),
    branchFromMessageWithBranchWorkflow: publicProcedure
        .input(sessionBranchFromMessageWithBranchWorkflowInputSchema)
        .mutation(async ({ input, ctx }) => {
            const result = await sessionBranchService.branchFromMessageWithBranchWorkflow(input);
            if (result.branched) {
                await runtimeEventLogService.append(
                    runtimeUpsertEvent({
                        entityType: 'session',
                        domain: 'session',
                        entityId: result.sessionId,
                        eventType: 'session.branched_from_message',
                        payload: {
                            profileId: input.profileId,
                            sourceSessionId: result.sourceSessionId,
                            sessionId: result.sessionId,
                            sourceThreadId: result.sourceThreadId,
                            threadId: result.threadId,
                            messageId: input.messageId,
                            branchWorkflowId: input.branchWorkflowId ?? null,
                            branchWorkflowExecution: result.branchWorkflowExecution,
                        },
                        ...eventMetadata({
                            requestId: ctx.requestId,
                            correlationId: ctx.correlationId,
                            origin: 'trpc.session.branchFromMessageWithBranchWorkflow',
                        }),
                    })
                );
            }

            return result;
        }),
});
