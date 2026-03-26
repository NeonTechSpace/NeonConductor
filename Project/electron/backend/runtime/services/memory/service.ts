import { conversationStore, memoryStore, runStore, threadStore } from '@/app/backend/persistence/stores';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
    MemoryCreateInput,
    MemoryDisableInput,
    MemoryListInput,
    MemoryRecord as RuntimeMemoryRecord,
    MemorySupersedeInput,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';

interface ResolvedMemoryProvenance {
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
}

function validateNoAdditionalProvenance(input: {
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
}): OperationalResult<void> {
    if (input.workspaceFingerprint || input.threadId || input.runId) {
        return errOp('invalid_input', 'This memory scope does not allow workspace, thread, or run provenance.');
    }

    return okOp(undefined);
}

function validateWorkspaceOnlyProvenance(input: {
    workspaceFingerprint?: string;
    threadId?: EntityId<'thr'>;
    runId?: EntityId<'run'>;
}): OperationalResult<{ workspaceFingerprint: string }> {
    if (!input.workspaceFingerprint) {
        return errOp('invalid_input', 'Workspace-scoped memory requires "workspaceFingerprint".');
    }
    if (input.threadId || input.runId) {
        return errOp('invalid_input', 'Workspace-scoped memory cannot include thread or run provenance.');
    }

    return okOp({
        workspaceFingerprint: input.workspaceFingerprint,
    });
}

class MemoryService {
    private async refreshDerivedIndex(profileId: string, memoryIds: EntityId<'mem'>[], reason: string): Promise<void> {
        await advancedMemoryDerivationService.refreshMemoryIdsSafely({
            profileId,
            memoryIds,
            reason,
        });
    }

    private async resolveCreateProvenance(
        input: MemoryCreateInput
    ): Promise<OperationalResult<ResolvedMemoryProvenance>> {
        if (input.scopeKind === 'global') {
            const validation = validateNoAdditionalProvenance(input);
            if (validation.isErr()) {
                return errOp(validation.error.code, validation.error.message, {
                    ...(validation.error.details ? { details: validation.error.details } : {}),
                    ...(validation.error.retryable !== undefined ? { retryable: validation.error.retryable } : {}),
                });
            }

            return okOp({});
        }

        if (input.scopeKind === 'workspace') {
            const validation = validateWorkspaceOnlyProvenance(input);
            if (validation.isErr()) {
                return errOp(validation.error.code, validation.error.message, {
                    ...(validation.error.details ? { details: validation.error.details } : {}),
                    ...(validation.error.retryable !== undefined ? { retryable: validation.error.retryable } : {}),
                });
            }

            return okOp(validation.value);
        }

        if (input.scopeKind === 'thread') {
            if (!input.threadId) {
                return errOp('invalid_input', 'Thread-scoped memory requires "threadId".');
            }
            if (input.runId) {
                return errOp('invalid_input', 'Thread-scoped memory cannot include "runId".');
            }

            const thread = await threadStore.getById(input.profileId, input.threadId);
            if (!thread) {
                return errOp('thread_not_found', `Thread "${input.threadId}" was not found.`);
            }

            const conversation = await conversationStore.getBucketById(input.profileId, thread.conversationId);
            if (!conversation) {
                return errOp('conversation_not_found', `Conversation "${thread.conversationId}" was not found.`);
            }

            const derivedWorkspaceFingerprint =
                conversation.scope === 'workspace' ? conversation.workspaceFingerprint : undefined;
            if (input.workspaceFingerprint && input.workspaceFingerprint !== derivedWorkspaceFingerprint) {
                return errOp('invalid_input', 'Thread-scoped memory workspace provenance does not match the thread.');
            }

            return okOp({
                ...(derivedWorkspaceFingerprint ? { workspaceFingerprint: derivedWorkspaceFingerprint } : {}),
                threadId: parseEntityId(thread.id, 'threads.id', 'thr'),
            });
        }

        if (!input.runId) {
            return errOp('invalid_input', 'Run-scoped memory requires "runId".');
        }
        if (input.threadId) {
            return errOp('invalid_input', 'Run-scoped memory cannot include "threadId"; it is derived from the run.');
        }

        const run = await runStore.getById(input.runId);
        if (!run || run.profileId !== input.profileId) {
            return errOp('not_found', `Run "${input.runId}" was not found.`);
        }

        const sessionThread = await threadStore.getBySessionId(input.profileId, run.sessionId);
        if (!sessionThread) {
            return errOp('thread_not_found', `Session thread for run "${input.runId}" was not found.`);
        }

        if (input.workspaceFingerprint && input.workspaceFingerprint !== sessionThread.workspaceFingerprint) {
            return errOp('invalid_input', 'Run-scoped memory workspace provenance does not match the run session.');
        }

        return okOp({
            ...(sessionThread.workspaceFingerprint ? { workspaceFingerprint: sessionThread.workspaceFingerprint } : {}),
            threadId: parseEntityId(sessionThread.thread.id, 'threads.id', 'thr'),
            runId: run.id,
        });
    }

