import { getPersistence } from '@/app/backend/persistence/db';
import { memoryEvidenceStore, memoryStore } from '@/app/backend/persistence/stores';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
    MemoryCreateInput,
    MemoryDisableInput,
    MemoryListInput,
    MemoryRetentionClass,
    MemoryRecord as RuntimeMemoryRecord,
    MemorySupersedeInput,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import { isAutomaticRunOutcomeMemory } from '@/app/backend/runtime/services/memory/automaticRunMemoryLifecycle';
import {
    renderMemoryCanonicalBodyMarkdown,
    resolveMemoryCanonicalBody,
} from '@/app/backend/runtime/services/memory/memoryCanonicalBody';
import { resolveCanonicalMemoryProvenance } from '@/app/backend/runtime/services/memory/memoryProvenancePolicy';
import {
    defaultRetentionSupersedenceRationale,
    resolveMemoryRetention,
    resolveReplacementMemoryRetention,
    type ResolvedMemoryRetention,
} from '@/app/backend/runtime/services/memory/memoryRetentionPolicy';
import { memorySemanticIndexService } from '@/app/backend/runtime/services/memory/memorySemanticIndexService';

class MemoryService {
    private async refreshDerivedIndex(profileId: string, memoryIds: EntityId<'mem'>[], reason: string): Promise<void> {
        await advancedMemoryDerivationService.refreshMemoryIdsSafely({
            profileId,
            memoryIds,
            reason,
        });
    }

    private async refreshSemanticIndex(profileId: string, memoryIds: EntityId<'mem'>[], reason: string): Promise<void> {
        await memorySemanticIndexService.refreshMemoryIdsSafely({
            profileId,
            memoryIds,
            reason,
        });
    }

    async listMemories(input: MemoryListInput): Promise<MemoryRecord[]> {
        return memoryStore.listByProfile(input);
    }

    private resolveRetentionOrError(input: {
        scopeKind: RuntimeMemoryRecord['scopeKind'];
        createdByKind: RuntimeMemoryRecord['createdByKind'];
        memoryRetentionClass?: MemoryRetentionClass;
        retentionExpiresAt?: string;
        retentionPinnedAt?: string;
    }): OperationalResult<ResolvedMemoryRetention> {
        try {
            return okOp(resolveMemoryRetention(input));
        } catch (error) {
            return errOp('invalid_input', error instanceof Error ? error.message : 'Invalid memory retention policy.');
        }
    }

    async createMemory(input: MemoryCreateInput): Promise<OperationalResult<MemoryRecord>> {
        const resolvedProvenance = await resolveCanonicalMemoryProvenance(input);
        if (resolvedProvenance.isErr()) {
            return errOp(resolvedProvenance.error.code, resolvedProvenance.error.message, {
                ...(resolvedProvenance.error.details ? { details: resolvedProvenance.error.details } : {}),
                ...(resolvedProvenance.error.retryable !== undefined
                    ? { retryable: resolvedProvenance.error.retryable }
                    : {}),
            });
        }
        const resolvedRetention = this.resolveRetentionOrError(input);
        if (resolvedRetention.isErr()) {
            return errOp(resolvedRetention.error.code, resolvedRetention.error.message);
        }

        const createdMemory = await getPersistence().db.transaction().execute(async (transaction) => {
            const created = await memoryStore.createInTransaction(transaction, {
                ...(() => {
                    const canonicalBody = resolveMemoryCanonicalBody(input);
                    return {
                        canonicalBody,
                        bodyMarkdownProjection: renderMemoryCanonicalBodyMarkdown(canonicalBody),
                    };
                })(),
                profileId: input.profileId,
                memoryType: input.memoryType,
                scopeKind: input.scopeKind,
                createdByKind: input.createdByKind,
                title: input.title,
                ...resolvedRetention.value,
                ...(input.summaryText ? { summaryText: input.summaryText } : {}),
                ...(input.metadata ? { metadata: input.metadata } : {}),
                ...(input.temporalSubjectKey ? { temporalSubjectKey: input.temporalSubjectKey } : {}),
                ...resolvedProvenance.value,
            });

            if (input.evidence && input.evidence.length > 0) {
                await memoryEvidenceStore.createManyInTransaction(transaction, {
                    profileId: input.profileId,
                    memoryId: created.id,
                    evidence: input.evidence,
                });
            }

            return created;
        });
        await this.refreshDerivedIndex(input.profileId, [createdMemory.id], 'create_memory');
        await this.refreshSemanticIndex(input.profileId, [createdMemory.id], 'create_memory');

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
        await this.refreshSemanticIndex(input.profileId, [disabled.id], 'disable_memory');

        return okOp(disabled);
    }

