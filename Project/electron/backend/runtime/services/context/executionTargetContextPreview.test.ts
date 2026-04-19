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

import { okOp } from '@/app/backend/runtime/services/common/operationalError';
import { createDefaultPreparedContextModeOverrides, createDefaultPreparedContextProfileDefaults } from '@/app/backend/runtime/contracts';
import {
    resolveExecutionTargetContextPreview,
    type PreparedContextStateProjection,
} from '@/app/backend/runtime/services/context/executionTargetContextPreviewService';

describe('executionTargetContextPreviewService', () => {
    beforeEach(() => {
        resolveModeExecutionMock.mockReset();
        buildSessionSystemPreludeMock.mockReset();
    });

    it('resolves execution-target preview state through the prepared context seam', async () => {
        const prepareSessionContextMock = vi.fn(async () => okOp(preparedContextState));
        const preparedContextState: PreparedContextStateProjection = {
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
            estimate: {
                mode: 'estimated',
                providerId: 'openai',
                modelId: 'openai/gpt-5',
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
            preparedContext: {
                contributors: [],
                digest: {
                    fullDigest: 'runctx-preview',
                    contributorDigest: 'ctxcontributors-preview',
                    cacheabilityHint:
                        'Prepared context is stable until prompt layers, mode overrides, or system-owned contributors change.',
                    checkpoints: {
                        bootstrap: {
                            checkpoint: 'bootstrap',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-bootstrap-preview',
                            active: true,
                        },
                        post_compaction_reseed: {
                            checkpoint: 'post_compaction_reseed',
                            includedContributorCount: 0,
                            excludedContributorCount: 0,
                            digest: 'ctxchk-post-preview',
                            active: false,
                        },
                    },
                },
                activeContributorCount: 0,
                compactionReseedActive: false,
            },
        };

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
            value: {
                contributorSpecs: [
                    {
                        id: 'prelude',
                        kind: 'runtime_prelude',
                        group: 'runtime_environment',
                        label: 'Prelude',
                        source: {
                            kind: 'runtime',
                            key: 'prelude',
                            label: 'Prelude',
                        },
                        messages: [
                            {
                                role: 'system',
                                parts: [{ type: 'text', text: 'Prelude' }],
                            },
                        ],
                        fixedCheckpoint: 'bootstrap',
                    },
                ],
                preparedContextProfileDefaults: createDefaultPreparedContextProfileDefaults(),
                modePromptLayerOverrides: createDefaultPreparedContextModeOverrides(),
            },
        });

        const result = await resolveExecutionTargetContextPreview({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            topLevelTab: 'agent',
            modeKey: 'code',
            prompt: 'Preview the current context.',
            prepareSessionContext: prepareSessionContextMock,
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }

        expect(result.value.policy.mode).toBe('percent');
        expect(result.value.estimate?.totalTokens).toBe(123);
        expect(result.value.compaction?.summaryText).toBe('Summary');
        expect(result.value.retrievedMemory?.records).toEqual([]);
        expect(prepareSessionContextMock).toHaveBeenCalledWith(
            expect.objectContaining({
                sideEffectMode: 'preview',
            })
        );
    });
});
