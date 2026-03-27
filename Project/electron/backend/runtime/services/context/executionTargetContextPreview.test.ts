import { beforeEach, describe, expect, it, vi } from 'vitest';

const { resolveModeExecutionMock, buildSessionSystemPreludeMock } = vi.hoisted(() => ({
    resolveModeExecutionMock: vi.fn(),
    buildSessionSystemPreludeMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/runExecution/mode', () => ({
    resolveModeExecution: resolveModeExecutionMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/contextPrelude', () => ({
    buildSessionSystemPrelude: buildSessionSystemPreludeMock,
}));

import { resolveExecutionTargetContextPreview } from '@/app/backend/runtime/services/context/executionTargetContextPreviewService';

describe('executionTargetContextPreviewService', () => {
    beforeEach(() => {
        resolveModeExecutionMock.mockReset();
        buildSessionSystemPreludeMock.mockReset();
    });

    it('resolves execution-target preview state through the prepared context seam', async () => {
        resolveModeExecutionMock.mockResolvedValue({
            isErr: () => false,
            value: {
                mode: {
                    modeKey: 'code',
                },
            },
        });
        buildSessionSystemPreludeMock.mockResolvedValue({
            isErr: () => false,
            value: [
                {
                    role: 'system',
                    parts: [{ type: 'text', text: 'Prelude' }],
                },
            ],
        });

        const result = await resolveExecutionTargetContextPreview({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            topLevelTab: 'agent',
            modeKey: 'code',
            prompt: 'Preview the current context.',
            prepareSessionContext: vi.fn(async () => ({
                isErr: () => false,
                value: {
                    policy: {
                        enabled: true,
                        profileId: 'profile_test',
                        providerId: 'openai',
                        modelId: 'openai/gpt-5',
                        limits: {
                            modelLimitsKnown: true,
                            contextLength: 10_000,
                            maxOutputTokens: 2_000,
                            source: 'test',
                        },
                        mode: 'percent',
                        thresholdTokens: 1_000,
                        usableInputBudgetTokens: 2_000,
                        percent: 10,
                        safetyBufferTokens: 1_000,
                    },
                    estimate: {
                        mode: 'estimated',
                        totalTokens: 123,
                        parts: [],
                    },
                    compaction: {
                        profileId: 'profile_test',
                        sessionId: 'sess_test',
                        cutoffMessageId: 'msg_1',
                        summaryText: 'Summary',
                        source: 'manual',
                        thresholdTokens: 1_000,
                        estimatedInputTokens: 123,
                        createdAt: '2026-01-01T00:00:00.000Z',
                        updatedAt: '2026-01-01T00:00:00.000Z',
                    },
                    retrievedMemory: {
                        records: [],
                        injectedTextLength: 0,
                    },
                },
            })),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value.policy.mode).toBe('percent');
        expect(result.value.estimate?.totalTokens).toBe(123);
        expect(result.value.compaction?.summaryText).toBe('Summary');
        expect(result.value.retrievedMemory?.records).toEqual([]);
    });
});
