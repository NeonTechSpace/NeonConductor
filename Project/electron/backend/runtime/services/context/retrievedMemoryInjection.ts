import type { RetrievedMemorySummary, TopLevelTab } from '@/app/backend/runtime/contracts';
import {
    memoryRetrievalService,
    type RetrieveRelevantMemoryInput,
    type RetrieveRelevantMemoryResult,
} from '@/app/backend/runtime/services/memory/retrieval';

export interface RetrievedMemoryInjectionResult {
    summary?: RetrievedMemorySummary;
    messages: RetrieveRelevantMemoryResult['messages'];
}

export async function loadRetrievedMemoryInjection(
    input: RetrieveRelevantMemoryInput
): Promise<RetrievedMemoryInjectionResult> {
    const result = await memoryRetrievalService.retrieveRelevantMemory(input);
    return {
        messages: result.messages,
        ...(result.summary ? { summary: result.summary } : {}),
    };
}

export type RetrievedMemoryInjectionInput = {
    profileId: string;
    sessionId: RetrieveRelevantMemoryInput['sessionId'];
    topLevelTab: TopLevelTab;
    modeKey: string;
    prompt: string;
    workspaceFingerprint?: string;
    runId?: RetrieveRelevantMemoryInput['runId'];
};
