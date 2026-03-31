import { assembleMemoryRetrievalResult } from '@/app/backend/runtime/services/memory/memoryRetrievalAssemblyStage';
import { collectMemoryRetrievalCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalCandidateCollector';
import { resolveMemoryRetrievalContext } from '@/app/backend/runtime/services/memory/memoryRetrievalContextResolver';
import { expandMemoryRetrievalCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalExpansionStage';
import type { MemoryRetrievalStageInput } from '@/app/backend/runtime/services/memory/memoryRetrievalPipelineTypes';
import { rankRetrievedMemoryCandidates } from '@/app/backend/runtime/services/memory/memoryRetrievalRankingPolicy';

import type { RetrievedMemorySummary } from '@/app/backend/runtime/contracts';
import type { RunContextMessage } from '@/app/backend/runtime/services/runExecution/types';

export type RetrieveRelevantMemoryInput = MemoryRetrievalStageInput;

export interface RetrieveRelevantMemoryResult {
    summary?: RetrievedMemorySummary;
    messages: RunContextMessage[];
}

export class MemoryRetrievalService {
    async retrieveRelevantMemory(input: RetrieveRelevantMemoryInput): Promise<RetrieveRelevantMemoryResult> {
        const context = await resolveMemoryRetrievalContext(input);
        const collected = await collectMemoryRetrievalCandidates(context);
        const expanded = await expandMemoryRetrievalCandidates({
            context,
            baseCandidates: collected.baseCandidates,
        });
        const orderedCandidates = rankRetrievedMemoryCandidates({
            baseCandidates: expanded.baseCandidates,
            activeMemories: context.activeMemories,
            promptTerms: context.promptTerms,
            derivedCandidates: expanded.derivedCandidates,
        }).slice(0, 6);

        const assembled = await assembleMemoryRetrievalResult({
            profileId: input.profileId,
            decisions: orderedCandidates,
        });

        return {
            messages: assembled.messages,
            ...(assembled.summary ? { summary: assembled.summary } : {}),
        };
    }
}

export const memoryRetrievalService = new MemoryRetrievalService();
