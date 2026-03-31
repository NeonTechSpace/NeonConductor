import { beforeEach, describe, expect, it, vi } from 'vitest';

const { upsertCompactionMock, deletePreparationBySessionMock } = vi.hoisted(() => ({
    upsertCompactionMock: vi.fn(),
    deletePreparationBySessionMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    sessionContextCompactionStore: {
        upsert: upsertCompactionMock,
    },
    sessionContextCompactionPreparationStore: {
        deleteBySession: deletePreparationBySessionMock,
    },
}));

import { persistAppliedCompaction } from '@/app/backend/runtime/services/context/contextCompactionPersistence';

describe('contextCompactionPersistence', () => {
    beforeEach(() => {
        upsertCompactionMock.mockReset();
        deletePreparationBySessionMock.mockReset();
    });

    it('writes the applied compaction and clears any prepared candidate', async () => {
        upsertCompactionMock.mockResolvedValue({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            cutoffMessageId: 'msg_4',
            summaryText: 'Summary',
            source: 'auto',
            thresholdTokens: 1_000,
            estimatedInputTokens: 1_250,
            createdAt: '2026-03-31T00:00:00.000Z',
            updatedAt: '2026-03-31T00:00:00.000Z',
        });

        const result = await persistAppliedCompaction({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            cutoffMessageId: 'msg_4',
            summaryText: 'Summary',
            source: 'auto',
            thresholdTokens: 1_000,
            estimatedInputTokens: 1_250,
        });

        expect(result.summaryText).toBe('Summary');
        expect(upsertCompactionMock).toHaveBeenCalledTimes(1);
        expect(deletePreparationBySessionMock).toHaveBeenCalledWith('profile_test', 'sess_test');
    });
});