    async listMemories(input: MemoryListInput): Promise<MemoryRecord[]> {
        return memoryStore.listByProfile(input);
    }

    async createMemory(input: MemoryCreateInput): Promise<OperationalResult<MemoryRecord>> {
        const resolvedProvenance = await this.resolveCreateProvenance(input);
        if (resolvedProvenance.isErr()) {
            return errOp(resolvedProvenance.error.code, resolvedProvenance.error.message, {
                ...(resolvedProvenance.error.details ? { details: resolvedProvenance.error.details } : {}),
                ...(resolvedProvenance.error.retryable !== undefined
                    ? { retryable: resolvedProvenance.error.retryable }
                    : {}),
            });
        }

        const createdMemory = await memoryStore.create({
            profileId: input.profileId,
            memoryType: input.memoryType,
            scopeKind: input.scopeKind,
            createdByKind: input.createdByKind,
            title: input.title,
            bodyMarkdown: input.bodyMarkdown,
            ...(input.summaryText ? { summaryText: input.summaryText } : {}),
            ...(input.metadata ? { metadata: input.metadata } : {}),
            ...resolvedProvenance.value,
        });
        await this.refreshDerivedIndex(input.profileId, [createdMemory.id], 'create_memory');

        return okOp(createdMemory);
    }

    async disableMemory(input: MemoryDisableInput): Promise<OperationalResult<MemoryRecord>> {
        const existing = await memoryStore.getById(input.profileId, input.memoryId);
        if (!existing) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        if (existing.state !== 'active') {
            return errOp('invalid_input', 'Only active memory can be disabled.');
        }

        const disabled = await memoryStore.disable(input.profileId, input.memoryId);
        if (!disabled) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        await this.refreshDerivedIndex(input.profileId, [disabled.id], 'disable_memory');

        return okOp(disabled);
    }

    async updateMemory(input: {
        profileId: string;
        memoryId: EntityId<'mem'>;
        title: string;
        bodyMarkdown: string;
        summaryText?: string;
        metadata?: Record<string, unknown>;
    }): Promise<OperationalResult<RuntimeMemoryRecord>> {
        const existing = await memoryStore.getById(input.profileId, input.memoryId);
        if (!existing) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        if (existing.state !== 'active') {
            return errOp('invalid_input', 'Only active memory can be updated.');
        }

        const updated = await memoryStore.updateEditableFields(input);
        if (!updated) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        await this.refreshDerivedIndex(input.profileId, [updated.id], 'update_memory');

        return okOp(updated);
    }

    async supersedeMemory(
        input: MemorySupersedeInput
    ): Promise<OperationalResult<{ previous: MemoryRecord; replacement: MemoryRecord }>> {
        const existing = await memoryStore.getById(input.profileId, input.memoryId);
        if (!existing) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        if (existing.state !== 'active') {
            return errOp('invalid_input', 'Only active memory can be superseded.');
        }

        const superseded = await memoryStore.supersede({
            profileId: input.profileId,
            previousMemoryId: input.memoryId,
            replacement: {
                profileId: input.profileId,
                memoryType: existing.memoryType,
                scopeKind: existing.scopeKind,
                createdByKind: input.createdByKind,
                title: input.title,
                bodyMarkdown: input.bodyMarkdown,
                ...(input.summaryText ? { summaryText: input.summaryText } : {}),
                ...(input.metadata ? { metadata: input.metadata } : {}),
                ...(existing.workspaceFingerprint ? { workspaceFingerprint: existing.workspaceFingerprint } : {}),
                ...(existing.threadId ? { threadId: existing.threadId } : {}),
                ...(existing.runId ? { runId: existing.runId } : {}),
            },
        });

        if (!superseded) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        await this.refreshDerivedIndex(
            input.profileId,
            [superseded.previous.id, superseded.replacement.id],
            'supersede_memory'
        );

        return okOp(superseded);
    }
}

export const memoryService = new MemoryService();
