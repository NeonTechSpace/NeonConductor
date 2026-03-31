import { memoryDerivedStore, memoryStore } from '@/app/backend/persistence/stores';
import type { MemoryGraphEdgeRecord, MemoryRecord } from '@/app/backend/persistence/types';
import type { EntityId, MemoryDerivedSummary, MemoryGraphEdgeKind } from '@/app/backend/runtime/contracts';
import { advancedMemoryDerivationService } from '@/app/backend/runtime/services/memory/advancedDerivation';
import type {
    MemoryRetrievalGraphCandidate,
    MemoryRetrievalGraphStageInput,
    MemoryRetrievalGraphStageResult,
    RankedMemoryRetrievalDecision,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import { appLog } from '@/app/main/logging';

const ALWAYS_ALLOWED_EDGE_KINDS = new Set<MemoryGraphEdgeKind>([
    'same_subject',
    'revision_predecessor',
    'revision_successor',
    'same_run',
    'evidence_overlap',
]);
const MAX_GRAPH_EXPANSION_DEPTH = 2;
const MAX_GRAPH_EXPANDED_CANDIDATES = 6;

function isStrongAnchor(decision: RankedMemoryRetrievalDecision): boolean {
    return (
        decision.family === 'exact_run' ||
        decision.family === 'exact_thread' ||
        decision.family === 'exact_workspace' ||
        decision.family === 'structured' ||
        decision.family === 'derived_temporal' ||
        decision.family === 'derived_causal'
    );
}

function canTraverseEdge(input: {
    edge: MemoryGraphEdgeRecord;
    anchor: RankedMemoryRetrievalDecision;
}): boolean {
    if (ALWAYS_ALLOWED_EDGE_KINDS.has(input.edge.edgeKind)) {
        return true;
    }

    return input.edge.edgeKind === 'same_workspace' && input.anchor.family === 'exact_workspace';
}

function describeEdgeKind(edgeKind: MemoryGraphEdgeKind): string {
    switch (edgeKind) {
        case 'same_subject':
            return 'same temporal subject';
        case 'revision_predecessor':
            return 'revision predecessor';
        case 'revision_successor':
            return 'revision successor';
        case 'same_run':
            return 'same originating run';
        case 'same_thread':
            return 'same thread';
        case 'same_workspace':
            return 'same workspace';
        case 'evidence_overlap':
            return 'overlapping source evidence';
    }
}

function readStrengthWeight(memory: MemoryRecord, derivedSummary?: MemoryDerivedSummary): number {
    const strength = derivedSummary?.strength;
    if (!strength) {
        return memory.createdByKind === 'system' ? 0.55 : 0.45;
    }

    return (
        strength.recencyScore * 0.2 +
        Math.min(1, strength.evidenceCount / 5) * 0.15 +
        Math.min(1, strength.reuseCount / 5) * 0.1 +
        strength.importanceScore * 0.25 +
        strength.confidenceScore * 0.3
    );
}

function computeGraphScore(input: {
    edgeWeight: number;
    hopCount: number;
    anchor: RankedMemoryRetrievalDecision;
    candidateMemory: MemoryRecord;
    candidateSummary?: MemoryDerivedSummary;
}): number {
    const anchorWeight = Math.max(0.2, (11 - input.anchor.familyRank) / 10);
    const hopWeight = input.hopCount === 1 ? 1 : 0.72;
    const strengthWeight = readStrengthWeight(input.candidateMemory, input.candidateSummary);
    return Number((input.edgeWeight * 0.45 + anchorWeight * 0.25 + hopWeight * 0.1 + strengthWeight * 0.2).toFixed(4));
}

export async function collectGraphExpandedMemoryRetrievalCandidates(
    input: MemoryRetrievalGraphStageInput
): Promise<MemoryRetrievalGraphStageResult> {
    try {
        const anchorDecisions = input.decisions.filter(isStrongAnchor);
        if (anchorDecisions.length === 0) {
            return { graphCandidates: [] };
        }

        const existingDecisionMemoryIds = new Set(input.decisions.map((decision) => decision.memory.id));
        const anchorIds = anchorDecisions.map((decision) => decision.memory.id);
        const firstHopEdges = await memoryDerivedStore.listGraphEdgesBySourceMemoryIds(input.profileId, anchorIds);
        const firstHopTargetIds = Array.from(new Set(firstHopEdges.map((edge) => edge.targetMemoryId)));
        const secondHopEdges =
            firstHopTargetIds.length > 0
                ? await memoryDerivedStore.listGraphEdgesBySourceMemoryIds(input.profileId, firstHopTargetIds)
                : [];
        const edgesBySourceMemoryId = new Map<EntityId<'mem'>, MemoryGraphEdgeRecord[]>();
        for (const edge of [...firstHopEdges, ...secondHopEdges]) {
            edgesBySourceMemoryId.set(edge.sourceMemoryId, [...(edgesBySourceMemoryId.get(edge.sourceMemoryId) ?? []), edge]);
        }

        const candidateMemoryIds = new Set<EntityId<'mem'>>();
        for (const edge of [...firstHopEdges, ...secondHopEdges]) {
            candidateMemoryIds.add(edge.targetMemoryId);
        }
        const candidateMemories = await memoryStore.listByIds(input.profileId, Array.from(candidateMemoryIds));
        const memoryById = new Map(candidateMemories.map((memory) => [memory.id, memory] as const));
        const candidateSummaryResult = await advancedMemoryDerivationService.getDerivedSummaries(
            input.profileId,
            candidateMemories.map((memory) => memory.id)
        );
        const candidateSummaryByMemoryId = candidateSummaryResult.isOk() ? candidateSummaryResult.value : new Map();

        const graphCandidatesByMemoryId = new Map<EntityId<'mem'>, MemoryRetrievalGraphCandidate>();
        for (const anchor of anchorDecisions) {
            const queue: Array<{ memoryId: EntityId<'mem'>; hopCount: number }> = [{ memoryId: anchor.memory.id, hopCount: 0 }];
            const visited = new Set<EntityId<'mem'>>([anchor.memory.id]);

            while (queue.length > 0) {
                const current = queue.shift();
                if (!current) {
                    continue;
                }
                if (current.hopCount >= MAX_GRAPH_EXPANSION_DEPTH) {
                    continue;
                }

                const outgoingEdges = edgesBySourceMemoryId.get(current.memoryId) ?? [];
                for (const edge of outgoingEdges) {
                    if (!canTraverseEdge({ edge, anchor })) {
                        continue;
                    }

                    const candidateMemory = memoryById.get(edge.targetMemoryId);
                    if (!candidateMemory) {
                        continue;
                    }
                    const nextHopCount = current.hopCount + 1;
                    const isHistoryNeighbor = input.temporalIntent === 'history' && edge.edgeKind === 'revision_predecessor';
                    if (!isHistoryNeighbor && candidateMemory.state !== 'active') {
                        continue;
                    }
                    if (existingDecisionMemoryIds.has(candidateMemory.id)) {
                        continue;
                    }

                    const candidateSummary = input.derivedSummaryByMemoryId.get(candidateMemory.id);
                    const resolvedCandidateSummary = candidateSummary ?? candidateSummaryByMemoryId.get(candidateMemory.id);
                    if (
                        resolvedCandidateSummary?.currentTruthMemoryId &&
                        existingDecisionMemoryIds.has(resolvedCandidateSummary.currentTruthMemoryId)
                    ) {
                        continue;
                    }

                    const graphScore = computeGraphScore({
                        edgeWeight: edge.weight,
                        hopCount: nextHopCount,
                        anchor,
                        candidateMemory,
                        candidateSummary: resolvedCandidateSummary,
                    });
                    const existingCandidate = graphCandidatesByMemoryId.get(candidateMemory.id);
                    const annotations = [`Graph expansion via ${describeEdgeKind(edge.edgeKind)} from ${anchor.memory.title}.`];
                    const selectionExemptionReason =
                        input.temporalIntent === 'history' && isHistoryNeighbor
                            ? 'history'
                            : input.temporalIntent === 'conflict' &&
                                (anchor.selectionExemptionReason === 'conflict' ||
                                    resolvedCandidateSummary?.conflictingCurrentMemoryIds.includes(candidateMemory.id))
                              ? 'conflict'
                              : undefined;

                    if (!existingCandidate || graphScore > existingCandidate.graphScore) {
                        graphCandidatesByMemoryId.set(candidateMemory.id, {
                            memory: candidateMemory,
                            matchReason: 'graph_expanded',
                            tier: 'graph',
                            sourceMemoryId: anchor.memory.id,
                            graphScore,
                            hopCount: nextHopCount,
                            annotations,
                            ...(selectionExemptionReason ? { selectionExemptionReason } : {}),
                        });
                    }

                    if (!visited.has(edge.targetMemoryId)) {
                        visited.add(edge.targetMemoryId);
                        queue.push({ memoryId: edge.targetMemoryId, hopCount: nextHopCount });
                    }
                }
            }
        }

        return {
            graphCandidates: Array.from(graphCandidatesByMemoryId.values())
                .sort((left, right) => {
                    if (left.graphScore !== right.graphScore) {
                        return right.graphScore - left.graphScore;
                    }
                    if (left.hopCount !== right.hopCount) {
                        return left.hopCount - right.hopCount;
                    }
                    if (left.memory.updatedAt !== right.memory.updatedAt) {
                        return right.memory.updatedAt.localeCompare(left.memory.updatedAt);
                    }
                    return left.memory.id.localeCompare(right.memory.id);
                })
                .slice(0, MAX_GRAPH_EXPANDED_CANDIDATES),
        };
    } catch (error) {
        appLog.warn({
            tag: 'memory.graph-retrieval.stage',
            message: 'Graph expansion stage failed softly.',
            profileId: input.profileId,
            detail: error instanceof Error ? error.message : 'Unknown error.',
        });
        return { graphCandidates: [] };
    }
}
