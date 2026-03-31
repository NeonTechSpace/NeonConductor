import {
    memoryDerivedStore,
    memoryEvidenceStore,
    memoryRetrievalUsageStore,
    memoryRevisionStore,
    memoryStore,
} from '@/app/backend/persistence/stores';
import type {
    MemoryCausalLinkRecord,
    MemoryDerivedSummary,
    MemoryEvidenceRecord,
    MemoryGraphEdgeRecord,
    MemoryRecord,
    MemoryRevisionRecord,
    MemoryTemporalFactRecord,
} from '@/app/backend/persistence/types';
import type {
    EntityId,
    MemoryCausalRelationType,
    MemoryGraphEdgeKind,
    MemoryRecord as RuntimeMemoryRecord,
    MemoryStrengthSummary,
    RetrievedMemoryMatchReason,
} from '@/app/backend/runtime/contracts';
import { errOp, okOp, type OperationalResult } from '@/app/backend/runtime/services/common/operationalError';
import { appLog } from '@/app/main/logging';

const DERIVATION_VERSION = 3;
const HISTORY_PROMPT_TERMS = ['before', 'change', 'changed', 'corrected', 'earlier', 'history', 'old', 'older', 'previous', 'prior', 'replaced'];
const CAUSAL_PROMPT_TERMS = ['because', 'cause', 'caused', 'origin', 'reason', 'why'];

interface DerivedCandidate {
    memory: MemoryRecord;
    matchReason: Extract<RetrievedMemoryMatchReason, 'derived_temporal' | 'derived_causal'>;
    sourceMemoryId: EntityId<'mem'>;
    annotations: string[];
}

interface TemporalResolutionMaps {
    subjectKeyByMemoryId: Map<EntityId<'mem'>, string>;
    temporalStatusByMemoryId: Map<EntityId<'mem'>, MemoryTemporalFactRecord['status']>;
    predecessorMemoryIdsByMemoryId: Map<EntityId<'mem'>, EntityId<'mem'>[]>;
    successorMemoryIdByMemoryId: Map<EntityId<'mem'>, EntityId<'mem'>>;
    incomingRevisionReasonByMemoryId: Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>;
    outgoingRevisionReasonByMemoryId: Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>;
    currentTruthMemoryIdByGroupKey: Map<string, EntityId<'mem'>>;
    conflictingCurrentMemoryIdsByGroupKey: Map<string, EntityId<'mem'>[]>;
}

interface TemporalFactInsert {
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
}

interface CausalLinkInsert {
    profileId: string;
    sourceEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
    sourceEntityId: string;
    targetEntityKind: 'memory' | 'run' | 'thread' | 'workspace';
    targetEntityId: string;
    relationType: MemoryCausalRelationType;
    sourceMemoryId: EntityId<'mem'>;
    sourceRunId?: EntityId<'run'>;
}

interface GraphEdgeInsert {
    profileId: string;
    sourceMemoryId: EntityId<'mem'>;
    targetMemoryId: EntityId<'mem'>;
    edgeKind: MemoryGraphEdgeKind;
    weight: number;
    derivationVersion: number;
}

