import type {
    MemoryRetrievalTemporalIntent,
    MemoryRetrievalTemporalResolutionStageInput,
    MemoryRetrievalTemporalResolutionStageResult,
    RankedMemoryRetrievalDecision,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import { buildRankedRetrievedMemoryDecision } from '@/app/backend/runtime/services/memory/memoryRetrievalRankingPolicy';

const HISTORY_PROMPT_TERMS = ['before', 'change', 'changed', 'corrected', 'earlier', 'history', 'old', 'older', 'previous', 'prior', 'replaced'];
const CONFLICT_PROMPT_TERMS = ['both', 'conflict', 'contradiction', 'contradictory', 'disagree', 'disagreement', 'inconsistent'];

function normalizePrompt(value: string): string {
    return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function readTemporalIntent(prompt: string): MemoryRetrievalTemporalResolutionStageInput['prompt'] extends string
    ? MemoryRetrievalTemporalIntent
    : never {
    const normalizedPrompt = normalizePrompt(prompt);
    if (CONFLICT_PROMPT_TERMS.some((term) => normalizedPrompt.includes(term))) {
        return 'conflict';
    }
    if (HISTORY_PROMPT_TERMS.some((term) => normalizedPrompt.includes(term))) {
        return 'history';
    }
    return 'current';
}

function appendAnnotation(
    existingAnnotations: string[] | undefined,
    annotation: string
): string[] {
    return [...(existingAnnotations ?? []), annotation];
}

function buildPromotionDecision(input: {
    sourceDecision: RankedMemoryRetrievalDecision;
    promotedMemory: RankedMemoryRetrievalDecision['memory'];
    annotation: string;
    selectionExemptionReason?: RankedMemoryRetrievalDecision['selectionExemptionReason'];
}): RankedMemoryRetrievalDecision {
    return buildRankedRetrievedMemoryDecision(input.promotedMemory, 'derived_temporal', 'derived', {
        sourceMemoryId: input.sourceDecision.memory.id,
        annotations: appendAnnotation(input.sourceDecision.annotations, input.annotation),
        sourceDecisionRank: input.sourceDecision.familyRank,
        selectionExemptionReason: input.selectionExemptionReason,
    });
}

export function resolveTemporalMemoryCandidates(
    input: MemoryRetrievalTemporalResolutionStageInput
): MemoryRetrievalTemporalResolutionStageResult & { temporalIntent: MemoryRetrievalTemporalIntent } {
    const temporalIntent = readTemporalIntent(input.prompt);
    const activeMemoriesById = new Map(input.activeMemories.map((memory) => [memory.id, memory] as const));
    const decisionsByMemoryId = new Map(input.decisions.map((decision) => [decision.memory.id, decision] as const));
    const resolvedDecisions: RankedMemoryRetrievalDecision[] = [...input.decisions];

    for (const decision of input.decisions) {
        const derivedSummary = input.derivedSummaryByMemoryId.get(decision.memory.id);
        if (!derivedSummary) {
            continue;
        }

        if (derivedSummary.conflictingCurrentMemoryIds.length > 0) {
            for (const conflictingMemoryId of derivedSummary.conflictingCurrentMemoryIds) {
                const existingDecision = decisionsByMemoryId.get(conflictingMemoryId);
                if (existingDecision) {
                    if (!existingDecision.selectionExemptionReason) {
                        existingDecision.selectionExemptionReason = 'conflict';
                    }
                    existingDecision.annotations = appendAnnotation(
                        existingDecision.annotations,
                        'Conflicting current truth for this temporal subject.'
                    );
                    continue;
                }

                const conflictingMemory = activeMemoriesById.get(conflictingMemoryId);
                if (!conflictingMemory) {
                    continue;
                }

                const promotedDecision = buildPromotionDecision({
                    sourceDecision: decision,
                    promotedMemory: conflictingMemory,
                    annotation: 'Conflicting current truth for this temporal subject.',
                    selectionExemptionReason: 'conflict',
                });
                decisionsByMemoryId.set(conflictingMemoryId, promotedDecision);
                resolvedDecisions.push(promotedDecision);
            }

            continue;
        }

        if (!derivedSummary.currentTruthMemoryId || derivedSummary.currentTruthMemoryId === decision.memory.id) {
            continue;
        }

        const currentTruthMemory = activeMemoriesById.get(derivedSummary.currentTruthMemoryId);
        if (!currentTruthMemory) {
            continue;
        }
        if (decisionsByMemoryId.has(currentTruthMemory.id)) {
            continue;
        }

        if (temporalIntent === 'current') {
            const promotedDecision = buildPromotionDecision({
                sourceDecision: decision,
                promotedMemory: currentTruthMemory,
                annotation: 'Current truth for this temporal subject.',
            });
            decisionsByMemoryId.set(currentTruthMemory.id, promotedDecision);
            resolvedDecisions.push(promotedDecision);
            continue;
        }

        if (temporalIntent === 'history') {
            const promotedDecision = buildPromotionDecision({
                sourceDecision: decision,
                promotedMemory: currentTruthMemory,
                annotation: 'Current truth shown before prior temporal history.',
                selectionExemptionReason: 'history',
            });
            decisionsByMemoryId.set(currentTruthMemory.id, promotedDecision);
            resolvedDecisions.push(promotedDecision);
            if (!decision.selectionExemptionReason) {
                decision.selectionExemptionReason = 'history';
            }
        }
    }

    const orderedDecisions = [...resolvedDecisions].sort((left, right) => {
        if (temporalIntent === 'conflict') {
            const leftConflictPriority = left.selectionExemptionReason === 'conflict' ? 0 : 1;
            const rightConflictPriority = right.selectionExemptionReason === 'conflict' ? 0 : 1;
            if (leftConflictPriority !== rightConflictPriority) {
                return leftConflictPriority - rightConflictPriority;
            }
        }
        if (temporalIntent === 'history') {
            const leftCurrentTruthPriority =
                left.annotations?.includes('Current truth shown before prior temporal history.') ? 0 : 1;
            const rightCurrentTruthPriority =
                right.annotations?.includes('Current truth shown before prior temporal history.') ? 0 : 1;
            if (leftCurrentTruthPriority !== rightCurrentTruthPriority) {
                return leftCurrentTruthPriority - rightCurrentTruthPriority;
            }
        }

        if (left.familyRank !== right.familyRank) {
            return left.familyRank - right.familyRank;
        }
        if (left.score !== right.score) {
            return right.score - left.score;
        }
        return left.memory.id.localeCompare(right.memory.id);
    });

    return {
        temporalIntent,
        decisions: orderedDecisions,
    };
}
