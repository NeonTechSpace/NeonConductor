import type { MemoryRecord } from '@/app/backend/persistence/types';
import type { EntityId, RetrievedMemoryMatchReason } from '@/app/backend/runtime/contracts';

export interface RetrievedMemoryExplanation {
    selectedSourceLabel: string;
    selectionReason: string;
    rankingReason: string;
}

export interface RetrievedMemoryDecision {
    memory: MemoryRecord;
    matchReason: RetrievedMemoryMatchReason;
    priority: number;
    sourceMemoryId?: EntityId<'mem'>;
    annotations?: string[];
    explanation: RetrievedMemoryExplanation;
}

export function buildRetrievedMemoryExplanation(input: {
    matchReason: RetrievedMemoryMatchReason;
    familyRank: number;
    promptMatchCount?: number;
}): RetrievedMemoryExplanation {
    const selectedSourceLabel: Record<RetrievedMemoryMatchReason, string> = {
        exact_run: 'Exact run',
        exact_thread: 'Exact thread',
        exact_workspace: 'Exact workspace',
        exact_global: 'Exact global',
        structured: 'Structured context',
        derived_temporal: 'Derived temporal',
        derived_causal: 'Derived causal',
        semantic: 'Semantic match',
        prompt: 'Prompt match',
    };

    return {
        selectedSourceLabel: selectedSourceLabel[input.matchReason],
        selectionReason:
            input.matchReason === 'exact_run'
                ? 'The current run matched this memory directly.'
                : input.matchReason === 'exact_thread'
                  ? 'The current thread matched this memory directly.'
                  : input.matchReason === 'exact_workspace'
                    ? 'The current workspace matched this memory directly.'
                    : input.matchReason === 'exact_global'
                      ? 'Global scope matched this memory directly.'
                      : input.matchReason === 'structured'
                        ? 'Session context matched this memory through structured fields.'
                        : input.matchReason === 'derived_temporal'
                          ? 'Temporal history expanded the selected memory set.'
                          : input.matchReason === 'derived_causal'
                            ? 'A causally linked run memory expanded the selected memory set.'
                            : input.matchReason === 'semantic'
                              ? 'Semantic retrieval found this memory through embedding similarity.'
                            : `Prompt terms matched ${String(input.promptMatchCount ?? 0)} searchable terms.`,
        rankingReason:
            input.matchReason === 'prompt'
                ? 'Prompt matches are ranked after explicit scope and structured matches.'
                : input.familyRank <= 3
                  ? 'Exact scope outranks broader matches.'
                  : input.matchReason === 'exact_global'
                    ? 'Global exact matches stay below contextual, derived, and semantic results.'
                    : input.familyRank < 9
                    ? 'Structured, derived, and semantic matches outrank prompt-only matches.'
                    : 'Prompt match ranking was used as the fallback tier.',
    };
}
