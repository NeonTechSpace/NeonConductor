import {
    conversationAttachmentStore,
    executionReceiptStore,
    messageStore,
    runStore,
    sessionOutboxStore,
    sessionStore,
    threadStore,
} from '@/app/backend/persistence/stores';
import type { ProviderRuntimeTransportSelection } from '@/app/backend/providers/types';
import type { ProviderRuntimeTransportFamily } from '@/app/backend/providers/types';
import { InvariantError } from '@/app/backend/runtime/services/common/fatalErrors';
import { withCorrelationContext } from '@/app/backend/runtime/services/common/logContext';
import { sessionContextService } from '@/app/backend/runtime/services/context/sessionContextService';
import { prepareRunContractPreview } from '@/app/backend/runtime/services/runContract/service';
import type { RunExecutionError } from '@/app/backend/runtime/services/runExecution/errors';
import { persistRunStart } from '@/app/backend/runtime/services/runExecution/persistRunStart';
import { prepareRunStart } from '@/app/backend/runtime/services/runExecution/prepareRunStart';
import { toRejectedStartResult } from '@/app/backend/runtime/services/runExecution/rejection';
import { runToTerminalState } from '@/app/backend/runtime/services/runExecution/runToTerminalState';
import { moveRunToAbortedState } from '@/app/backend/runtime/services/runExecution/terminalState';
import type { StartRunInput, StartRunResult } from '@/app/backend/runtime/services/runExecution/types';
import { workspaceContextService } from '@/app/backend/runtime/services/workspaceContext/service';
import { appLog } from '@/app/main/logging';

import { isEntityId } from '@/shared/contracts';
import type {
    EntityId,
    RunContractPreview,
    RunContractPreviewResult,
    SessionAttachmentPayload,
    SessionOutboxEntry,
    SessionUpdateOutboxEntryResult,
    SessionGetOutboxEntryResult,
    SessionMoveOutboxEntryResult,
    SessionCancelOutboxEntryResult,
    SessionResumeOutboxEntryResult,
    SessionQueueRunResult,
    SessionGetExecutionReceiptResult,
    SessionListOutboxResult,
} from '@/shared/contracts';

interface ActiveRun {
    profileId: string;
    sessionId: string;
    runId: string;
    controller: AbortController;
    completion: Promise<void>;
}

function createSessionKey(profileId: string, sessionId: string): string {
    return `${profileId}:${sessionId}`;
}

function toTransportSelection(input: {
    selected: ProviderRuntimeTransportFamily;
    requested: StartRunInput['runtimeOptions']['transport']['family'];
    degraded: boolean;
    degradedReason?: string;
}): ProviderRuntimeTransportSelection {
    return {
        selected: input.selected,
        requested: input.requested,
        degraded: input.degraded,
        ...(input.degradedReason ? { degradedReason: input.degradedReason } : {}),
    };
}

function readPermissionRequestIdFromAction(action: unknown): EntityId<'perm'> | undefined {
    if (!action || typeof action !== 'object') {
        return undefined;
    }
    const requestId = (action as Record<string, unknown>)['requestId'];
    return typeof requestId === 'string' && isEntityId(requestId, 'perm') ? requestId : undefined;
}

function toComposerAttachmentInput(payload: SessionAttachmentPayload): NonNullable<StartRunInput['attachments']>[number] {
    if (payload.kind === 'text_file_attachment') {
        return {
            clientId: payload.id,
            kind: 'text_file_attachment',
            fileName: payload.fileName ?? 'attachment.txt',
            mimeType: payload.mimeType,
            text: payload.text,
            sha256: payload.sha256,
            byteSize: payload.byteSize,
            encoding: payload.encoding ?? 'utf-8',
        };
    }

    return {
        clientId: payload.id,
        kind: 'image_attachment',
        mimeType: payload.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
        bytesBase64: payload.bytesBase64,
        width: payload.width ?? 1,
        height: payload.height ?? 1,
        sha256: payload.sha256,
        byteSize: payload.byteSize,
        ...(payload.fileName ? { fileName: payload.fileName } : {}),
    };
}

export class RunExecutionService {
    private readonly activeRuns = new Map<string, ActiveRun>();
    private readonly activeRunsBySession = new Map<string, string>();