function normalizeSearchText(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeSubjectSegment(value: string): string {
    const normalized = normalizeSearchText(value)
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    return normalized.length > 0 ? normalized : 'memory';
}

function dedupeEntityIds<T extends string>(values: T[]): T[] {
    return Array.from(new Set(values));
}

function clampScore(value: number): number {
    return Math.max(0, Math.min(1, Number(value.toFixed(3))));
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

function buildFallbackSubjectKey(memory: RuntimeMemoryRecord): string {
    const provenanceKey = memory.runId ?? memory.threadId ?? memory.workspaceFingerprint ?? 'global';
    return [memory.memoryType, memory.scopeKind, provenanceKey, normalizeSubjectSegment(memory.title)].join('::');
}

function resolveTemporalSubjectKey(memory: RuntimeMemoryRecord): string {
    return memory.temporalSubjectKey ?? buildFallbackSubjectKey(memory);
}

function buildTemporalGroupKey(memoryType: RuntimeMemoryRecord['memoryType'], temporalSubjectKey: string): string {
    return `${memoryType}::${temporalSubjectKey}`;
}

function toBaseTemporalStatus(memory: RuntimeMemoryRecord): Extract<MemoryTemporalFactRecord['status'], 'current' | 'superseded' | 'disabled'> {
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

function buildTemporalResolutionMaps(
    memories: RuntimeMemoryRecord[],
    revisionRecords: MemoryRevisionRecord[]
): TemporalResolutionMaps {
    const subjectKeyByMemoryId = new Map<EntityId<'mem'>, string>();
    const temporalStatusByMemoryId = new Map<EntityId<'mem'>, MemoryTemporalFactRecord['status']>();
    const predecessorMemoryIdsByMemoryId = new Map<EntityId<'mem'>, EntityId<'mem'>[]>();
    const successorMemoryIdByMemoryId = new Map<EntityId<'mem'>, EntityId<'mem'>>();
    const incomingRevisionReasonByMemoryId = new Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>();
    const outgoingRevisionReasonByMemoryId = new Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>();
    const currentTruthMemoryIdByGroupKey = new Map<string, EntityId<'mem'>>();
    const conflictingCurrentMemoryIdsByGroupKey = new Map<string, EntityId<'mem'>[]>();
    const memoriesByGroupKey = new Map<string, RuntimeMemoryRecord[]>();

    for (const revisionRecord of revisionRecords) {
        const existingPredecessors = predecessorMemoryIdsByMemoryId.get(revisionRecord.replacementMemoryId) ?? [];
        existingPredecessors.push(revisionRecord.previousMemoryId);
        predecessorMemoryIdsByMemoryId.set(
            revisionRecord.replacementMemoryId,
            dedupeEntityIds(existingPredecessors)
        );
        successorMemoryIdByMemoryId.set(revisionRecord.previousMemoryId, revisionRecord.replacementMemoryId);
        outgoingRevisionReasonByMemoryId.set(revisionRecord.previousMemoryId, revisionRecord.revisionReason);
        incomingRevisionReasonByMemoryId.set(revisionRecord.replacementMemoryId, revisionRecord.revisionReason);
    }

    for (const memory of memories) {
        const temporalSubjectKey = resolveTemporalSubjectKey(memory);
        subjectKeyByMemoryId.set(memory.id, temporalSubjectKey);
        const groupKey = buildTemporalGroupKey(memory.memoryType, temporalSubjectKey);
        memoriesByGroupKey.set(groupKey, [...(memoriesByGroupKey.get(groupKey) ?? []), memory]);
    }

    for (const [groupKey, groupedMemories] of memoriesByGroupKey.entries()) {
        const activeMemoryIds = groupedMemories.filter((memory) => memory.state === 'active').map((memory) => memory.id);
        const conflictsApply =
            groupedMemories[0] &&
            (groupedMemories[0].memoryType === 'semantic' || groupedMemories[0].memoryType === 'procedural');
        const conflictingCurrentMemoryIds = conflictsApply && activeMemoryIds.length > 1 ? activeMemoryIds : [];

        if (conflictingCurrentMemoryIds.length > 0) {
            conflictingCurrentMemoryIdsByGroupKey.set(groupKey, conflictingCurrentMemoryIds);
        } else if (activeMemoryIds.length === 1) {
            currentTruthMemoryIdByGroupKey.set(groupKey, activeMemoryIds[0]!);
        }

        for (const memory of groupedMemories) {
            temporalStatusByMemoryId.set(
                memory.id,
                conflictingCurrentMemoryIds.includes(memory.id) ? 'conflicted' : toBaseTemporalStatus(memory)
            );
        }
    }

    return {
        subjectKeyByMemoryId,
        temporalStatusByMemoryId,
        predecessorMemoryIdsByMemoryId,
        successorMemoryIdByMemoryId,
        incomingRevisionReasonByMemoryId,
        outgoingRevisionReasonByMemoryId,
        currentTruthMemoryIdByGroupKey,
        conflictingCurrentMemoryIdsByGroupKey,
    };
}

function buildStrengthSummary(input: {
    memory: RuntimeMemoryRecord;
    temporalStatus?: MemoryTemporalFactRecord['status'];
    evidenceCount: number;
    reuseCount: number;
    incomingRevisionReason?: MemoryRevisionRecord['revisionReason'];
    outgoingRevisionReason?: MemoryRevisionRecord['revisionReason'];
    minUpdatedAt: number;
    maxUpdatedAt: number;
}): MemoryStrengthSummary {
    const updatedAt = Date.parse(input.memory.updatedAt);
    const recencyScore =
        Number.isFinite(updatedAt) && input.maxUpdatedAt > input.minUpdatedAt
            ? clampScore((updatedAt - input.minUpdatedAt) / (input.maxUpdatedAt - input.minUpdatedAt))
            : 1;
    const scopeWeight =
        input.memory.scopeKind === 'global'
            ? 0.95
            : input.memory.scopeKind === 'workspace'
              ? 0.8
              : input.memory.scopeKind === 'thread'
                ? 0.65
                : 0.45;
    const memoryTypeWeight =
        input.memory.memoryType === 'semantic'
            ? 0.95
            : input.memory.memoryType === 'procedural'
              ? 0.85
              : 0.45;
    const createdByWeight = input.memory.createdByKind === 'system' ? 0.75 : 0.6;
    const importanceScore = clampScore((scopeWeight + memoryTypeWeight + createdByWeight) / 3);

    const statusWeight =
        input.temporalStatus === 'current'
            ? 0.82
            : input.temporalStatus === 'conflicted'
              ? 0.32
              : input.temporalStatus === 'superseded'
                ? 0.48
                : input.temporalStatus === 'disabled'
                  ? 0.18
                  : 0.55;
    const evidenceWeight = Math.min(0.18, input.evidenceCount * 0.04);
    const reuseWeight = Math.min(0.12, input.reuseCount * 0.02);
    const revisionWeight =
        input.incomingRevisionReason === 'correction'
            ? 0.02
            : input.outgoingRevisionReason
              ? -0.06
              : 0.06;
    const confidenceScore = clampScore(statusWeight + evidenceWeight + reuseWeight + revisionWeight);

    return {
        recencyScore,
        evidenceCount: input.evidenceCount,
        reuseCount: input.reuseCount,
        importanceScore,
        confidenceScore,
    };
}

function mapDerivedSummary(input: {
    memoryId: EntityId<'mem'>;
    memoryById: Map<EntityId<'mem'>, RuntimeMemoryRecord>;
    factsByMemoryId: Map<string, MemoryTemporalFactRecord>;
    outgoingLinksByMemoryId: Map<string, MemoryCausalLinkRecord[]>;
    incomingSupersedeLinksByTargetMemoryId: Map<string, MemoryCausalLinkRecord[]>;
    outgoingRevisionReasonByMemoryId: Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>;
    incomingRevisionReasonByMemoryId: Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>;
    subjectFactsByGroupKey: Map<string, MemoryTemporalFactRecord[]>;
    graphEdgesByMemoryId: Map<EntityId<'mem'>, MemoryGraphEdgeRecord[]>;
    evidenceCountByMemoryId: Map<EntityId<'mem'>, number>;
    reuseCountByMemoryId: Map<EntityId<'mem'>, number>;
    minUpdatedAt: number;
    maxUpdatedAt: number;
}): MemoryDerivedSummary {
    const memory = input.memoryById.get(input.memoryId);
    const temporalFact = input.factsByMemoryId.get(input.memoryId);
    const outgoingLinks = input.outgoingLinksByMemoryId.get(input.memoryId) ?? [];
    const incomingSupersedeLinks = input.incomingSupersedeLinksByTargetMemoryId.get(input.memoryId) ?? [];
    const successorLink = outgoingLinks.find(
        (link) => link.relationType === 'supersedes' && link.targetEntityKind === 'memory'
    );
    const subjectFacts = temporalFact
        ? input.subjectFactsByGroupKey.get(buildTemporalGroupKey(temporalFact.factKind, temporalFact.subjectKey)) ?? []
        : [];
    const currentTruthMemoryIds = subjectFacts
        .filter((fact) => fact.status === 'current')
        .map((fact) => fact.sourceMemoryId);
    const conflictingCurrentMemoryIds = subjectFacts
        .filter((fact) => fact.status === 'conflicted')
        .map((fact) => fact.sourceMemoryId);
    const graphNeighborIds = dedupeEntityIds(
        (input.graphEdgesByMemoryId.get(input.memoryId) ?? []).flatMap((edge) => {
            if (edge.sourceMemoryId === input.memoryId) {
                return [edge.targetMemoryId];
            }
            if (edge.targetMemoryId === input.memoryId) {
                return [edge.sourceMemoryId];
            }
            return [];
        })
    );

    return {
        ...(temporalFact ? { temporalStatus: temporalFact.status } : {}),
        ...(temporalFact ? { temporalSubjectKey: temporalFact.subjectKey } : {}),
        hasTemporalHistory: incomingSupersedeLinks.length > 0 || Boolean(successorLink),
        ...(currentTruthMemoryIds.length === 1 ? { currentTruthMemoryId: currentTruthMemoryIds[0] } : {}),
        conflictingCurrentMemoryIds,
        predecessorMemoryIds: dedupeEntityIds(
            incomingSupersedeLinks
                .filter((link) => link.sourceEntityKind === 'memory')
                .map((link) => link.sourceEntityId as EntityId<'mem'>)
        ),
        ...(successorLink ? { successorMemoryId: successorLink.targetEntityId as EntityId<'mem'> } : {}),
        ...(input.incomingRevisionReasonByMemoryId.get(input.memoryId)
            ? { incomingRevisionReason: input.incomingRevisionReasonByMemoryId.get(input.memoryId)! }
            : {}),
        ...(input.outgoingRevisionReasonByMemoryId.get(input.memoryId)
            ? { outgoingRevisionReason: input.outgoingRevisionReasonByMemoryId.get(input.memoryId)! }
            : {}),
        ...(memory
            ? {
                  strength: buildStrengthSummary({
                      memory,
                      evidenceCount: input.evidenceCountByMemoryId.get(input.memoryId) ?? 0,
                      reuseCount: input.reuseCountByMemoryId.get(input.memoryId) ?? 0,
                      ...(temporalFact?.status ? { temporalStatus: temporalFact.status } : {}),
                      ...(input.incomingRevisionReasonByMemoryId.get(input.memoryId)
                          ? { incomingRevisionReason: input.incomingRevisionReasonByMemoryId.get(input.memoryId)! }
                          : {}),
                      ...(input.outgoingRevisionReasonByMemoryId.get(input.memoryId)
                          ? { outgoingRevisionReason: input.outgoingRevisionReasonByMemoryId.get(input.memoryId)! }
                          : {}),
                      minUpdatedAt: input.minUpdatedAt,
                      maxUpdatedAt: input.maxUpdatedAt,
                  }),
              }
            : {}),
        graphNeighborCount: graphNeighborIds.length,
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

function buildDerivedArtifacts(input: {
    memory: RuntimeMemoryRecord;
    resolutionMaps: TemporalResolutionMaps;
}): {
    temporalFact: TemporalFactInsert;
    causalLinks: CausalLinkInsert[];
} {
    const sourceRunId = extractSourceRunId(input.memory);
    const temporalSubjectKey = input.resolutionMaps.subjectKeyByMemoryId.get(input.memory.id) ?? resolveTemporalSubjectKey(input.memory);
    const temporalStatus = input.resolutionMaps.temporalStatusByMemoryId.get(input.memory.id) ?? toBaseTemporalStatus(input.memory);
    const groupKey = buildTemporalGroupKey(input.memory.memoryType, temporalSubjectKey);
    const currentTruthMemoryId = input.resolutionMaps.currentTruthMemoryIdByGroupKey.get(groupKey);
    const conflictingCurrentMemoryIds =
        input.resolutionMaps.conflictingCurrentMemoryIdsByGroupKey.get(groupKey) ?? [];
    const successorMemoryId = input.resolutionMaps.successorMemoryIdByMemoryId.get(input.memory.id);
    const causalLinks: CausalLinkInsert[] = [];

    if (successorMemoryId) {
        causalLinks.push({
            profileId: input.memory.profileId,
            sourceEntityKind: 'memory',
            sourceEntityId: input.memory.id,
            targetEntityKind: 'memory',
            targetEntityId: successorMemoryId,
            relationType: 'supersedes',
            sourceMemoryId: input.memory.id,
            ...(sourceRunId ? { sourceRunId } : {}),
        });
    }
    if (sourceRunId) {
        causalLinks.push({
            profileId: input.memory.profileId,
            sourceEntityKind: 'memory',
            sourceEntityId: input.memory.id,
            targetEntityKind: 'run',
            targetEntityId: sourceRunId,
            relationType: 'observed_in_run',
            sourceMemoryId: input.memory.id,
            sourceRunId,
        });
    }
    if (input.memory.threadId) {
        causalLinks.push({
            profileId: input.memory.profileId,
            sourceEntityKind: 'memory',
            sourceEntityId: input.memory.id,
            targetEntityKind: 'thread',
            targetEntityId: input.memory.threadId,
            relationType: 'observed_in_thread',
            sourceMemoryId: input.memory.id,
            ...(sourceRunId ? { sourceRunId } : {}),
        });
    }
    if (input.memory.workspaceFingerprint) {
        causalLinks.push({
            profileId: input.memory.profileId,
            sourceEntityKind: 'memory',
            sourceEntityId: input.memory.id,
            targetEntityKind: 'workspace',
            targetEntityId: input.memory.workspaceFingerprint,
            relationType: 'observed_in_workspace',
            sourceMemoryId: input.memory.id,
            ...(sourceRunId ? { sourceRunId } : {}),
        });
    }

    return {
        temporalFact: {
            profileId: input.memory.profileId,
            subjectKey: temporalSubjectKey,
            factKind: input.memory.memoryType,
            value: {
                title: input.memory.title,
                summaryText: input.memory.summaryText ?? null,
                bodyMarkdown: input.memory.bodyMarkdown,
                scopeKind: input.memory.scopeKind,
                createdByKind: input.memory.createdByKind,
                temporalSubjectKey,
                ...(currentTruthMemoryId ? { currentTruthMemoryId } : {}),
                ...(conflictingCurrentMemoryIds.length > 0 ? { conflictingCurrentMemoryIds } : {}),
                ...(successorMemoryId ? { successorMemoryId } : {}),
            },
            status: temporalStatus,
            validFrom: input.memory.createdAt,
            ...((input.memory.state === 'superseded' || input.memory.state === 'disabled')
                ? { validTo: input.memory.updatedAt }
                : {}),
            sourceMemoryId: input.memory.id,
            ...(sourceRunId ? { sourceRunId } : {}),
            derivationVersion: DERIVATION_VERSION,
            confidence: 1,
        },
        causalLinks,
    };
}

function addDirectedGraphEdge(
    edgeMap: Map<string, GraphEdgeInsert>,
    input: {
        profileId: string;
        sourceMemoryId: EntityId<'mem'>;
        targetMemoryId: EntityId<'mem'>;
        edgeKind: MemoryGraphEdgeKind;
        weight: number;
    }
): void {
    if (input.sourceMemoryId === input.targetMemoryId) {
        return;
    }

    const key = [input.sourceMemoryId, input.targetMemoryId, input.edgeKind].join('::');
    const existing = edgeMap.get(key);
    if (existing && existing.weight >= input.weight) {
        return;
    }

    edgeMap.set(key, {
        profileId: input.profileId,
        sourceMemoryId: input.sourceMemoryId,
        targetMemoryId: input.targetMemoryId,
        edgeKind: input.edgeKind,
        weight: clampScore(input.weight),
        derivationVersion: DERIVATION_VERSION,
    });
}

function addUndirectedGraphEdge(
    edgeMap: Map<string, GraphEdgeInsert>,
    input: {
        profileId: string;
        leftMemoryId: EntityId<'mem'>;
        rightMemoryId: EntityId<'mem'>;
        edgeKind: MemoryGraphEdgeKind;
        weight: number;
    }
): void {
    addDirectedGraphEdge(edgeMap, {
        profileId: input.profileId,
        sourceMemoryId: input.leftMemoryId,
        targetMemoryId: input.rightMemoryId,
        edgeKind: input.edgeKind,
        weight: input.weight,
    });
    addDirectedGraphEdge(edgeMap, {
        profileId: input.profileId,
        sourceMemoryId: input.rightMemoryId,
        targetMemoryId: input.leftMemoryId,
        edgeKind: input.edgeKind,
        weight: input.weight,
    });
}

function addCompleteGroupEdges(
    edgeMap: Map<string, GraphEdgeInsert>,
    input: {
        profileId: string;
        memoryIds: EntityId<'mem'>[];
        edgeKind: MemoryGraphEdgeKind;
        weight: number;
    }
): void {
    for (let index = 0; index < input.memoryIds.length; index += 1) {
        const leftMemoryId = input.memoryIds[index];
        if (!leftMemoryId) {
            continue;
        }
        for (let targetIndex = index + 1; targetIndex < input.memoryIds.length; targetIndex += 1) {
            const rightMemoryId = input.memoryIds[targetIndex];
            if (!rightMemoryId) {
                continue;
            }
            addUndirectedGraphEdge(edgeMap, {
                profileId: input.profileId,
                leftMemoryId,
                rightMemoryId,
                edgeKind: input.edgeKind,
                weight: input.weight,
            });
        }
    }
}

function buildGraphEdges(input: {
    profileId: string;
    memories: RuntimeMemoryRecord[];
    resolutionMaps: TemporalResolutionMaps;
    revisionRecords: MemoryRevisionRecord[];
    evidenceByMemoryId: Map<EntityId<'mem'>, MemoryEvidenceRecord[]>;
}): GraphEdgeInsert[] {
    const edgeMap = new Map<string, GraphEdgeInsert>();
    const memoryIdsBySubjectGroup = new Map<string, EntityId<'mem'>[]>();
    const memoryIdsByRunId = new Map<EntityId<'run'>, EntityId<'mem'>[]>();
    const memoryIdsByThreadId = new Map<EntityId<'thr'>, EntityId<'mem'>[]>();
    const memoryIdsByWorkspaceFingerprint = new Map<string, EntityId<'mem'>[]>();
    const evidenceKeyToMemoryIds = new Map<string, EntityId<'mem'>[]>();

    for (const memory of input.memories) {
        const temporalSubjectKey = input.resolutionMaps.subjectKeyByMemoryId.get(memory.id) ?? resolveTemporalSubjectKey(memory);
        const subjectGroupKey = buildTemporalGroupKey(memory.memoryType, temporalSubjectKey);
        memoryIdsBySubjectGroup.set(subjectGroupKey, [...(memoryIdsBySubjectGroup.get(subjectGroupKey) ?? []), memory.id]);
        if (memory.runId) {
            memoryIdsByRunId.set(memory.runId, [...(memoryIdsByRunId.get(memory.runId) ?? []), memory.id]);
        }
        if (memory.threadId) {
            memoryIdsByThreadId.set(memory.threadId, [...(memoryIdsByThreadId.get(memory.threadId) ?? []), memory.id]);
        }
        if (memory.workspaceFingerprint) {
            memoryIdsByWorkspaceFingerprint.set(memory.workspaceFingerprint, [
                ...(memoryIdsByWorkspaceFingerprint.get(memory.workspaceFingerprint) ?? []),
                memory.id,
            ]);
        }

        const evidenceRecords = input.evidenceByMemoryId.get(memory.id) ?? [];
        for (const evidenceRecord of evidenceRecords) {
            const evidenceKeys = [
                ...(evidenceRecord.sourceRunId ? [`run:${evidenceRecord.sourceRunId}`] : []),
                ...(evidenceRecord.sourceMessageId ? [`message:${evidenceRecord.sourceMessageId}`] : []),
                ...(evidenceRecord.sourceMessagePartId ? [`message_part:${evidenceRecord.sourceMessagePartId}`] : []),
            ];
            for (const evidenceKey of evidenceKeys) {
                evidenceKeyToMemoryIds.set(evidenceKey, [...(evidenceKeyToMemoryIds.get(evidenceKey) ?? []), memory.id]);
            }
        }
    }

    for (const memoryIds of memoryIdsBySubjectGroup.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_subject',
            weight: 0.92,
        });
    }
    for (const memoryIds of memoryIdsByRunId.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_run',
            weight: 0.84,
        });
    }
    for (const memoryIds of memoryIdsByThreadId.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_thread',
            weight: 0.72,
        });
    }
    for (const memoryIds of memoryIdsByWorkspaceFingerprint.values()) {
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: dedupeEntityIds(memoryIds),
            edgeKind: 'same_workspace',
            weight: 0.44,
        });
    }

    for (const revisionRecord of input.revisionRecords) {
        addDirectedGraphEdge(edgeMap, {
            profileId: input.profileId,
            sourceMemoryId: revisionRecord.previousMemoryId,
            targetMemoryId: revisionRecord.replacementMemoryId,
            edgeKind: 'revision_successor',
            weight: 1,
        });
        addDirectedGraphEdge(edgeMap, {
            profileId: input.profileId,
            sourceMemoryId: revisionRecord.replacementMemoryId,
            targetMemoryId: revisionRecord.previousMemoryId,
            edgeKind: 'revision_predecessor',
            weight: 1,
        });
    }

    for (const memoryIds of evidenceKeyToMemoryIds.values()) {
        const uniqueMemoryIds = dedupeEntityIds(memoryIds);
        if (uniqueMemoryIds.length < 2) {
            continue;
        }
        addCompleteGroupEdges(edgeMap, {
            profileId: input.profileId,
            memoryIds: uniqueMemoryIds,
            edgeKind: 'evidence_overlap',
            weight: Math.min(0.9, 0.58 + uniqueMemoryIds.length * 0.06),
        });
    }

    return Array.from(edgeMap.values());
}

