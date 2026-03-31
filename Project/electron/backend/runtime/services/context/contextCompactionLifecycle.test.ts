import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
    getModelCapabilitiesMock,
    getProviderAdapterMock,
    resolveRunAuthMock,
    resolveRuntimeProtocolMock,
    upsertCompactionMock,
    getPreparationMock,
    deletePreparationBySessionMock,
    resolveUtilityModelTargetMock,
    estimatePreparedContextMessagesMock,
} = vi.hoisted(() => ({
    getModelCapabilitiesMock: vi.fn(),
    getProviderAdapterMock: vi.fn(),
    resolveRunAuthMock: vi.fn(),
    resolveRuntimeProtocolMock: vi.fn(),
    upsertCompactionMock: vi.fn(),
    getPreparationMock: vi.fn(),
    deletePreparationBySessionMock: vi.fn(),
    resolveUtilityModelTargetMock: vi.fn(),
    estimatePreparedContextMessagesMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    providerStore: {
        getModelCapabilities: getModelCapabilitiesMock,
    },
    sessionContextCompactionStore: {
        upsert: upsertCompactionMock,
    },
    sessionContextCompactionPreparationStore: {
        get: getPreparationMock,
        deleteBySession: deletePreparationBySessionMock,
    },
}));

vi.mock('@/app/backend/providers/adapters', () => ({
    getProviderAdapter: getProviderAdapterMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/resolveRunAuth', () => ({
    resolveRunAuth: resolveRunAuthMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/protocol', () => ({
    resolveRuntimeProtocol: resolveRuntimeProtocolMock,
}));

vi.mock('@/app/backend/runtime/services/context/sessionContextBudgetEvaluator', () => ({
    estimatePreparedContextMessages: estimatePreparedContextMessagesMock,
}));

vi.mock('@/app/backend/runtime/services/profile/utilityModel', () => ({
    utilityModelService: {
        resolveUtilityModelTarget: resolveUtilityModelTargetMock,
    },
}));

import { compactLoadedSessionContext, selectMessagesToKeep } from '@/app/backend/runtime/services/context/contextCompactionLifecycle';

describe('contextCompactionLifecycle', () => {
    beforeEach(() => {
        getModelCapabilitiesMock.mockReset();
        getProviderAdapterMock.mockReset();
        resolveRunAuthMock.mockReset();
        resolveRuntimeProtocolMock.mockReset();
        upsertCompactionMock.mockReset();
        getPreparationMock.mockReset();
        deletePreparationBySessionMock.mockReset();
        resolveUtilityModelTargetMock.mockReset();
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
        resolveRunAuthMock.mockResolvedValue({
            isErr: () => false,
            value: {
                authMethod: 'api_key',
            },
        });
        getModelCapabilitiesMock.mockResolvedValue({
            supportsTools: true,
        });
        resolveRuntimeProtocolMock.mockResolvedValue({
            isErr: () => false,
            value: {
                runtime: { transport: 'test' },
            },
        });
        getProviderAdapterMock.mockReturnValue({
            streamCompletion: vi.fn(async (_input: unknown, callbacks: { onPart: (part: unknown) => Promise<void> }) => {
                await callbacks.onPart({
                    partType: 'text',
                    payload: {
                        text: 'Compacted summary text.',
                    },
                });
                return {
                    isErr: () => false,
                    value: undefined,
                };
            }),
        });
        getPreparationMock.mockResolvedValue(null);
        deletePreparationBySessionMock.mockResolvedValue(undefined);
        resolveUtilityModelTargetMock.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            source: 'fallback',
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
        upsertCompactionMock.mockResolvedValue({
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
        expect(upsertCompactionMock).toHaveBeenCalledTimes(1);
    });
});