    private async loadOutboxStartInput(entry: SessionOutboxEntry): Promise<StartRunInput> {
        const attachments = await conversationAttachmentStore.listPayloadsByOutboxEntry(entry.id);
        return {
            profileId: entry.profileId,
            sessionId: entry.sessionId,
            prompt: entry.prompt,
            ...(entry.browserContext ? { browserContext: entry.browserContext } : {}),
            topLevelTab: entry.steeringSnapshot.topLevelTab,
            modeKey: entry.steeringSnapshot.modeKey,
            providerId: entry.steeringSnapshot.providerId,
            modelId: entry.steeringSnapshot.modelId,
            runtimeOptions: entry.steeringSnapshot.runtimeOptions,
            ...(entry.steeringSnapshot.workspaceFingerprint
                ? { workspaceFingerprint: entry.steeringSnapshot.workspaceFingerprint }
                : {}),
            ...(entry.steeringSnapshot.sandboxId ? { sandboxId: entry.steeringSnapshot.sandboxId } : {}),
            ...(attachments.length > 0 ? { attachments: attachments.map(toComposerAttachmentInput) } : {}),
        };
    }

    private async previewRunContractInternal(input: StartRunInput, previousCompatibleContract?: RunContractPreview) {
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (!sessionThread) {
            return {
                available: false as const,
                reason: 'not_found' as const,
            };
        }
        if (sessionThread.thread.topLevelTab !== input.topLevelTab) {
            const error = {
                code: 'invalid_mode',
                message: `Thread mode "${sessionThread.thread.topLevelTab}" does not match tab "${input.topLevelTab}".`,
                action: {
                    code: 'mode_invalid',
                    modeKey: input.modeKey,
                    topLevelTab: input.topLevelTab,
                },
            } satisfies RunExecutionError;

            return {
                available: false as const,
                reason: 'rejected' as const,
                code: error.code,
                message: error.message,
                action: error.action,
            };
        }

        const workspaceContext = await workspaceContextService.resolveForSession({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            allowLazySandboxCreation: input.topLevelTab !== 'chat',
        });
        if (!workspaceContext) {
            return {
                available: false as const,
                reason: 'rejected' as const,
                code: 'execution_target_unavailable',
                message: 'Workspace execution target could not be resolved for this session.',
                action: {
                    code: 'execution_target_unavailable',
                    target: 'workspace',
                    ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                    detail: 'workspace_not_resolved',
                },
            };
        }

        const preparedResult = await prepareRunStart({
            ...input,
            ...(workspaceContext.kind === 'sandbox' ? { sandboxId: workspaceContext.sandbox.id } : {}),
            workspaceContext,
        });
        if (preparedResult.isErr()) {
            return {
                available: false as const,
                reason: 'rejected' as const,
                code: preparedResult.error.code,
                message: preparedResult.error.message,
                ...(preparedResult.error.action ? { action: preparedResult.error.action } : {}),
            };
        }

        const preview = prepareRunContractPreview({
            startInput: input,
            prepared: preparedResult.value,
            ...(previousCompatibleContract ? { previousCompatibleContract } : {}),
        });
        if (!preview) {
            return {
                available: false as const,
                reason: 'rejected' as const,
                code: 'provider_request_failed',
                message: 'Run contract preview is unavailable because the prepared context could not be resolved.',
            };
        }

        return {
            available: true as const,
            preview,
        };
    }

