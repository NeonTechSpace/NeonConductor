import type {
    MemoryRetrievalQualityRerankStageInput,
    MemoryRetrievalQualityRerankStageResult,
    RankedMemoryRetrievalDecision,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';

function isExactAnchor(decision: RankedMemoryRetrievalDecision): boolean {
    return decision.family === 'exact_run' || decision.family === 'exact_thread';
}

function readTimestamp(value: string): number {
    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? timestamp : 0;
}

function familyQualityWeight(decision: RankedMemoryRetrievalDecision): number {
    switch (decision.family) {
        case 'exact_run':
            return 1_000_000;
        case 'exact_thread':
            return 950_000;
        case 'exact_workspace':
            return 760_000;
        case 'structured':
            return 720_000;
        case 'derived_temporal':
            return 690_000;
        case 'derived_causal':
            return 660_000;
        case 'graph_expanded':
            return 630_000;
        case 'semantic':
            return 610_000;
        case 'exact_global':
            return 520_000;
        case 'prompt':
            return 430_000;
    }
}

function temporalQualityAdjustment(
    decision: RankedMemoryRetrievalDecision,
    input: MemoryRetrievalQualityRerankStageInput
): number {
    const derivedSummary = input.derivedSummaryByMemoryId.get(decision.memory.id);

    if (input.temporalIntent === 'conflict') {
        return decision.selectionExemptionReason === 'conflict' || derivedSummary?.temporalStatus === 'conflicted'
            ? 180_000
            : 0;
    }

    if (input.temporalIntent === 'history') {
        if (decision.selectionExemptionReason === 'history') {
            return 95_000;
        }
        if (derivedSummary?.temporalStatus === 'current') {
            return 60_000;
        }
        if (derivedSummary?.temporalStatus === 'superseded') {
            return 35_000;
        }
        return 0;
    }

    if (derivedSummary?.successorMemoryId) {
        return -170_000;
    }
    if (derivedSummary?.temporalStatus === 'current') {
        return 45_000;
    }
    if (derivedSummary?.temporalStatus === 'conflicted') {
        return -60_000;
    }
    if (derivedSummary?.temporalStatus === 'superseded') {
        return -130_000;
    }

    return 0;
}

function strengthQualityAdjustment(decision: RankedMemoryRetrievalDecision, input: MemoryRetrievalQualityRerankStageInput): number {
    const strength = input.derivedSummaryByMemoryId.get(decision.memory.id)?.strength;
    if (!strength) {
        return 0;
    }

    return (
        strength.recencyScore * 18_000 +
        Math.min(1, strength.evidenceCount / 5) * 14_000 +
        Math.min(1, strength.reuseCount / 5) * 10_000 +
        strength.importanceScore * 18_000 +
        strength.confidenceScore * 22_000
    );
}

function decisionQualityScore(
    decision: RankedMemoryRetrievalDecision,
    input: MemoryRetrievalQualityRerankStageInput
): number {
    return (
        familyQualityWeight(decision) +
        temporalQualityAdjustment(decision, input) +
        strengthQualityAdjustment(decision, input) +
        decision.structuredHitCount * 22_000 +
        decision.promptMatchCount * 10_000 +
        decision.graphExpansionScore * 28_000 +
        decision.semanticSimilarity * 32_000 +
        Math.max(0, 8 - decision.graphHopCount) * 1_000 +
        Math.max(0, 10_000 - decision.sourceDecisionRank) +
        Math.min(9_999, readTimestamp(decision.memory.updatedAt) / 1_000_000_000)
    );
}

function compareAnchors(left: RankedMemoryRetrievalDecision, right: RankedMemoryRetrievalDecision): number {
    if (left.familyRank !== right.familyRank) {
        return left.familyRank - right.familyRank;
    }
    if (left.memory.updatedAt !== right.memory.updatedAt) {
        return right.memory.updatedAt.localeCompare(left.memory.updatedAt);
    }
    return left.memory.id.localeCompare(right.memory.id);
}

export function rerankMemoryRetrievalQuality(
    input: MemoryRetrievalQualityRerankStageInput
): MemoryRetrievalQualityRerankStageResult {
    const anchors = input.decisions.filter(isExactAnchor).sort(compareAnchors);
    const anchorIds = new Set(anchors.map((decision) => decision.memory.id));
    const nonAnchors = input.decisions
        .filter((decision) => !anchorIds.has(decision.memory.id))
        .sort((left, right) => {
            const leftScore = decisionQualityScore(left, input);
            const rightScore = decisionQualityScore(right, input);
            if (leftScore !== rightScore) {
                return rightScore - leftScore;
            }
            if (left.familyRank !== right.familyRank) {
                return left.familyRank - right.familyRank;
            }
            if (left.memory.updatedAt !== right.memory.updatedAt) {
                return right.memory.updatedAt.localeCompare(left.memory.updatedAt);
            }
            return left.memory.id.localeCompare(right.memory.id);
        });

    return {
        decisions: [...anchors, ...nonAnchors],
    };
}
