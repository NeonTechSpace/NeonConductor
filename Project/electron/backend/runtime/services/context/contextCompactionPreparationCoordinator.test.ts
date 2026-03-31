import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolvedContextPolicy } from '@/app/backend/runtime/contracts';
import { okOp } from '@/app/backend/runtime/services/common/operationalError';

const {
    getPreparationMock,
    upsertPreparationMock,
    deletePreparationBySessionMock,
    persistAppliedCompactionMock,
    deriveCompactionCandidateMock,
    resolveCompactionSummarizerTargetMock,
    generateCompactionSummaryMock,
    warnMock,
} = vi.hoisted(() => ({
    getPreparationMock: vi.fn(),
    upsertPreparationMock: vi.fn(),
    deletePreparationBySessionMock: vi.fn(),
    persistAppliedCompactionMock: vi.fn(),
    deriveCompactionCandidateMock: vi.fn(),
    resolveCompactionSummarizerTargetMock: vi.fn(),
    generateCompactionSummaryMock: vi.fn(),
    warnMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    sessionContextCompactionPreparationStore: {
        get: getPreparationMock,
        upsert: upsertPreparationMock,
        deleteBySession: deletePreparationBySessionMock,
    },
}));

vi.mock('@/app/backend/runtime/services/context/contextCompactionShared', () => ({
    deriveCompactionCandidate: deriveCompactionCandidateMock,
    resolveCompactionSummarizerTarget: resolveCompactionSummarizerTargetMock,
    generateCompactionSummary: generateCompactionSummaryMock,
}));

vi.mock('@/app/main/logging', () => ({
    appLog: {
        warn: warnMock,
    },
}));

vi.mock('@/app/backend/runtime/services/context/contextCompactionPersistence', () => ({
    persistAppliedCompaction: persistAppliedCompactionMock,
}));

import { contextCompactionPreparationCoordinator } from '@/app/backend/runtime/services/context/contextCompactionPreparationCoordinator';