    async startRun(
        input: StartRunInput,
        options?: {
            sourceOutboxEntryId?: EntityId<'outbox'>;
            previousCompatibleContract?: RunContractPreview;
        }
    ): Promise<StartRunResult> {
        const runnable = await sessionStore.ensureRunnableSession(input.profileId, input.sessionId);
        if (!runnable.ok) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start because session is not runnable.',
                ...withCorrelationContext(
                    { requestId: input.requestId, correlationId: input.correlationId },
                    {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        reason: runnable.reason,
                    }
                ),
            });
            return {
                accepted: false,
                reason: runnable.reason,
            };
        }

        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (!sessionThread) {
            return {
                accepted: false,
                reason: 'not_found',
            };
        }
        if (sessionThread.thread.topLevelTab !== input.topLevelTab) {
            const error = {
                code: 'invalid_mode',
                message: `Thread mode "${sessionThread.thread.topLevelTab}" does not match tab "${input.topLevelTab}".`,
                action: {
                    code: 'mode_invalid',
                    modeKey: input.modeKey,
                    topLevelTab: input.topLevelTab,
                },
            } satisfies RunExecutionError;

            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start because session thread mode does not match selected tab.',
                ...withCorrelationContext(
                    { requestId: input.requestId, correlationId: input.correlationId },
                    {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        expectedTopLevelTab: sessionThread.thread.topLevelTab,
                        requestedTopLevelTab: input.topLevelTab,
                    }
                ),
            });
            return toRejectedStartResult(error, input);
        }

        const workspaceContext = await workspaceContextService.resolveForSession({
            profileId: input.profileId,
            sessionId: input.sessionId,
            topLevelTab: input.topLevelTab,
            allowLazySandboxCreation: input.topLevelTab !== 'chat',
        });
        if (!workspaceContext) {
            return toRejectedStartResult(
                {
                    code: 'execution_target_unavailable',
                    message: 'Workspace execution target could not be resolved for this session.',
                    action: {
                        code: 'execution_target_unavailable',
                        target: 'workspace',
                        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                        detail: 'workspace_not_resolved',
                    },
                },
                input
            );
        }
        if (
            input.topLevelTab !== 'chat' &&
            (sessionThread.thread.executionEnvironmentMode === 'new_sandbox' ||
                sessionThread.thread.executionEnvironmentMode === 'sandbox') &&
            workspaceContext.kind !== 'sandbox'
        ) {
            return toRejectedStartResult(
                {
                    code: 'execution_target_unavailable',
                    message:
                        'Managed sandbox could not be materialized. Switch this thread to local workspace mode to allow shared-path editing.',
                    action: {
                        code: 'execution_target_unavailable',
                        target: 'sandbox',
                        ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                        detail: 'sandbox_not_materialized',
                    },
                },
                input
            );
        }

        const preparedResult = await prepareRunStart({
            ...input,
            ...(workspaceContext.kind === 'sandbox' ? { sandboxId: workspaceContext.sandbox.id } : {}),
            workspaceContext,
        });
        if (preparedResult.isErr()) {
            appLog.warn({
                tag: 'run-execution',
                message: 'Rejected run start during run preparation.',
                ...withCorrelationContext(
                    { requestId: input.requestId, correlationId: input.correlationId },
                    {
                        profileId: input.profileId,
                        sessionId: input.sessionId,
                        providerId: input.providerId ?? null,
                        modelId: input.modelId ?? null,
                        errorCode: preparedResult.error.code,
                        error: preparedResult.error.message,
                    }
                ),
            });
            return toRejectedStartResult(preparedResult.error, input);
        }

        const prepared = preparedResult.value;
        prepared.workspaceContext = workspaceContext;
        const runContractPreview = prepareRunContractPreview({
            startInput: input,
            prepared,
            ...(options?.previousCompatibleContract ? { previousCompatibleContract: options.previousCompatibleContract } : {}),
        });
        const persisted = await persistRunStart({
            input,
            prepared,
        });
        if (!isEntityId(sessionThread.thread.id, 'thr')) {
            throw new InvariantError('Session thread id is invalid for run execution.');
        }
        const transportSelection = toTransportSelection({
            selected: prepared.initialTransport.selected,
            requested: prepared.initialTransport.requested,
            degraded: prepared.initialTransport.degraded,
            ...(prepared.initialTransport.degradedReason
                ? { degradedReason: prepared.initialTransport.degradedReason }
                : {}),
        });

        const controller = new AbortController();
        const completion = runToTerminalState({
            profileId: input.profileId,
            sessionId: input.sessionId,
            threadId: sessionThread.thread.id,
            runId: persisted.run.id,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            prompt: input.prompt,
            providerId: prepared.activeTarget.providerId,
            modelId: prepared.activeTarget.modelId,
            runtime: prepared.runtimeDescriptor,
            ...(prepared.openAIExecutionMode ? { openAIExecutionMode: prepared.openAIExecutionMode } : {}),
            authMethod: prepared.resolvedAuth.authMethod,
            runtimeOptions: input.runtimeOptions,
            cache: prepared.resolvedCache,
            transportSelection,
            toolDefinitions: prepared.toolDefinitions,
            ...(prepared.resolvedAuth.apiKey ? { apiKey: prepared.resolvedAuth.apiKey } : {}),
            ...(prepared.resolvedAuth.accessToken ? { accessToken: prepared.resolvedAuth.accessToken } : {}),
            ...(prepared.resolvedAuth.organizationId ? { organizationId: prepared.resolvedAuth.organizationId } : {}),
            ...(prepared.kiloModeHeader ? { kiloModeHeader: prepared.kiloModeHeader } : {}),
            ...(prepared.kiloRouting ? { kiloRouting: prepared.kiloRouting } : {}),
            ...(prepared.runContext ? { contextMessages: prepared.runContext.messages } : {}),
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(workspaceContext.kind === 'sandbox' ? { sandboxId: workspaceContext.sandbox.id } : {}),
            workspaceContext,
            assistantMessageId: persisted.assistantMessageId,
            ...(runContractPreview ? { runContractPreview } : {}),
            ...(input.browserContext ? { browserContext: input.browserContext } : {}),
            ...(options?.sourceOutboxEntryId ? { sourceOutboxEntryId: options.sourceOutboxEntryId } : {}),
            signal: controller.signal,
        })
            .catch((error: unknown) => {
                const errorMessage = error instanceof Error ? error.message : String(error);
                appLog.error({
                    tag: 'run-execution',
                    message: 'Background run execution terminated with an unhandled error after start.',
                    ...withCorrelationContext(
                        { requestId: input.requestId, correlationId: input.correlationId },
                        {
                            profileId: input.profileId,
                            sessionId: input.sessionId,
                            runId: persisted.run.id,
                            providerId: prepared.activeTarget.providerId,
                            modelId: prepared.activeTarget.modelId,
                            error: errorMessage,
                        }
                    ),
                });
            })
            .finally(() => {
                this.activeRuns.delete(persisted.run.id);
                this.activeRunsBySession.delete(createSessionKey(input.profileId, input.sessionId));
                void this.processNextQueuedEntry(input.profileId, input.sessionId);
            });

        this.activeRuns.set(persisted.run.id, {
            profileId: input.profileId,
            sessionId: input.sessionId,
            runId: persisted.run.id,
            controller,
            completion,
        });
        this.activeRunsBySession.set(createSessionKey(input.profileId, input.sessionId), persisted.run.id);

        if (options?.sourceOutboxEntryId) {
            await sessionOutboxStore.update({
                profileId: input.profileId,
                sessionId: input.sessionId,
                entryId: options.sourceOutboxEntryId,
                state: 'running',
                ...(runContractPreview ? { latestRunContract: runContractPreview } : {}),
                activePermissionRequestId: null,
                pausedReason: null,
            });
        }

        appLog.info({
            tag: 'run-execution',
            message: 'Started session run.',
            ...withCorrelationContext(
                { requestId: input.requestId, correlationId: input.correlationId },
                {
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    runId: persisted.run.id,
                    providerId: prepared.activeTarget.providerId,
                    modelId: prepared.activeTarget.modelId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                }
            ),
        });

        const [run, sessionStatus, thread, resolvedContextStateResult, initialMessages, initialMessageParts] =
            await Promise.all([
                runStore.getById(persisted.run.id),
                sessionStore.status(input.profileId, input.sessionId),
                threadStore.getListRecordById(input.profileId, sessionThread.thread.id),
                sessionContextService.getResolvedStateForExecutionTarget({
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    providerId: prepared.activeTarget.providerId,
                    modelId: prepared.activeTarget.modelId,
                    topLevelTab: input.topLevelTab,
                    modeKey: input.modeKey,
                    prompt: input.prompt,
                    runId: persisted.run.id,
                    ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
                }),
                messageStore.listMessagesBySession(input.profileId, input.sessionId, persisted.run.id),
                messageStore.listPartsBySession(input.profileId, input.sessionId, persisted.run.id),
            ]);

        if (!run || !sessionStatus.found) {
            throw new InvariantError(
                'Run start persisted successfully but the updated session state could not be reloaded.'
            );
        }

        const resolvedContextState = resolvedContextStateResult.isOk()
            ? resolvedContextStateResult.value
            : await sessionContextService.getResolvedState({
                  profileId: input.profileId,
                  sessionId: input.sessionId,
                  providerId: prepared.activeTarget.providerId,
                  modelId: prepared.activeTarget.modelId,
              });

        return {
            accepted: true,
            runId: persisted.run.id,
            runStatus: 'running',
            run,
            session: sessionStatus.session,
            initialMessages: {
                messages: initialMessages,
                messageParts: initialMessageParts,
            },
            ...(runContractPreview ? { runContractPreview } : {}),
            resolvedContextState,
            ...(thread ? { thread } : {}),
        };
    }

    private async processOutboxEntry(
        entry: SessionOutboxEntry
    ): Promise<{ started: true; runId: EntityId<'run'>; preview: RunContractPreview } | { started: false }> {
        const startInput = await this.loadOutboxStartInput(entry);
        const previewResult = await this.previewRunContractInternal(startInput, entry.latestRunContract);
        if (!previewResult.available) {
            await sessionOutboxStore.update({
                profileId: entry.profileId,
                sessionId: entry.sessionId,
                entryId: entry.id,
                state: previewResult.code === 'permission_required' ? 'paused_for_permission' : 'paused_for_review',
                activePermissionRequestId:
                    previewResult.code === 'permission_required'
                        ? (readPermissionRequestIdFromAction(previewResult.action) ?? null)
                        : null,
                pausedReason: previewResult.message ?? 'Run contract could not be re-resolved.',
            });
            return { started: false };
        }

        if (previewResult.preview.diffFromLastCompatible?.hasMaterialChanges) {
            await sessionOutboxStore.update({
                profileId: entry.profileId,
                sessionId: entry.sessionId,
                entryId: entry.id,
                state: 'paused_for_review',
                latestRunContract: previewResult.preview,
                pausedReason:
                    previewResult.preview.diffFromLastCompatible.items[0]?.reason ??
                    'Queued run contract changed materially and needs review.',
                activePermissionRequestId: null,
            });
            return { started: false };
        }

        const started = await this.startRun(startInput, {
            sourceOutboxEntryId: entry.id,
            ...(entry.latestRunContract ? { previousCompatibleContract: entry.latestRunContract } : {}),
        });
        if (!started.accepted) {
            await sessionOutboxStore.update({
                profileId: entry.profileId,
                sessionId: entry.sessionId,
                entryId: entry.id,
                state: started.code === 'permission_required' ? 'paused_for_permission' : 'paused_for_review',
                latestRunContract: previewResult.preview,
                activePermissionRequestId:
                    started.code === 'permission_required'
                        ? (readPermissionRequestIdFromAction(started.action) ?? null)
                        : null,
                pausedReason: started.message ?? 'Queued run could not be started.',
            });
            return { started: false };
        }

        return {
            started: true,
            runId: started.runId,
            preview: previewResult.preview,
        };
    }

    private async processNextQueuedEntry(profileId: string, sessionId: EntityId<'sess'>): Promise<void> {
        const sessionKey = createSessionKey(profileId, sessionId);
        if (this.activeRunsBySession.has(sessionKey)) {
            return;
        }

        const nextEntry = await sessionOutboxStore.getNextQueued(profileId, sessionId);
        if (!nextEntry) {
            return;
        }

        try {
            await this.processOutboxEntry(nextEntry);
        } catch (error) {
            appLog.error({
                tag: 'run-execution',
                message: 'Failed to process queued outbox entry.',
                profileId,
                sessionId,
                outboxEntryId: nextEntry.id,
                error: error instanceof Error ? error.message : String(error),
            });
        }
    }

    async listOutbox(profileId: string, sessionId: EntityId<'sess'>): Promise<SessionListOutboxResult> {
        return {
            entries: await sessionOutboxStore.listBySession(profileId, sessionId),
        };
    }

    async getOutboxEntry(profileId: string, sessionId: EntityId<'sess'>, entryId: EntityId<'outbox'>): Promise<SessionGetOutboxEntryResult> {
        const entry = await sessionOutboxStore.getById({ profileId, sessionId, entryId });
        if (!entry) {
            return { found: false };
        }
        return {
            found: true,
            entry,
            attachments: await conversationAttachmentStore.listPayloadsByOutboxEntry(entryId),
        };
    }

    async queueRun(input: StartRunInput): Promise<SessionQueueRunResult> {
        const previewResult = await this.previewRunContractInternal(input);
        if (!previewResult.available) {
            throw new InvariantError(previewResult.message ?? 'Cannot queue a run without a valid run contract preview.');
        }

        const attachmentSummaries = await Promise.all(
            (input.attachments ?? []).map((attachment) =>
                conversationAttachmentStore.createSnapshot({
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    attachment,
                })
            )
        );

        const entry = await sessionOutboxStore.create({
            profileId: input.profileId,
            sessionId: input.sessionId,
            prompt: input.prompt,
            steeringSnapshot: previewResult.preview.steeringSnapshot,
            attachmentIds: attachmentSummaries.map((attachment) => attachment.id),
            ...(input.browserContext ? { browserContext: input.browserContext } : {}),
            latestRunContract: previewResult.preview,
        });
        await conversationAttachmentStore.replaceOutboxEntryAttachments({
            outboxEntryId: entry.id,
            attachmentIds: attachmentSummaries.map((attachment) => attachment.id),
        });
        return {
            queued: true,
            entry,
        };
    }

    async updateOutboxEntry(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        entryId: EntityId<'outbox'>;
        prompt: string;
        attachments?: StartRunInput['attachments'];
        browserContext?: StartRunInput['browserContext'] | null;
    }): Promise<SessionUpdateOutboxEntryResult> {
        const existing = await sessionOutboxStore.getById({
            profileId: input.profileId,
            sessionId: input.sessionId,
            entryId: input.entryId,
        });
        if (!existing) {
            return { updated: false, reason: 'not_found' };
        }

        const nextBrowserContext =
            input.browserContext === undefined ? existing.browserContext : input.browserContext ?? undefined;
        const nextAttachments =
            input.attachments !== undefined
                ? input.attachments
                : (await conversationAttachmentStore.listPayloadsByOutboxEntry(input.entryId)).map(toComposerAttachmentInput);

        const previewInput: StartRunInput = {
            profileId: input.profileId,
            sessionId: input.sessionId,
            prompt: input.prompt,
            topLevelTab: existing.steeringSnapshot.topLevelTab,
            modeKey: existing.steeringSnapshot.modeKey,
            providerId: existing.steeringSnapshot.providerId,
            modelId: existing.steeringSnapshot.modelId,
            runtimeOptions: existing.steeringSnapshot.runtimeOptions,
            ...(existing.steeringSnapshot.workspaceFingerprint
                ? { workspaceFingerprint: existing.steeringSnapshot.workspaceFingerprint }
                : {}),
            ...(existing.steeringSnapshot.sandboxId ? { sandboxId: existing.steeringSnapshot.sandboxId } : {}),
            ...(nextAttachments.length > 0 ? { attachments: nextAttachments } : {}),
            ...(nextBrowserContext ? { browserContext: nextBrowserContext } : {}),
        };
        const previewResult = await this.previewRunContractInternal(previewInput);
        const attachmentSummaries = await Promise.all(
            nextAttachments.map((attachment) =>
                conversationAttachmentStore.createSnapshot({
                    profileId: input.profileId,
                    sessionId: input.sessionId,
                    attachment,
                })
            )
        );
        await conversationAttachmentStore.replaceOutboxEntryAttachments({
            outboxEntryId: input.entryId,
            attachmentIds: attachmentSummaries.map((attachment) => attachment.id),
        });
        const updated = await sessionOutboxStore.update({
            profileId: input.profileId,
            sessionId: input.sessionId,
            entryId: input.entryId,
            prompt: input.prompt,
            ...(input.browserContext !== undefined ? { browserContext: input.browserContext } : {}),
            latestRunContract: previewResult.available ? previewResult.preview : null,
            state: previewResult.available ? 'queued' : previewResult.code === 'permission_required' ? 'paused_for_permission' : 'paused_for_review',
            activePermissionRequestId:
                !previewResult.available &&
                previewResult.code === 'permission_required'
                    ? (readPermissionRequestIdFromAction(previewResult.action) ?? null)
                    : null,
            pausedReason: previewResult.available ? null : previewResult.message ?? 'Queued entry needs review.',
        });
        return updated ? { updated: true, entry: updated } : { updated: false, reason: 'not_found' };
    }

    async moveOutboxEntry(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        entryId: EntityId<'outbox'>;
        direction: 'up' | 'down';
    }): Promise<SessionMoveOutboxEntryResult> {
        const moved = await sessionOutboxStore.move(input);
        return 'entry' in moved ? { moved: true, entry: moved.entry } : { moved: false, reason: moved.reason };
    }

    async cancelOutboxEntry(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        entryId: EntityId<'outbox'>;
    }): Promise<SessionCancelOutboxEntryResult> {
        const entry = await sessionOutboxStore.update({
            profileId: input.profileId,
            sessionId: input.sessionId,
            entryId: input.entryId,
            state: 'cancelled',
            activePermissionRequestId: null,
            pausedReason: 'Cancelled by operator.',
        });
        return entry ? { cancelled: true, entry } : { cancelled: false, reason: 'not_found' };
    }

    async resumeOutboxEntry(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        entryId: EntityId<'outbox'>;
    }): Promise<SessionResumeOutboxEntryResult> {
        const entry = await sessionOutboxStore.getById(input);
        if (!entry) {
            return { resumed: false, reason: 'not_found' };
        }
        const runnable = await sessionStore.ensureRunnableSession(input.profileId, input.sessionId);
        if (!runnable.ok) {
            return { resumed: false, reason: runnable.reason };
        }
        const result = await this.processOutboxEntry(entry);
        if (!result.started) {
            const refreshed = await sessionOutboxStore.getById(input);
            return {
                resumed: false,
                reason: refreshed?.state === 'paused_for_permission' ? 'rejected' : 'rejected',
                ...(refreshed?.latestRunContract ? { runContractPreview: refreshed.latestRunContract } : {}),
                ...(refreshed?.activePermissionRequestId
                    ? {
                          action: {
                              code: 'permission_required',
                              requestId: refreshed.activePermissionRequestId,
                          },
                      }
                    : {}),
                ...(refreshed?.pausedReason ? { message: refreshed.pausedReason } : {}),
                ...(refreshed ? { entry: refreshed } : {}),
            };
        }
        const refreshed = await sessionOutboxStore.getById(input);
        return {
            resumed: true,
            runId: result.runId,
            runContractPreview: result.preview,
            ...(refreshed ? { entry: refreshed } : {}),
        };
    }

    async getExecutionReceipt(profileId: string, runId: EntityId<'run'>): Promise<SessionGetExecutionReceiptResult> {
        const receipt = await executionReceiptStore.getByRunId(profileId, runId);
        return receipt ? { found: true, receipt } : { found: false };
    }

    async previewRunContract(input: StartRunInput): Promise<RunContractPreviewResult> {
        return this.previewRunContractInternal(input);
    }

    async abortRun(
        profileId: string,
        sessionId: EntityId<'sess'>
    ): Promise<{ aborted: false; reason: 'not_found' | 'not_running' } | { aborted: true; runId: string }> {
        const session = await sessionStore.status(profileId, sessionId);
        if (!session.found) {
            return { aborted: false, reason: 'not_found' };
        }

        if (!session.activeRunId) {
            return { aborted: false, reason: 'not_running' };
        }

        const runId = session.activeRunId;
        const activeRun = this.activeRuns.get(runId);
        if (activeRun) {
            activeRun.controller.abort();
            await activeRun.completion;
            appLog.info({
                tag: 'run-execution',
                message: 'Aborted active session run.',
                profileId,
                sessionId,
                runId,
            });
            return {
                aborted: true,
                runId,
            };
        }

        await moveRunToAbortedState({
            profileId,
            sessionId,
            runId,
            logMessage: 'Aborted persisted run without active in-memory controller.',
        });

        return {
            aborted: true,
            runId,
        };
    }
}

export const runExecutionService = new RunExecutionService();

