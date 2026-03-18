import { memoryDerivedStore, memoryStore } from '@/app/backend/persistence/stores';
import type {
    MemoryCausalLinkRecord,
    MemoryDerivedSummary,
    MemoryRecord,
    MemoryTemporalFactRecord,
} from '@/app/backend/persistence/types';
import type {
    EntityId,
    MemoryCausalRelationType,
    MemoryRecord as RuntimeMemoryRecord,
    RetrievedMemoryMatchReason,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { appLog } from '@/app/main/logging';

const DERIVATION_VERSION = 1;
const HISTORY_PROMPT_TERMS = ['before', 'change', 'changed', 'earlier', 'history', 'old', 'older', 'previous', 'prior'];
const CAUSAL_PROMPT_TERMS = ['because', 'cause', 'caused', 'origin', 'reason', 'why'];

interface DerivedCandidate {
    memory: MemoryRecord;
    matchReason: Extract<RetrievedMemoryMatchReason, 'derived_temporal' | 'derived_causal'>;
    sourceMemoryId: EntityId<'mem'>;
    annotations: string[];
}

function normalizeSearchText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeSubjectSegment(value: string): string {
    const normalized = normalizeSearchText(value).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized.length > 0 ? normalized : 'memory';
}

function extractSourceRunId(memory: RuntimeMemoryRecord): EntityId<'run'> | undefined {
    if (memory.runId) {
        return memory.runId;
    }

    const metadataRunId = memory.metadata['runId'];
    return typeof metadataRunId === 'string' && metadataRunId.startsWith('run_')
        ? (metadataRunId as EntityId<'run'>)
        : undefined;
}

function buildSubjectKey(memory: RuntimeMemoryRecord): string {
    const provenanceKey =
        memory.runId ??
        memory.threadId ??
        memory.workspaceFingerprint ??
        'global';

    return [
        memory.memoryType,
        memory.scopeKind,
        provenanceKey,
        normalizeSubjectSegment(memory.title),
    ].join('::');
}

function toTemporalStatus(memory: RuntimeMemoryRecord): MemoryTemporalFactRecord['status'] {
    switch (memory.state) {
        case 'active':
            return 'current';
        case 'disabled':
            return 'disabled';
        case 'superseded':
            return 'superseded';
    }
}

function readPromptIntent(prompt: string): { wantsHistory: boolean; wantsCause: boolean } {
    const normalizedPrompt = normalizeSearchText(prompt);
    return {
        wantsHistory: HISTORY_PROMPT_TERMS.some((term) => normalizedPrompt.includes(term)),
        wantsCause: CAUSAL_PROMPT_TERMS.some((term) => normalizedPrompt.includes(term)),
    };
}

function dedupeEntityIds<T extends string>(values: T[]): T[] {
    return Array.from(new Set(values));
}

function mapDerivedSummary(input: {
    memoryId: EntityId<'mem'>;
    factsByMemoryId: Map<string, MemoryTemporalFactRecord>;
    outgoingLinksByMemoryId: Map<string, MemoryCausalLinkRecord[]>;
    incomingSupersedeLinksByTargetMemoryId: Map<string, MemoryCausalLinkRecord[]>;
}): MemoryDerivedSummary {
    const temporalFact = input.factsByMemoryId.get(input.memoryId);
    const outgoingLinks = input.outgoingLinksByMemoryId.get(input.memoryId) ?? [];
    const incomingSupersedeLinks = input.incomingSupersedeLinksByTargetMemoryId.get(input.memoryId) ?? [];

    const successorLink = outgoingLinks.find(
        (link) => link.relationType === 'supersedes' && link.targetEntityKind === 'memory'
    );

    return {
        ...(temporalFact ? { temporalStatus: temporalFact.status } : {}),
        hasTemporalHistory: incomingSupersedeLinks.length > 0 || Boolean(successorLink),
        predecessorMemoryIds: dedupeEntityIds(
            incomingSupersedeLinks
                .filter((link) => link.sourceEntityKind === 'memory')
                .map((link) => link.sourceEntityId as EntityId<'mem'>)
        ),
        ...(successorLink ? { successorMemoryId: successorLink.targetEntityId as EntityId<'mem'> } : {}),
        linkedRunIds: dedupeEntityIds(
            outgoingLinks
                .filter((link) => link.relationType === 'observed_in_run' && link.targetEntityKind === 'run')
                .map((link) => link.targetEntityId as EntityId<'run'>)
        ),
        linkedThreadIds: dedupeEntityIds(
            outgoingLinks
                .filter((link) => link.relationType === 'observed_in_thread' && link.targetEntityKind === 'thread')
                .map((link) => link.targetEntityId as EntityId<'thr'>)
        ),
        linkedWorkspaceFingerprints: dedupeEntityIds(
            outgoingLinks
                .filter(
                    (link) => link.relationType === 'observed_in_workspace' && link.targetEntityKind === 'workspace'
                )
                .map((link) => link.targetEntityId)
        ),
    };
}

export class AdvancedMemoryDerivationService {
    private async buildDerivedArtifacts(memory: RuntimeMemoryRecord): Promise<{
        temporalFact: {
            profileId: string;
            subjectKey: string;
            factKind: RuntimeMemoryRecord['memoryType'];
            value: Record<string, unknown>;
            status: MemoryTemporalFactRecord['status'];
            validFrom: string;
            validTo?: string;
            sourceMemoryId: EntityId<'mem'>;
            sourceRunId?: EntityId<'run'>;
            derivationVersion: number;
            confidence: number;
        };
        causalLinks: Array<{
            profileId: string;
            sourceEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
            sourceEntityId: string;
            targetEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
            targetEntityId: string;
            relationType: MemoryCausalRelationType;
            sourceMemoryId: EntityId<'mem'>;
            sourceRunId?: EntityId<'run'>;
        }>;
    }> {
        const successorMemory =
            memory.supersededByMemoryId
                ? await memoryStore.getById(memory.profileId, memory.supersededByMemoryId)
                : null;
        const sourceRunId = extractSourceRunId(memory);
        const causalLinks: Array<{
            profileId: string;
            sourceEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
            sourceEntityId: string;
            targetEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
            targetEntityId: string;
            relationType: MemoryCausalRelationType;
            sourceMemoryId: EntityId<'mem'>;
            sourceRunId?: EntityId<'run'>;
        }> = [];

        if (memory.supersededByMemoryId) {
            causalLinks.push({
                profileId: memory.profileId,
                sourceEntityKind: 'memory',
                sourceEntityId: memory.id,
                targetEntityKind: 'memory',
                targetEntityId: memory.supersededByMemoryId,
                relationType: 'supersedes',
                sourceMemoryId: memory.id,
                ...(sourceRunId ? { sourceRunId } : {}),
            });
        }
        if (sourceRunId) {
            causalLinks.push({
                profileId: memory.profileId,
                sourceEntityKind: 'memory',
                sourceEntityId: memory.id,
                targetEntityKind: 'run',
                targetEntityId: sourceRunId,
                relationType: 'observed_in_run',
                sourceMemoryId: memory.id,
                sourceRunId,
            });
        }
        if (memory.threadId) {
            causalLinks.push({
                profileId: memory.profileId,
                sourceEntityKind: 'memory',
                sourceEntityId: memory.id,
                targetEntityKind: 'thread',
                targetEntityId: memory.threadId,
                relationType: 'observed_in_thread',
                sourceMemoryId: memory.id,
                ...(sourceRunId ? { sourceRunId } : {}),
            });
        }
        if (memory.workspaceFingerprint) {
            causalLinks.push({
                profileId: memory.profileId,
                sourceEntityKind: 'memory',
                sourceEntityId: memory.id,
                targetEntityKind: 'workspace',
                targetEntityId: memory.workspaceFingerprint,
                relationType: 'observed_in_workspace',
                sourceMemoryId: memory.id,
                ...(sourceRunId ? { sourceRunId } : {}),
            });
        }

        return {
            temporalFact: {
                profileId: memory.profileId,
                subjectKey: buildSubjectKey(memory),
                factKind: memory.memoryType,
                value: {
                    title: memory.title,
                    summaryText: memory.summaryText ?? null,
                    bodyMarkdown: memory.bodyMarkdown,
                    scopeKind: memory.scopeKind,
                    createdByKind: memory.createdByKind,
                    ...(successorMemory ? { successorMemoryId: successorMemory.id } : {}),
                },
                status: toTemporalStatus(memory),
                validFrom: memory.createdAt,
                ...(memory.state === 'active'
                    ? {}
                    : {
                          validTo:
                              successorMemory?.createdAt ??
                              memory.updatedAt,
                      }),
                sourceMemoryId: memory.id,
                ...(sourceRunId ? { sourceRunId } : {}),
                derivationVersion: DERIVATION_VERSION,
                confidence: 1,
            },
            causalLinks,
        };
    }

    async refreshMemoryById(profileId: string, memoryId: EntityId<'mem'>): Promise<OperationalResult<void>> {
        const memory = await memoryStore.getById(profileId, memoryId);
        if (!memory) {
            return okOp(undefined);
        }

        const derivedArtifacts = await this.buildDerivedArtifacts(memory);
        await memoryDerivedStore.replaceForMemory({
            profileId,
            sourceMemoryId: memory.id,
            temporalFact: derivedArtifacts.temporalFact,
            causalLinks: derivedArtifacts.causalLinks,
        });

        return okOp(undefined);
    }

    async refreshMemoryIds(profileId: string, memoryIds: EntityId<'mem'>[]): Promise<OperationalResult<void>> {
        for (const memoryId of dedupeEntityIds(memoryIds)) {
            const refreshed = await this.refreshMemoryById(profileId, memoryId);
            if (refreshed.isErr()) {
                return refreshed;
            }
        }

        return okOp(undefined);
    }

    async rebuildProfile(profileId: string): Promise<OperationalResult<{ memoryCount: number }>> {
        const memories = await memoryStore.listByProfile({ profileId });
        const temporalFacts: Array<{
            profileId: string;
            subjectKey: string;
            factKind: RuntimeMemoryRecord['memoryType'];
            value: Record<string, unknown>;
            status: MemoryTemporalFactRecord['status'];
            validFrom: string;
            validTo?: string;
            sourceMemoryId: EntityId<'mem'>;
            sourceRunId?: EntityId<'run'>;
            derivationVersion: number;
            confidence: number;
        }> = [];
        const causalLinks: Array<{
            profileId: string;
            sourceEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
            sourceEntityId: string;
            targetEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
            targetEntityId: string;
            relationType: MemoryCausalRelationType;
            sourceMemoryId: EntityId<'mem'>;
            sourceRunId?: EntityId<'run'>;
        }> = [];

        for (const memory of memories) {
            const derivedArtifacts = await this.buildDerivedArtifacts(memory);
            temporalFacts.push(derivedArtifacts.temporalFact);
            causalLinks.push(...derivedArtifacts.causalLinks);
        }

        await memoryDerivedStore.rebuildProfile({
            profileId,
            temporalFacts,
            causalLinks,
        });

        return okOp({ memoryCount: memories.length });
    }

    async getDerivedSummaries(
        profileId: string,
        memoryIds: EntityId<'mem'>[]
    ): Promise<OperationalResult<Map<string, MemoryDerivedSummary>>> {
        const uniqueMemoryIds = dedupeEntityIds(memoryIds);
        if (uniqueMemoryIds.length === 0) {
            return okOp(new Map());
        }

        const [facts, outgoingLinks, incomingSupersedeLinks] = await Promise.all([
            memoryDerivedStore.listTemporalFactsBySourceMemoryIds(profileId, uniqueMemoryIds),
            memoryDerivedStore.listCausalLinksBySourceMemoryIds(profileId, uniqueMemoryIds),
            memoryDerivedStore.listCausalLinksByTargetEntities({
                profileId,
                targetEntityKind: 'memory',
                targetEntityIds: uniqueMemoryIds,
                relationTypes: ['supersedes'],
            }),
        ]);

        const factsByMemoryId = new Map(facts.map((fact) => [fact.sourceMemoryId, fact] as const));
        const outgoingLinksByMemoryId = new Map<string, MemoryCausalLinkRecord[]>();
        for (const link of outgoingLinks) {
            const existing = outgoingLinksByMemoryId.get(link.sourceMemoryId) ?? [];
            existing.push(link);
            outgoingLinksByMemoryId.set(link.sourceMemoryId, existing);
        }
        const incomingSupersedeLinksByTargetMemoryId = new Map<string, MemoryCausalLinkRecord[]>();
        for (const link of incomingSupersedeLinks) {
            const existing = incomingSupersedeLinksByTargetMemoryId.get(link.targetEntityId) ?? [];
            existing.push(link);
            incomingSupersedeLinksByTargetMemoryId.set(link.targetEntityId, existing);
        }

        return okOp(
            new Map(
                uniqueMemoryIds.map((memoryId) => [
                    memoryId,
                    mapDerivedSummary({
                        memoryId,
                        factsByMemoryId,
                        outgoingLinksByMemoryId,
                        incomingSupersedeLinksByTargetMemoryId,
                    }),
                ])
            )
        );
    }

    async expandMatchedMemories(input: {
        profileId: string;
        prompt: string;
        matchedMemories: MemoryRecord[];
    }): Promise<OperationalResult<{ candidates: DerivedCandidate[]; summaries: Map<string, MemoryDerivedSummary> }>> {
        const matchedMemoryIds = dedupeEntityIds(input.matchedMemories.map((memory) => memory.id));
        const summariesResult = await this.getDerivedSummaries(input.profileId, matchedMemoryIds);
        if (summariesResult.isErr()) {
            return errOp(summariesResult.error.code, summariesResult.error.message, {
                ...(summariesResult.error.details ? { details: summariesResult.error.details } : {}),
                ...(summariesResult.error.retryable !== undefined
                    ? { retryable: summariesResult.error.retryable }
                    : {}),
            });
        }

        const promptIntent = readPromptIntent(input.prompt);
        if (!promptIntent.wantsHistory && !promptIntent.wantsCause) {
            return okOp({
                candidates: [],
                summaries: summariesResult.value,
            });
        }

        const candidates: DerivedCandidate[] = [];
        const candidateIds = new Set<string>();

        if (promptIntent.wantsHistory) {
            const predecessorLinks = await memoryDerivedStore.listCausalLinksByTargetEntities({
                profileId: input.profileId,
                targetEntityKind: 'memory',
                targetEntityIds: matchedMemoryIds,
                relationTypes: ['supersedes'],
            });
            const predecessorIds = dedupeEntityIds(
                predecessorLinks
                    .filter((link) => link.sourceEntityKind === 'memory')
                    .map((link) => link.sourceEntityId as EntityId<'mem'>)
            );
            for (const predecessorId of predecessorIds) {
                if (candidateIds.has(predecessorId)) {
                    continue;
                }
                const predecessorMemory = await memoryStore.getById(input.profileId, predecessorId);
                if (!predecessorMemory) {
                    continue;
                }

                const successorLink = predecessorLinks.find((link) => link.sourceEntityId === predecessorId);
                candidates.push({
                    memory: predecessorMemory,
                    matchReason: 'derived_temporal',
                    sourceMemoryId:
                        (successorLink?.targetEntityId as EntityId<'mem'> | undefined) ??
                        predecessorMemory.id,
                    annotations: ['Prior truth from temporal memory history.'],
                });
                candidateIds.add(predecessorId);
            }
        }

        if (promptIntent.wantsCause) {
            const linkedRunIds = dedupeEntityIds(
                Array.from(summariesResult.value.values()).flatMap((summary) => summary.linkedRunIds)
            );
            if (linkedRunIds.length > 0) {
                const activeRunMemories = await memoryStore.listByProfile({
                    profileId: input.profileId,
                    memoryType: 'episodic',
                    scopeKind: 'run',
                    state: 'active',
                });
                for (const runMemory of activeRunMemories) {
                    if (!runMemory.runId || !linkedRunIds.includes(runMemory.runId) || candidateIds.has(runMemory.id)) {
                        continue;
                    }

                    const sourceMemory = input.matchedMemories.find((memory) =>
                        summariesResult.value.get(memory.id)?.linkedRunIds.includes(runMemory.runId!)
                    );
                    candidates.push({
                        memory: runMemory,
                        matchReason: 'derived_causal',
                        sourceMemoryId: sourceMemory?.id ?? runMemory.id,
                        annotations: ['Originating run memory linked by explicit provenance.'],
                    });
                    candidateIds.add(runMemory.id);
                }
            }
        }

        return okOp({
            candidates,
            summaries: summariesResult.value,
        });
    }

    async refreshMemoryIdsSafely(input: {
        profileId: string;
        memoryIds: EntityId<'mem'>[];
        reason: string;
    }): Promise<void> {
        const result = await this.refreshMemoryIds(input.profileId, input.memoryIds);
        if (result.isErr()) {
            appLog.warn({
                tag: 'memory-derived',
                message: 'Advanced memory derivation refresh failed without mutating canonical memory.',
                profileId: input.profileId,
                memoryIds: input.memoryIds,
                reason: input.reason,
                errorCode: result.error.code,
                errorMessage: result.error.message,
            });
        }
    }
}

export const advancedMemoryDerivationService = new AdvancedMemoryDerivationService();
