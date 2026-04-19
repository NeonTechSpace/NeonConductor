import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    createDefaultPreparedContextModeOverrides,
    createDefaultPreparedContextProfileDefaults,
} from '@/app/backend/runtime/contracts';

const {
    loadSessionReplaySnapshotMock,
    resolvePolicyMock,
    loadRetrievedMemoryInjectionMock,
    buildPreparedContextMessagesMock,
    buildPreparedContextDigestMock,
    estimatePreparedContextMessagesMock,
    assessContextBudgetMock,
    shouldPrepareMock,
    schedulePreparationMock,
    compactLoadedSessionContextMock,
} = vi.hoisted(() => ({
    loadSessionReplaySnapshotMock: vi.fn(),
    resolvePolicyMock: vi.fn(),
    loadRetrievedMemoryInjectionMock: vi.fn(),
    buildPreparedContextMessagesMock: vi.fn(),
    buildPreparedContextDigestMock: vi.fn(),
    estimatePreparedContextMessagesMock: vi.fn(),
    assessContextBudgetMock: vi.fn(),
    shouldPrepareMock: vi.fn(),
    schedulePreparationMock: vi.fn(),
    compactLoadedSessionContextMock: vi.fn(),
}));

vi.mock('@/app/backend/runtime/services/context/sessionReplayLoader', async (importOriginal) => {
    const actual =
        await importOriginal<typeof import('@/app/backend/runtime/services/context/sessionReplayLoader')>();
    return {
        ...actual,
        loadSessionReplaySnapshot: loadSessionReplaySnapshotMock,
    };
});

vi.mock('@/app/backend/runtime/services/context/policyService', () => ({
    contextPolicyService: {
        resolvePolicy: resolvePolicyMock,
    },
}));

vi.mock('@/app/backend/runtime/services/context/retrievedMemoryInjection', () => ({
    loadRetrievedMemoryInjection: loadRetrievedMemoryInjectionMock,
}));

vi.mock('@/app/backend/runtime/services/context/preparedContextMessageBuilder', () => ({
    buildPreparedContextMessages: buildPreparedContextMessagesMock,
    buildPreparedContextDigest: buildPreparedContextDigestMock,
}));

vi.mock('@/app/backend/runtime/services/context/sessionContextBudgetEvaluator', () => ({
    estimatePreparedContextMessages: estimatePreparedContextMessagesMock,
    assessContextBudget: assessContextBudgetMock,
}));

vi.mock('@/app/backend/runtime/services/context/contextCompactionPreparationCoordinator', () => ({
    contextCompactionPreparationCoordinator: {
        shouldPrepare: shouldPrepareMock,
        schedulePreparation: schedulePreparationMock,
    },
}));

vi.mock('@/app/backend/runtime/services/context/contextCompactionLifecycle', () => ({
    compactLoadedSessionContext: compactLoadedSessionContextMock,
}));

import { sessionContextService } from '@/app/backend/runtime/services/context/sessionContextService';

describe('sessionContextService', () => {
    beforeEach(() => {
        loadSessionReplaySnapshotMock.mockReset();
        resolvePolicyMock.mockReset();
        loadRetrievedMemoryInjectionMock.mockReset();
        buildPreparedContextMessagesMock.mockReset();
        buildPreparedContextDigestMock.mockReset();
        estimatePreparedContextMessagesMock.mockReset();
        assessContextBudgetMock.mockReset();
        shouldPrepareMock.mockReset();
        schedulePreparationMock.mockReset();
        compactLoadedSessionContextMock.mockReset();

        loadSessionReplaySnapshotMock.mockResolvedValue({
            replayMessages: [],
            compaction: null,
            hasMultimodalContent: false,
        });
        resolvePolicyMock.mockResolvedValue({
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
        });
        loadRetrievedMemoryInjectionMock.mockResolvedValue({
            messages: [],
            summary: undefined,
        });
        buildPreparedContextMessagesMock.mockReturnValue([
            {
                role: 'user',
                parts: [{ type: 'text', text: 'Prepared context' }],
            },
        ]);
        buildPreparedContextDigestMock.mockReturnValue('digest_prepared');
        estimatePreparedContextMessagesMock.mockResolvedValue({
            estimate: {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                mode: 'estimated',
                totalTokens: 900,
                parts: [],
            },
        });
        assessContextBudgetMock.mockReturnValue({
            overUsableBudget: false,
        });
        shouldPrepareMock.mockReturnValue(true);
        schedulePreparationMock.mockResolvedValue(undefined);
    });

    it('does not schedule background preparation in preview mode', async () => {
        const result = await sessionContextService.prepareSessionContext({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            systemContributorSpecs: [],
            attachedSkillfiles: [],
            preparedContextProfileDefaults: createDefaultPreparedContextProfileDefaults(),
            modePromptLayerOverrides: createDefaultPreparedContextModeOverrides(),
            prompt: 'Preview prompt',
            topLevelTab: 'agent',
            modeKey: 'code',
            sideEffectMode: 'preview',
        });

        expect(result.isOk()).toBe(true);
        expect(schedulePreparationMock).not.toHaveBeenCalled();
    });

    it('still schedules background preparation in execution mode', async () => {
        const result = await sessionContextService.prepareSessionContext({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            systemContributorSpecs: [],
            attachedSkillfiles: [],
            preparedContextProfileDefaults: createDefaultPreparedContextProfileDefaults(),
            modePromptLayerOverrides: createDefaultPreparedContextModeOverrides(),
            prompt: 'Execution prompt',
            topLevelTab: 'agent',
            modeKey: 'code',
            sideEffectMode: 'execution',
        });

        expect(result.isOk()).toBe(true);
        expect(schedulePreparationMock).toHaveBeenCalledWith(
            expect.objectContaining({
                profileId: 'profile_test',
                sessionId: 'sess_test',
            })
        );
    });
});
