import { getPersistence } from '@/app/backend/persistence/db';
import { memoryEvidenceStore, memoryRevisionStore, memoryStore, threadStore } from '@/app/backend/persistence/stores';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import type { MemoryRecord } from '@/app/backend/persistence/types';
import type {
    EntityId,
    MemoryApplyPromotionInput,
    MemoryApplyReviewActionInput,
    MemoryApplyReviewActionResult,
    MemoryApplyPromotionResult,
    MemoryCreateInput,
    MemoryDisableInput,
    MemoryListInput,
    MemoryPreparePromotionInput,
    MemoryPreparePromotionResult,
    MemoryReviewDetailsInput,
    MemoryReviewDetailsResult,
    MemoryRetentionClass,
    MemoryRecord as RuntimeMemoryRecord,
    MemoryEvidenceCreateInput,
    MemoryPromotionDraft,
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
import {
    createPromotionProvenance,
    extractPromotionSource,
    normalizePromotionBodyMarkdown,
    type ExtractedPromotionSource,
} from '@/app/backend/runtime/services/promotion/promotionSourceExtractor';

const memoryPromotionExcerptLimit = 1_200;

function firstSentenceSummary(value: string): string | undefined {
    const normalized = value.replace(/\s+/g, ' ').trim();
    if (normalized.length === 0) {
        return undefined;
    }
    return normalized.length <= 180 ? normalized : `${normalized.slice(0, 177).trimEnd()}...`;
}

function defaultPromotionTitle(sourceLabel: string): string {
    return `Memory from ${sourceLabel}`;
}

function truncateEvidenceExcerpt(value: string): string {
    return value.length <= memoryPromotionExcerptLimit ? value : `${value.slice(0, memoryPromotionExcerptLimit)}...`;
}

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

    private async buildReviewDetails(
        profileId: string,
        memory: MemoryRecord
    ): Promise<MemoryReviewDetailsResult> {
        const revisions = await memoryRevisionStore.listByMemoryIds(profileId, [memory.id]);
        const revisionMemoryIds = revisions.flatMap((revision) => [
            revision.previousMemoryId,
            revision.replacementMemoryId,
        ]);
        const evidenceMemoryIds = Array.from(new Set([memory.id, ...revisionMemoryIds]));
        const evidence = await memoryEvidenceStore.listByMemoryIds(profileId, evidenceMemoryIds);

        return {
            memory,
            evidence,
            revisions,
        };
    }

    async getReviewDetails(input: MemoryReviewDetailsInput): Promise<OperationalResult<MemoryReviewDetailsResult>> {
        const memory = await memoryStore.getById(input.profileId, input.memoryId);
        if (!memory) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }

        return okOp(await this.buildReviewDetails(input.profileId, memory));
    }

    private validateReviewTarget(input: {
        memory: MemoryRecord;
        expectedUpdatedAt: string;
        actionLabel: string;
    }): OperationalResult<MemoryRecord> {
        if (input.memory.updatedAt !== input.expectedUpdatedAt) {
            return errOp(
                'invalid_input',
                `Memory changed after review opened. Reopen review before applying ${input.actionLabel}.`
            );
        }
        if (input.memory.state !== 'active') {
            return errOp('invalid_input', `Only active memory can be ${input.actionLabel}.`);
        }
        return okOp(input.memory);
    }

    async applyReviewAction(
        input: MemoryApplyReviewActionInput
    ): Promise<OperationalResult<MemoryApplyReviewActionResult>> {
        const existing = await memoryStore.getById(input.profileId, input.memoryId);
        if (!existing) {
            return errOp('not_found', `Memory "${input.memoryId}" was not found.`);
        }

        const validated = this.validateReviewTarget({
            memory: existing,
            expectedUpdatedAt: input.expectedUpdatedAt,
            actionLabel: input.action === 'forget' ? 'forgotten' : `${input.action}d`,
        });
        if (validated.isErr()) {
            return errOp(validated.error.code, validated.error.message);
        }

        if (input.action === 'forget') {
            const disabled = await this.disableMemory({
                profileId: input.profileId,
                memoryId: input.memoryId,
            });
            if (disabled.isErr()) {
                return errOp(disabled.error.code, disabled.error.message);
            }
            const details = await this.buildReviewDetails(input.profileId, disabled.value);
            return okOp({
                action: 'forget',
                ...details,
            });
        }

        const title = input.title.trim();
        if (title.length === 0) {
            return errOp('invalid_input', 'Memory title cannot be empty.');
        }
        if (input.bodyMarkdown.trim().length === 0) {
            return errOp('invalid_input', 'Memory body cannot be empty.');
        }

        if (input.action === 'update') {
            const updated = await this.updateMemory({
                profileId: input.profileId,
                memoryId: input.memoryId,
                title,
                ...(input.canonicalBody ? { canonicalBody: input.canonicalBody } : {}),
                bodyMarkdown: input.bodyMarkdown,
                ...(input.summaryText ? { summaryText: input.summaryText } : {}),
                metadata: existing.metadata,
            });
            if (updated.isErr()) {
                return errOp(updated.error.code, updated.error.message, {
                    ...(updated.error.details ? { details: updated.error.details } : {}),
                });
            }
            const details = await this.buildReviewDetails(input.profileId, updated.value);
            return okOp({
                action: 'update',
                ...details,
            });
        }

        const superseded = await this.supersedeMemory({
            profileId: input.profileId,
            memoryId: input.memoryId,
            createdByKind: 'user',
            title,
            ...(input.canonicalBody ? { canonicalBody: input.canonicalBody } : {}),
            bodyMarkdown: input.bodyMarkdown,
            ...(input.summaryText ? { summaryText: input.summaryText } : {}),
            metadata: existing.metadata,
            revisionReason: input.revisionReason,
        });
        if (superseded.isErr()) {
            return errOp(superseded.error.code, superseded.error.message, {
                ...(superseded.error.details ? { details: superseded.error.details } : {}),
            });
        }
        const details = await this.buildReviewDetails(input.profileId, superseded.value.replacement);
        return okOp({
            action: 'supersede',
            ...details,
            previousMemory: superseded.value.previous,
        });
    }

    private async resolvePromotionScope(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        workspaceFingerprint?: string;
    }): Promise<Pick<MemoryPromotionDraft, 'scopeKind' | 'workspaceFingerprint' | 'threadId'>> {
        const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
        if (sessionThread) {
            return {
                scopeKind: 'thread',
                threadId: parseEntityId(sessionThread.thread.id, 'threads.id', 'thr'),
                ...(sessionThread.workspaceFingerprint ? { workspaceFingerprint: sessionThread.workspaceFingerprint } : {}),
            };
        }
        if (input.workspaceFingerprint) {
            return {
                scopeKind: 'workspace',
                workspaceFingerprint: input.workspaceFingerprint,
            };
        }
        return { scopeKind: 'global' };
    }

    private buildPromotionDraft(input: {
        extracted: ExtractedPromotionSource;
        scope: Pick<MemoryPromotionDraft, 'scopeKind' | 'workspaceFingerprint' | 'threadId'>;
    }): MemoryPromotionDraft {
        const summaryText = firstSentenceSummary(input.extracted.sourceText);
        const draft: MemoryPromotionDraft = {
            target: 'memory',
            memoryType: 'semantic',
            scopeKind: input.scope.scopeKind,
            title: defaultPromotionTitle(input.extracted.sourceLabel),
            bodyMarkdown: input.extracted.sourceText,
            memoryRetentionClass: input.scope.scopeKind === 'global' ? 'profile' : 'task',
            ...(summaryText ? { summaryText } : {}),
            ...(input.scope.workspaceFingerprint ? { workspaceFingerprint: input.scope.workspaceFingerprint } : {}),
            ...(input.scope.threadId ? { threadId: input.scope.threadId } : {}),
        };
        return draft;
    }

    async preparePromotion(input: MemoryPreparePromotionInput): Promise<OperationalResult<MemoryPreparePromotionResult>> {
        const extractedResult = await extractPromotionSource(input);
        if (extractedResult.isErr()) {
            return errOp(extractedResult.error.code, extractedResult.error.message, {
                ...(extractedResult.error.details ? { details: extractedResult.error.details } : {}),
            });
        }

        const extracted = extractedResult.value;
        const scope = await this.resolvePromotionScope({
            profileId: input.profileId,
            sessionId: input.source.sessionId,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
        });
        const provenance = createPromotionProvenance(extracted);

        return okOp({
            source: {
                kind: extracted.source.kind,
                label: extracted.sourceLabel,
                digest: extracted.sourceDigest,
                lineCount: extracted.lineCount,
            },
            draft: this.buildPromotionDraft({ extracted, scope }),
            provenance,
        });
    }

    private buildPromotionEvidence(input: {
        extracted: ExtractedPromotionSource;
        bodyMarkdown: string;
    }): MemoryEvidenceCreateInput {
        const metadata: Record<string, unknown> = {
            sourceKind: input.extracted.source.kind,
            sourceDigest: input.extracted.sourceDigest,
        };
        if (input.extracted.source.kind === 'tool_result_artifact_window') {
            metadata.startLine = input.extracted.source.startLine;
            metadata.lineCount = input.extracted.source.lineCount;
        }

        return {
            kind: input.extracted.source.kind === 'message' ? 'message' : 'tool_result_artifact',
            label: input.extracted.sourceLabel,
            excerptText: truncateEvidenceExcerpt(input.bodyMarkdown),
            ...(input.extracted.sourceRunId ? { sourceRunId: input.extracted.sourceRunId } : {}),
            ...(input.extracted.source.kind === 'message'
                ? { sourceMessageId: input.extracted.source.messageId }
                : { sourceMessagePartId: input.extracted.source.messagePartId }),
            metadata,
        };
    }

    async applyPromotion(input: MemoryApplyPromotionInput): Promise<OperationalResult<MemoryApplyPromotionResult>> {
        const extractedResult = await extractPromotionSource({
            profileId: input.profileId,
            source: input.source,
        });
        if (extractedResult.isErr()) {
            return errOp(extractedResult.error.code, extractedResult.error.message);
        }
        const extracted = extractedResult.value;
        if (input.sourceDigest !== extracted.sourceDigest) {
            return errOp(
                'invalid_input',
                'The promotion source changed after review. Reopen promotion review before applying.'
            );
        }
        const bodyMarkdown = normalizePromotionBodyMarkdown(input.draft.bodyMarkdown);
        if (bodyMarkdown.length === 0) {
            return errOp('invalid_input', 'Promoted memory body cannot be empty.');
        }
        const title = input.draft.title.trim();
        if (title.length === 0) {
            return errOp('invalid_input', 'Promoted memory title cannot be empty.');
        }
        const provenance = createPromotionProvenance(extracted);
        const createResult = await this.createMemory({
            profileId: input.profileId,
            memoryType: input.draft.memoryType,
            scopeKind: input.draft.scopeKind,
            createdByKind: 'user',
            title,
            bodyMarkdown,
            ...(input.draft.summaryText ? { summaryText: input.draft.summaryText } : {}),
            metadata: {
                ...(input.draft.metadata ?? {}),
                source: 'promotion',
                promotion: provenance,
            },
            ...(input.draft.memoryRetentionClass ? { memoryRetentionClass: input.draft.memoryRetentionClass } : {}),
            ...(input.draft.retentionExpiresAt ? { retentionExpiresAt: input.draft.retentionExpiresAt } : {}),
            ...(input.draft.retentionPinnedAt ? { retentionPinnedAt: input.draft.retentionPinnedAt } : {}),
            ...(input.draft.workspaceFingerprint ? { workspaceFingerprint: input.draft.workspaceFingerprint } : {}),
            ...(input.draft.threadId ? { threadId: input.draft.threadId } : {}),
            evidence: [this.buildPromotionEvidence({ extracted, bodyMarkdown })],
        });
        if (createResult.isErr()) {
            return errOp(createResult.error.code, createResult.error.message, {
                ...(createResult.error.details ? { details: createResult.error.details } : {}),
            });
        }

        return okOp({
            promoted: {
                target: 'memory',
                memoryId: createResult.value.id,
                title: createResult.value.title,
                memoryType: createResult.value.memoryType,
                scopeKind: createResult.value.scopeKind,
            },
            memory: createResult.value,
        });
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