describe('contextCompactionPreparationCoordinator', () => {
    beforeEach(() => {
        getPreparationMock.mockReset();
        upsertPreparationMock.mockReset();
        deletePreparationBySessionMock.mockReset();
        persistAppliedCompactionMock.mockReset();
        deriveCompactionCandidateMock.mockReset();
        resolveCompactionSummarizerTargetMock.mockReset();
        generateCompactionSummaryMock.mockReset();
        warnMock.mockReset();
    });

    it('prepares only inside the precompute window', () => {
        expect(
            contextCompactionPreparationCoordinator.shouldPrepare({
                thresholdTokens: 1_000,
                totalTokens: 849,
            })
        ).toBe(false);
        expect(
            contextCompactionPreparationCoordinator.shouldPrepare({
                thresholdTokens: 1_000,
                totalTokens: 850,
            })
        ).toBe(true);
        expect(
            contextCompactionPreparationCoordinator.shouldPrepare({
                thresholdTokens: 1_000,
                totalTokens: 1_000,
            })
        ).toBe(false);
    });

    it('deduplicates concurrent preparation requests for the same session', async () => {
        let releaseCandidate!: () => void;
        const candidateGate = new Promise<void>((resolve) => {
            releaseCandidate = resolve;
        });
        deriveCompactionCandidateMock.mockImplementation(async () => {
            await candidateGate;
            return {
                kind: 'ready',
                candidate: {
                    latestSummarizedMessage: {
                        messageId: 'msg_4',
                        role: 'user',
                        parts: [],
                    },
                    summaryMessages: [
                        {
                            role: 'user',
                            parts: [{ type: 'text', text: 'Older context' }],
                        },
                    ],
                    sourceDigest: 'digest_a',
                    replayEstimate: {
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                        mode: 'estimated',
                        totalTokens: 1_250,
                        parts: [],
                    },
                },
            };
        });
        getPreparationMock.mockResolvedValue(null);
        resolveCompactionSummarizerTargetMock.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5-mini',
            source: 'utility',
        });
        generateCompactionSummaryMock.mockResolvedValue(okOp('Prepared summary'));
        upsertPreparationMock.mockResolvedValue(undefined);

        const input = {
            profileId: 'profile_test',
            sessionId: 'sess_test',
            policy: {
                enabled: true,
                profileId: 'profile_test',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                limits: {
                    profileId: 'profile_test',
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                    modelLimitsKnown: true,
                    contextLength: 10_000,
                    maxOutputTokens: 2_000,
                    contextLengthSource: 'static',
                    maxOutputTokensSource: 'static',
                    source: 'static',
                },
                mode: 'percent' as const,
                thresholdTokens: 1_000,
                usableInputBudgetTokens: 2_000,
                percent: 10,
                safetyBufferTokens: 1_000,
            } satisfies ResolvedContextPolicy,
            replayMessages: [],
            existingCompaction: null,
        };

        const first = contextCompactionPreparationCoordinator.schedulePreparation(input);
        const second = contextCompactionPreparationCoordinator.schedulePreparation(input);

        expect(first).toBe(second);

        releaseCandidate();
        await Promise.all([first, second]);

        expect(deriveCompactionCandidateMock).toHaveBeenCalledTimes(1);
        expect(generateCompactionSummaryMock).toHaveBeenCalledTimes(1);
        expect(upsertPreparationMock).toHaveBeenCalledTimes(1);
    });

    it('reuses a matching prepared candidate and deletes it after promotion', async () => {
        getPreparationMock.mockResolvedValue({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            cutoffMessageId: 'msg_4',
            sourceDigest: 'digest_a',
            summaryText: 'Prepared summary',
            summarizerProviderId: 'openai',
            summarizerModelId: 'openai/gpt-5-mini',
            thresholdTokens: 1_000,
            estimatedInputTokens: 1_250,
            createdAt: '2026-03-31T00:00:00.000Z',
            updatedAt: '2026-03-31T00:00:00.000Z',
        });
        persistAppliedCompactionMock.mockResolvedValue({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            cutoffMessageId: 'msg_4',
            summaryText: 'Prepared summary',
            source: 'auto',
            thresholdTokens: 1_000,
            estimatedInputTokens: 1_250,
            createdAt: '2026-03-31T00:00:00.000Z',
            updatedAt: '2026-03-31T00:00:00.000Z',
        });
        deletePreparationBySessionMock.mockResolvedValue(undefined);

        const result = await contextCompactionPreparationCoordinator.consumePreparedCandidateIfCurrent({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            source: 'auto',
            cutoffMessageId: 'msg_4',
            sourceDigest: 'digest_a',
            thresholdTokens: 1_000,
            estimatedInputTokens: 1_250,
        });

        expect(result?.summaryText).toBe('Prepared summary');
        expect(persistAppliedCompactionMock).toHaveBeenCalledTimes(1);
    });

    it('drops stale prepared candidates before synchronous fallback', async () => {
        getPreparationMock.mockResolvedValue({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            cutoffMessageId: 'msg_3',
            sourceDigest: 'stale_digest',
            summaryText: 'Prepared summary',
            summarizerProviderId: 'openai',
            summarizerModelId: 'openai/gpt-5-mini',
            thresholdTokens: 1_000,
            estimatedInputTokens: 1_250,
            createdAt: '2026-03-31T00:00:00.000Z',
            updatedAt: '2026-03-31T00:00:00.000Z',
        });
        deletePreparationBySessionMock.mockResolvedValue(undefined);

        const result = await contextCompactionPreparationCoordinator.consumePreparedCandidateIfCurrent({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            source: 'manual',
            cutoffMessageId: 'msg_4',
            sourceDigest: 'digest_a',
            thresholdTokens: 1_000,
            estimatedInputTokens: 1_250,
        });

        expect(result).toBeNull();
        expect(deletePreparationBySessionMock).toHaveBeenCalledTimes(1);
        expect(persistAppliedCompactionMock).not.toHaveBeenCalled();
    });
});