    async updateMemory(input: {
        profileId: string;
        memoryId: EntityId<'mem'>;
        title: string;
        canonicalBody?: RuntimeMemoryRecord['canonicalBody'];
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

        const canonicalBody = resolveMemoryCanonicalBody(input);
        const updated = await memoryStore.updateEditableFields({
            ...input,
            canonicalBody,
            bodyMarkdownProjection: renderMemoryCanonicalBodyMarkdown(canonicalBody),
        });
        if (!updated) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        await this.refreshDerivedIndex(input.profileId, [updated.id], 'update_memory');
        await this.refreshSemanticIndex(input.profileId, [updated.id], 'update_memory');

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
        if (input.revisionReason === 'runtime_refresh') {
            const isValidRuntimeRefresh = input.createdByKind === 'system' && isAutomaticRunOutcomeMemory(existing);
            if (!isValidRuntimeRefresh) {
                return errOp(
                    'invalid_input',
                    'Runtime refresh revisions are only valid for automatic run-outcome memories.'
                );
            }
        }
        const previousRetention: ResolvedMemoryRetention = {
            memoryRetentionClass: existing.memoryRetentionClass,
            ...(existing.retentionExpiresAt ? { retentionExpiresAt: existing.retentionExpiresAt } : {}),
            ...(existing.retentionPinnedAt ? { retentionPinnedAt: existing.retentionPinnedAt } : {}),
        };
        let replacementRetention: ResolvedMemoryRetention;
        try {
            replacementRetention = resolveReplacementMemoryRetention({
                previous: previousRetention,
                scopeKind: existing.scopeKind,
                createdByKind: input.createdByKind,
                ...(input.memoryRetentionClass ? { memoryRetentionClass: input.memoryRetentionClass } : {}),
                ...(input.retentionExpiresAt ? { retentionExpiresAt: input.retentionExpiresAt } : {}),
                ...(input.retentionPinnedAt ? { retentionPinnedAt: input.retentionPinnedAt } : {}),
            });
        } catch (error) {
            return errOp('invalid_input', error instanceof Error ? error.message : 'Invalid memory retention policy.');
        }

        const superseded = await getPersistence().db.transaction().execute(async (transaction) => {
            const result = await memoryStore.supersedeInTransaction(transaction, {
                profileId: input.profileId,
                previousMemoryId: input.memoryId,
                revisionReason: input.revisionReason,
                retentionSupersedenceRationale:
                    input.retentionSupersedenceRationale ??
                    defaultRetentionSupersedenceRationale(input.revisionReason),
                replacement: {
                    ...(() => {
                        const canonicalBody = resolveMemoryCanonicalBody(input);
                        return {
                            canonicalBody,
                            bodyMarkdownProjection: renderMemoryCanonicalBodyMarkdown(canonicalBody),
                        };
                    })(),
                    profileId: input.profileId,
                    memoryType: existing.memoryType,
                    scopeKind: existing.scopeKind,
                    createdByKind: input.createdByKind,
                    title: input.title,
                    ...replacementRetention,
                    ...(input.summaryText ? { summaryText: input.summaryText } : {}),
                    ...(input.metadata ? { metadata: input.metadata } : {}),
                    ...(existing.workspaceFingerprint ? { workspaceFingerprint: existing.workspaceFingerprint } : {}),
                    ...(existing.threadId ? { threadId: existing.threadId } : {}),
                    ...(existing.runId ? { runId: existing.runId } : {}),
                    ...(existing.temporalSubjectKey ? { temporalSubjectKey: existing.temporalSubjectKey } : {}),
                },
            });

            if (result && input.evidence && input.evidence.length > 0) {
                await memoryEvidenceStore.createManyInTransaction(transaction, {
                    profileId: input.profileId,
                    memoryId: result.replacement.id,
                    evidence: input.evidence,
                });
            }

            return result;
        });

        if (!superseded) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }
        await this.refreshDerivedIndex(
            input.profileId,
            [superseded.previous.id, superseded.replacement.id],
            'supersede_memory'
        );
        await this.refreshSemanticIndex(
            input.profileId,
            [superseded.previous.id, superseded.replacement.id],
            'supersede_memory'
        );

        return okOp(superseded);
    }
}

export const memoryService = new MemoryService();
