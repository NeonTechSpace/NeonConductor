import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ok } from 'neverthrow';

const {
    listModelsMock,
    modelExistsMock,
    getModelCapabilitiesMock,
    getThreadBySessionIdMock,
    renameThreadMock,
    listRunsBySessionMock,
    getStringOptionalMock,
    resolveUtilityModelTargetMock,
    resolveRunAuthMock,
    resolveRuntimeProtocolMock,
    streamCompletionMock,
    warnMock,
} = vi.hoisted(() => ({
    listModelsMock: vi.fn(),
    modelExistsMock: vi.fn(),
    getModelCapabilitiesMock: vi.fn(),
    getThreadBySessionIdMock: vi.fn(),
    renameThreadMock: vi.fn(),
    listRunsBySessionMock: vi.fn(),
    getStringOptionalMock: vi.fn(),
    resolveUtilityModelTargetMock: vi.fn(),
    resolveRunAuthMock: vi.fn(),
    resolveRuntimeProtocolMock: vi.fn(),
    streamCompletionMock: vi.fn(),
    warnMock: vi.fn(),
}));

vi.mock('@/app/backend/persistence/stores', () => ({
    providerStore: {
        listModels: listModelsMock,
        modelExists: modelExistsMock,
        getModelCapabilities: getModelCapabilitiesMock,
    },
    runStore: {
        listBySession: listRunsBySessionMock,
    },
    settingsStore: {
        getStringOptional: getStringOptionalMock,
    },
    threadStore: {
        getBySessionId: getThreadBySessionIdMock,
        rename: renameThreadMock,
    },
}));

vi.mock('@/app/backend/providers/adapters', () => ({
    getProviderAdapter: () => ({
        streamCompletion: streamCompletionMock,
    }),
}));

vi.mock('@/app/backend/runtime/services/profile/utilityModel', () => ({
    utilityModelService: {
        resolveUtilityModelTarget: resolveUtilityModelTargetMock,
    },
}));

vi.mock('@/app/backend/runtime/services/runExecution/resolveRunAuth', () => ({
    resolveRunAuth: resolveRunAuthMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/protocol', () => ({
    resolveRuntimeProtocol: resolveRuntimeProtocolMock,
}));

vi.mock('@/app/main/logging', () => ({
    appLog: {
        warn: warnMock,
    },
}));

import { threadTitleService } from '@/app/backend/runtime/services/threadTitle/service';

describe('threadTitleService', () => {
    beforeEach(() => {
        listModelsMock.mockReset();
        modelExistsMock.mockReset();
        getModelCapabilitiesMock.mockReset();
        getThreadBySessionIdMock.mockReset();
        renameThreadMock.mockReset();
        listRunsBySessionMock.mockReset();
        getStringOptionalMock.mockReset();
        resolveUtilityModelTargetMock.mockReset();
        resolveRunAuthMock.mockReset();
        resolveRuntimeProtocolMock.mockReset();
        streamCompletionMock.mockReset();
        warnMock.mockReset();
    });

    function arrangeCommonTitleMocks() {
        getThreadBySessionIdMock.mockResolvedValue({
            thread: {
                id: 'thr_test',
                title: 'New Chat',
            },
        });
        modelExistsMock.mockResolvedValue(true);
        listRunsBySessionMock.mockResolvedValue([{ id: 'run_1' }]);
        getStringOptionalMock.mockResolvedValue('ai_optional');
        listModelsMock.mockResolvedValue([{ id: 'openai/gpt-5', label: 'GPT-5' }]);
        renameThreadMock.mockResolvedValue(ok(undefined));
        resolveRunAuthMock.mockResolvedValue(
            ok({
                authMethod: 'api_key',
            })
        );
        getModelCapabilitiesMock.mockResolvedValue({
            features: {
                supportsTools: false,
                supportsReasoning: false,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            runtime: {
                toolProtocol: 'openai_responses',
                apiFamily: 'openai_compatible',
            },
        });
        resolveRuntimeProtocolMock.mockResolvedValue(
            ok({
                runtime: {
                    toolProtocol: 'openai_responses',
                    apiFamily: 'openai_compatible',
                },
            })
        );
        streamCompletionMock.mockImplementation(async (_input, handlers) => {
            await handlers.onPart({
                partType: 'text',
                payload: {
                    text: 'Utility Generated Title',
                },
            });
            return ok(undefined);
        });
    }

    it('uses the Utility AI target for optional AI naming when available', async () => {
        arrangeCommonTitleMocks();
        resolveUtilityModelTargetMock.mockResolvedValue({
            providerId: 'zai',
            modelId: 'zai/glm-4.5-air',
            source: 'utility',
        });

        await threadTitleService.maybeApply({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            prompt: 'Investigate compaction behavior.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        expect(resolveUtilityModelTargetMock).toHaveBeenCalledWith({
            profileId: 'profile_test',
            fallbackProviderId: 'openai',
            fallbackModelId: 'openai/gpt-5',
        });
        expect(streamCompletionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                providerId: 'zai',
                modelId: 'zai/glm-4.5-air',
            }),
            expect.any(Object)
        );
        expect(renameThreadMock).toHaveBeenNthCalledWith(
            2,
            'profile_test',
            'thr_test',
            'Utility Generated Title'
        );
    });

    it('falls back to the active run model when Utility AI is unavailable', async () => {
        arrangeCommonTitleMocks();
        resolveUtilityModelTargetMock.mockResolvedValue({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            source: 'fallback',
        });

        await threadTitleService.maybeApply({
            profileId: 'profile_test',
            sessionId: 'sess_test',
            prompt: 'Investigate compaction behavior.',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
        });

        expect(streamCompletionMock).toHaveBeenCalledWith(
            expect.objectContaining({
                providerId: 'openai',
                modelId: 'openai/gpt-5',
            }),
            expect.any(Object)
        );
        expect(renameThreadMock).toHaveBeenCalledTimes(2);
    });
});