export class AdvancedMemoryDerivationService {
    async refreshMemoryById(profileId: string, memoryId: EntityId<'mem'>): Promise<OperationalResult<void>> {
        return this.refreshMemoryIds(profileId, [memoryId]);
    }

    async refreshMemoryIds(profileId: string, memoryIds: EntityId<'mem'>[]): Promise<OperationalResult<void>> {
        if (dedupeEntityIds(memoryIds).length === 0) {
            return okOp(undefined);
        }

        const rebuilt = await this.rebuildProfile(profileId);
        if (rebuilt.isErr()) {
            return errOp(rebuilt.error.code, rebuilt.error.message, {
                ...(rebuilt.error.details ? { details: rebuilt.error.details } : {}),
                ...(rebuilt.error.retryable !== undefined ? { retryable: rebuilt.error.retryable } : {}),
            });
        }

        return okOp(undefined);
    }

    async rebuildProfile(profileId: string): Promise<OperationalResult<{ memoryCount: number }>> {
        const memories = await memoryStore.listByProfile({ profileId });
        const memoryIds = memories.map((memory) => memory.id);
        const [revisionRecords, evidenceRecords] = await Promise.all([
            memoryRevisionStore.listByMemoryIds(profileId, memoryIds),
            memoryEvidenceStore.listByMemoryIds(profileId, memoryIds),
        ]);
        const evidenceByMemoryId = new Map<EntityId<'mem'>, MemoryEvidenceRecord[]>();
        for (const evidenceRecord of evidenceRecords) {
            evidenceByMemoryId.set(evidenceRecord.memoryId, [
                ...(evidenceByMemoryId.get(evidenceRecord.memoryId) ?? []),
                evidenceRecord,
            ]);
        }

        const resolutionMaps = buildTemporalResolutionMaps(memories, revisionRecords);
        const temporalFacts: TemporalFactInsert[] = [];
        const causalLinks: CausalLinkInsert[] = [];

        for (const memory of memories) {
            const derivedArtifacts = buildDerivedArtifacts({
                memory,
                resolutionMaps,
            });
            temporalFacts.push(derivedArtifacts.temporalFact);
            causalLinks.push(...derivedArtifacts.causalLinks);
        }

        const graphEdges = buildGraphEdges({
            profileId,
            memories,
            resolutionMaps,
            revisionRecords,
            evidenceByMemoryId,
        });

        await memoryDerivedStore.rebuildProfile({
            profileId,
            temporalFacts,
            causalLinks,
            graphEdges,
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

        const [
            memories,
            facts,
            outgoingLinks,
            incomingSupersedeLinks,
            revisionRecords,
            evidenceRecords,
            graphEdgesFromSource,
            graphEdgesFromTarget,
            retrievalUsageRecords,
        ] = await Promise.all([
            memoryStore.listByIds(profileId, uniqueMemoryIds),
            memoryDerivedStore.listTemporalFactsBySourceMemoryIds(profileId, uniqueMemoryIds),
            memoryDerivedStore.listCausalLinksBySourceMemoryIds(profileId, uniqueMemoryIds),
            memoryDerivedStore.listCausalLinksByTargetEntities({
                profileId,
                targetEntityKind: 'memory',
                targetEntityIds: uniqueMemoryIds,
                relationTypes: ['supersedes'],
            }),
            memoryRevisionStore.listByMemoryIds(profileId, uniqueMemoryIds),
            memoryEvidenceStore.listByMemoryIds(profileId, uniqueMemoryIds).catch(() => []),
            memoryDerivedStore.listGraphEdgesBySourceMemoryIds(profileId, uniqueMemoryIds).catch(() => []),
            memoryDerivedStore.listGraphEdgesByTargetMemoryIds(profileId, uniqueMemoryIds).catch(() => []),
            memoryRetrievalUsageStore.listByMemoryIds(profileId, uniqueMemoryIds).catch(() => []),
        ]);

        const subjectKeys = dedupeEntityIds(facts.map((fact) => fact.subjectKey));
        const subjectFacts = await memoryDerivedStore.listTemporalFactsBySubjectKeys(profileId, subjectKeys);

        const memoryById = new Map(memories.map((memory) => [memory.id, memory] as const));
        const factsByMemoryId = new Map(facts.map((fact) => [fact.sourceMemoryId, fact] as const));
        const outgoingLinksByMemoryId = new Map<string, MemoryCausalLinkRecord[]>();
        for (const link of outgoingLinks) {
            outgoingLinksByMemoryId.set(link.sourceMemoryId, [
                ...(outgoingLinksByMemoryId.get(link.sourceMemoryId) ?? []),
                link,
            ]);
        }
        const incomingSupersedeLinksByTargetMemoryId = new Map<string, MemoryCausalLinkRecord[]>();
        for (const link of incomingSupersedeLinks) {
            incomingSupersedeLinksByTargetMemoryId.set(link.targetEntityId, [
                ...(incomingSupersedeLinksByTargetMemoryId.get(link.targetEntityId) ?? []),
                link,
            ]);
        }
        const outgoingRevisionReasonByMemoryId = new Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>();
        const incomingRevisionReasonByMemoryId = new Map<EntityId<'mem'>, MemoryRevisionRecord['revisionReason']>();
        for (const revisionRecord of revisionRecords) {
            outgoingRevisionReasonByMemoryId.set(revisionRecord.previousMemoryId, revisionRecord.revisionReason);
            incomingRevisionReasonByMemoryId.set(revisionRecord.replacementMemoryId, revisionRecord.revisionReason);
        }
        const subjectFactsByGroupKey = new Map<string, MemoryTemporalFactRecord[]>();
        for (const fact of subjectFacts) {
            const groupKey = buildTemporalGroupKey(fact.factKind, fact.subjectKey);
            subjectFactsByGroupKey.set(groupKey, [...(subjectFactsByGroupKey.get(groupKey) ?? []), fact]);
        }
        const graphEdgesByMemoryId = new Map<EntityId<'mem'>, MemoryGraphEdgeRecord[]>();
        for (const graphEdge of [...graphEdgesFromSource, ...graphEdgesFromTarget]) {
            graphEdgesByMemoryId.set(graphEdge.sourceMemoryId, [
                ...(graphEdgesByMemoryId.get(graphEdge.sourceMemoryId) ?? []),
                graphEdge,
            ]);
            if (graphEdge.targetMemoryId !== graphEdge.sourceMemoryId) {
                graphEdgesByMemoryId.set(graphEdge.targetMemoryId, [
                    ...(graphEdgesByMemoryId.get(graphEdge.targetMemoryId) ?? []),
                    graphEdge,
                ]);
            }
        }
        const evidenceCountByMemoryId = new Map<EntityId<'mem'>, number>();
        for (const evidenceRecord of evidenceRecords) {
            evidenceCountByMemoryId.set(
                evidenceRecord.memoryId,
                (evidenceCountByMemoryId.get(evidenceRecord.memoryId) ?? 0) + 1
            );
        }
        const reuseCountByMemoryId = new Map(
            retrievalUsageRecords.map((usageRecord) => [usageRecord.memoryId, usageRecord.reuseCount] as const)
        );
        const updatedAtValues = memories
            .map((memory) => Date.parse(memory.updatedAt))
            .filter((value) => Number.isFinite(value));
        const minUpdatedAt = updatedAtValues.length > 0 ? Math.min(...updatedAtValues) : 0;
        const maxUpdatedAt = updatedAtValues.length > 0 ? Math.max(...updatedAtValues) : 0;

        return okOp(
            new Map(
                uniqueMemoryIds.map((memoryId) => [
                    memoryId,
                    mapDerivedSummary({
                        memoryId,
                        memoryById,
                        factsByMemoryId,
                        outgoingLinksByMemoryId,
                        incomingSupersedeLinksByTargetMemoryId,
                        outgoingRevisionReasonByMemoryId,
                        incomingRevisionReasonByMemoryId,
                        subjectFactsByGroupKey,
                        graphEdgesByMemoryId,
                        evidenceCountByMemoryId,
                        reuseCountByMemoryId,
                        minUpdatedAt,
                        maxUpdatedAt,
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
            const predecessorMemories = await memoryStore.listByIds(input.profileId, predecessorIds);

            for (const predecessorMemory of predecessorMemories) {
                if (candidateIds.has(predecessorMemory.id)) {
                    continue;
                }

                const successorLink = predecessorLinks.find((link) => link.sourceEntityId === predecessorMemory.id);
                candidates.push({
                    memory: predecessorMemory,
                    matchReason: 'derived_temporal',
                    sourceMemoryId:
                        (successorLink?.targetEntityId as EntityId<'mem'> | undefined) ?? predecessorMemory.id,
                    annotations: ['Prior truth from temporal memory history.'],
                });
                candidateIds.add(predecessorMemory.id);
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
                    const runId = runMemory.runId;
                    if (!runId || !linkedRunIds.includes(runId) || candidateIds.has(runMemory.id)) {
                        continue;
                    }

                    const sourceMemory = input.matchedMemories.find((memory) =>
                        summariesResult.value.get(memory.id)?.linkedRunIds.includes(runId)
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
