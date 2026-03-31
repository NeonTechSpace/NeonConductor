import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getPreparationMock,
    persistAppliedCompactionMock,
    resolveCompactionSummarizerTargetMock,
    generateCompactionSummaryMock,
    estimatePreparedContextMessagesMock,
} = vi.hoisted(() => ({
    getPreparationMock: vi.fn(),
    persistAppliedCompactionMock: vi.fn(),
    resolveCompactionSummarizerTargetMock: vi.fn(),
    generateCompactionSummaryMock: vi.fn(),
    estimatePreparedContextMessagesMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    sessionContextCompactionPreparationStore: {
        get: getPreparationMock,
    },
}));

vi.mock('@/app/backend/runtime/services/context/sessionContextBudgetEvaluator', () => ({
    estimatePreparedContextMessages: estimatePreparedContextMessagesMock,
}));

vi.mock('@/app/backend/runtime/services/context/contextCompactionShared', async () => {
    const actual = await vi.importActual<typeof import('@/app/backend/runtime/services/context/contextCompactionShared')>(
        '@/app/backend/runtime/services/context/contextCompactionShared'
    );
    return {
        ...actual,
        resolveCompactionSummarizerTarget: resolveCompactionSummarizerTargetMock,
        generateCompactionSummary: generateCompactionSummaryMock,
    };
});

vi.mock('@/app/backend/runtime/services/context/contextCompactionPersistence', () => ({
    persistAppliedCompaction: persistAppliedCompactionMock,
}));

import { compactLoadedSessionContext, selectMessagesToKeep } from '@/app/backend/runtime/services/context/contextCompactionLifecycle';

describe('contextCompactionLifecycle', () => {
    beforeEach(() => {
        getPreparationMock.mockReset();
        persistAppliedCompactionMock.mockReset();
        resolveCompactionSummarizerTargetMock.mockReset();
        generateCompactionSummaryMock.mockReset();
        estimatePreparedContextMessagesMock.mockReset();
    });

    it('keeps enough recent messages to preserve the working window', () => {
        const selection = selectMessagesToKeep(
            Array.from({ length: 6 }, (_, index) => ({
                messageId: `msg_${index + 1}`,
                role: 'user' as const,
                parts: [],
            })),
            Array.from({ length: 6 }, () => ({ tokenCount: 500 })),
            1_000
        );

        expect(selection?.keepStartIndex).toBeGreaterThan(0);
    });

    it('compacts loaded replay context and persists the new summary', async () => {
        getPreparationMock.mockResolvedValue(null);
        resolveCompactionSummarizerTargetMock.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            source: 'fallback',
        });
        generateCompactionSummaryMock.mockResolvedValue({
            isErr: () => false,
            value: 'Compacted summary text.',
        });
        estimatePreparedContextMessagesMock.mockResolvedValueOnce({
            messages: [],
            estimate: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                mode: 'estimated',
                totalTokens: 3_000,
                parts: Array.from({ length: 6 }, () => ({ tokenCount: 500 })),
            },
        });
        estimatePreparedContextMessagesMock.mockResolvedValueOnce({
            messages: [],
            estimate: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                mode: 'estimated',
                totalTokens: 1_200,
                parts: Array.from({ length: 4 }, () => ({ tokenCount: 300 })),
            },
        });
        persistAppliedCompactionMock.mockResolvedValue({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            cutoffMessageId: 'msg_4',
            summaryText: 'Compacted summary text.',
            source: 'auto',
            thresholdTokens: 1_000,
            estimatedInputTokens: 3_000,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        });

        const result = await compactLoadedSessionContext({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            source: 'auto',
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
                mode: 'percent',
                thresholdTokens: 1_000,
                usableInputBudgetTokens: 2_000,
                percent: 10,
                safetyBufferTokens: 1_000,
            },
            replayMessages: Array.from({ length: 6 }, (_, index) => ({
                messageId: `msg_${index + 1}`,
                role: 'user' as const,
                parts: [{ type: 'text', text: `Message ${index + 1}` }],
            })),
            existingCompaction: null,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value.compacted).toBe(true);
        expect(result.value.state.compaction?.summaryText).toBe('Compacted summary text.');
        expect(persistAppliedCompactionMock).toHaveBeenCalledTimes(1);
    });

    it('persists manual compaction through the shared persistence seam', async () => {
        getPreparationMock.mockResolvedValue(null);
        resolveCompactionSummarizerTargetMock.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            source: 'fallback',
        });
        generateCompactionSummaryMock.mockResolvedValue({
            isErr: () => false,
            value: 'Manual summary text.',
        });
        estimatePreparedContextMessagesMock.mockResolvedValueOnce({
            messages: [],
            estimate: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                mode: 'estimated',
                totalTokens: 3_000,
                parts: Array.from({ length: 6 }, () => ({ tokenCount: 500 })),
            },
        });
        estimatePreparedContextMessagesMock.mockResolvedValueOnce({
            messages: [],
            estimate: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                mode: 'estimated',
                totalTokens: 1_200,
                parts: Array.from({ length: 4 }, () => ({ tokenCount: 300 })),
            },
        });
        persistAppliedCompactionMock.mockResolvedValue({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            cutoffMessageId: 'msg_4',
            summaryText: 'Manual summary text.',
            source: 'manual',
            thresholdTokens: 1_000,
            estimatedInputTokens: 3_000,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
        });

        const result = await compactLoadedSessionContext({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            source: 'manual',
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
                mode: 'percent',
                thresholdTokens: 1_000,
                usableInputBudgetTokens: 2_000,
                percent: 10,
                safetyBufferTokens: 1_000,
            },
            replayMessages: Array.from({ length: 6 }, (_, index) => ({
                messageId: `msg_${index + 1}`,
                role: 'user' as const,
                parts: [{ type: 'text', text: `Message ${index + 1}` }],
            })),
            existingCompaction: null,
        });

        expect(result.isOk()).toBe(true);
        expect(persistAppliedCompactionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'manual',
                summaryText: 'Manual summary text.',
            })
        );
    });
});
