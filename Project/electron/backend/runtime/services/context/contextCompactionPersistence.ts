import {
    sessionContextCompactionPreparationStore,
    sessionContextCompactionStore,
} from '@/app/backend/persistence/stores';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';

export async function persistAppliedCompaction(input: {
    profileId: string;
    sessionId: string;
    cutoffMessageId: string;
    summaryText: string;
    source: 'auto' | 'manual';
    thresholdTokens: number;
    estimatedInputTokens: number;
}): Promise<SessionContextCompactionRecord> {
    const compaction = await sessionContextCompactionStore.upsert({
        profileId: input.profileId,
        sessionId: input.sessionId,
        cutoffMessageId: input.cutoffMessageId,
        summaryText: input.summaryText,
        source: input.source,
        thresholdTokens: input.thresholdTokens,
        estimatedInputTokens: input.estimatedInputTokens,
    });
    await sessionContextCompactionPreparationStore.deleteBySession(input.profileId, input.sessionId);
    return compaction;
}
