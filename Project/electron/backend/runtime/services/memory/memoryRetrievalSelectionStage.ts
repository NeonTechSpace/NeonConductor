import type {
    RankedMemoryRetrievalDecision,
    MemoryRetrievalSelectionStageInput,
    MemoryRetrievalSelectionStageResult,
} from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import {
    canFitRetrievedMemoryEntry,
    estimateRetrievedMemoryEntryLength,
    MAX_RETRIEVED_MEMORY_TEXT_LENGTH,
    MAX_SELECTED_RETRIEVED_MEMORY_RECORDS,
} from '@/app/backend/runtime/services/memory/memoryRetrievalMessageFormatter';

function isAnchor(decision: RankedMemoryRetrievalDecision): boolean {
    return decision.family === 'exact_run' || decision.family === 'exact_thread';
}

function isContextualNonBroadFamily(decision: RankedMemoryRetrievalDecision): boolean {
    return (
        decision.family === 'exact_run' ||
        decision.family === 'exact_thread' ||
        decision.family === 'exact_workspace' ||
        decision.family === 'structured' ||
        decision.family === 'derived_temporal' ||
        decision.family === 'derived_causal'
    );
}

function wouldExceedFamilyCap(
    candidate: RankedMemoryRetrievalDecision,
    selectedDecisions: RankedMemoryRetrievalDecision[]
): boolean {
    if (candidate.family === 'prompt') {
        return selectedDecisions.some((decision) => decision.family === 'prompt');
    }
    if (candidate.family === 'exact_global') {
        return selectedDecisions.some((decision) => decision.family === 'exact_global');
    }
    if (candidate.family === 'semantic') {
        const selectedSemanticCount = selectedDecisions.filter((decision) => decision.family === 'semantic').length;
        const hasStrongerContextualSelection = selectedDecisions.some(isContextualNonBroadFamily);
        return hasStrongerContextualSelection && selectedSemanticCount >= 1;
    }

    return false;
}

function isRedundantSelection(
    candidate: RankedMemoryRetrievalDecision,
    selectedDecisions: RankedMemoryRetrievalDecision[],
    derivedSummaryByMemoryId: MemoryRetrievalSelectionStageInput['derivedSummaryByMemoryId']
): boolean {
    if (isAnchor(candidate)) {
        return false;
    }

    const derivedSummary = derivedSummaryByMemoryId.get(candidate.memory.id);
    if (derivedSummary?.successorMemoryId && selectedDecisions.some((decision) => decision.memory.id === derivedSummary.successorMemoryId)) {
        return true;
    }

    if (
        candidate.sourceMemoryId &&
        candidate.family !== 'exact_run' &&
        candidate.family !== 'exact_thread' &&
        selectedDecisions.some(
            (decision) =>
                decision.sourceMemoryId === candidate.sourceMemoryId &&
                decision.family === candidate.family
        )
    ) {
        return true;
    }

    return selectedDecisions.some((decision) => decision.redundancyKey === candidate.redundancyKey);
}

export function selectRetrievedMemoryCandidates(
    input: MemoryRetrievalSelectionStageInput
): MemoryRetrievalSelectionStageResult {
    const selectedDecisions: RankedMemoryRetrievalDecision[] = [];
    let selectedTextLength = 'Retrieved memory'.length;

    for (const anchor of input.decisions.filter(isAnchor)) {
        if (selectedDecisions.some((decision) => decision.memory.id === anchor.memory.id)) {
            continue;
        }
        if (selectedDecisions.length >= MAX_SELECTED_RETRIEVED_MEMORY_RECORDS) {
            break;
        }

        const estimatedLength = estimateRetrievedMemoryEntryLength(anchor);
        if (!canFitRetrievedMemoryEntry(selectedTextLength, estimatedLength)) {
            continue;
        }

        selectedDecisions.push(anchor);
        selectedTextLength += estimatedLength;
    }

    for (const decision of input.decisions) {
        if (selectedDecisions.some((selectedDecision) => selectedDecision.memory.id === decision.memory.id)) {
            continue;
        }
        if (selectedDecisions.length >= MAX_SELECTED_RETRIEVED_MEMORY_RECORDS) {
            break;
        }
        if (wouldExceedFamilyCap(decision, selectedDecisions)) {
            continue;
        }
        if (isRedundantSelection(decision, selectedDecisions, input.derivedSummaryByMemoryId)) {
            continue;
        }

        const estimatedLength = estimateRetrievedMemoryEntryLength(decision);
        if (!canFitRetrievedMemoryEntry(selectedTextLength, estimatedLength)) {
            continue;
        }
        if (selectedTextLength + estimatedLength > MAX_RETRIEVED_MEMORY_TEXT_LENGTH) {
            continue;
        }

        selectedDecisions.push(decision);
        selectedTextLength += estimatedLength;
    }

    return {
        decisions: selectedDecisions,
    };
}
