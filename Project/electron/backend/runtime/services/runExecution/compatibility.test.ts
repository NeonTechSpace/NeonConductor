import { beforeEach, describe, expect, it, vi } from 'vitest';

const providerStoreMock = vi.hoisted(() => ({
    getModelReadState: vi.fn(),
}));

const getExecutionPreferenceStateMock = vi.hoisted(() => vi.fn());
const resolveRunAuthMock = vi.hoisted(() => vi.fn());
const resolveRuntimeProtocolMock = vi.hoisted(() => vi.fn());

vi.mock('@/app/backend/persistence/stores', () => ({
    providerStore: providerStoreMock,
}));

vi.mock('@/app/backend/providers/service/executionPreferences', () => ({
    getExecutionPreferenceState: getExecutionPreferenceStateMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/resolveRunAuth', () => ({
    resolveRunAuth: resolveRunAuthMock,
}));

vi.mock('@/app/backend/runtime/services/runExecution/protocol', () => ({
    resolveRuntimeProtocol: resolveRuntimeProtocolMock,
}));

import { prepareRunnableCandidate } from '@/app/backend/runtime/services/runExecution/compatibility';
import { createDefaultPreparedContextModeOverrides } from '@/app/backend/runtime/contracts';

function createModeDefinition() {
    return {
        id: 'mode_chat',
        profileId: 'profile_default',
        topLevelTab: 'chat',
        modeKey: 'chat',
        authoringRole: 'chat',
        roleTemplate: 'chat/default',
        internalModelRole: 'chat',
        delegatedOnly: false,
        sessionSelectable: true,
        label: 'Chat',
        assetKey: 'mode.chat',
        prompt: {},
        promptLayerOverrides: createDefaultPreparedContextModeOverrides(),
        executionPolicy: {
            authoringRole: 'chat',
            roleTemplate: 'chat/default',
            internalModelRole: 'chat',
            delegatedOnly: false,
            sessionSelectable: true,
            planningOnly: false,
        },
        source: 'test',
        sourceKind: 'system_seed',
        scope: 'system',
        enabled: true,
        precedence: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
    } as const;
}

function createModelCapabilities(input?: {
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsRealtimeWebSocket?: boolean;
}) {
    return {
        features: {
            supportsTools: input?.supportsTools ?? true,
            supportsReasoning: true,
            supportsVision: input?.supportsVision ?? true,
            supportsAudioInput: false,
            supportsAudioOutput: false,
            inputModalities: ['text'],
            outputModalities: ['text'],
        },
        runtime: {
            toolProtocol: 'openai_responses',
            apiFamily: 'openai_compatible',
            ...(input?.supportsRealtimeWebSocket !== undefined
                ? { supportsRealtimeWebSocket: input.supportsRealtimeWebSocket }
                : {}),
        },
    } as const;
}

function createModelReadState(input?: {
    supportsTools?: boolean;
    supportsVision?: boolean;
    supportsRealtimeWebSocket?: boolean;
}) {
    return {
        kind: 'valid',
        model: {
            id: 'openai/gpt-test',
            providerId: 'openai',
            label: 'GPT Test',
            features: createModelCapabilities(input).features,
            runtime: createModelCapabilities(input).runtime,
            source: 'test',
            updatedAt: '2026-01-01T00:00:00.000Z',
        },
    } as const;
}

describe('prepareRunnableCandidate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        resolveRunAuthMock.mockResolvedValue({
            isOk: () => true,
            isErr: () => false,
            value: {
                authMethod: 'api_key',
                apiKey: 'test-key',
            },
        });
        providerStoreMock.getModelReadState.mockResolvedValue(createModelReadState());
        getExecutionPreferenceStateMock.mockResolvedValue({
            isOk: () => true,
            isErr: () => false,
            value: {
                providerId: 'openai',
                mode: 'realtime_websocket',
                canUseRealtimeWebSocket: true,
            },
        });
    });

    it('passes full protocol inputs into protocol resolution for OpenAI candidates', async () => {
        resolveRuntimeProtocolMock.mockResolvedValue({
            isOk: () => true,
            isErr: () => false,
            value: {
                runtime: createModelCapabilities({ supportsRealtimeWebSocket: true }).runtime,
                transport: {
                    requested: 'auto',
                    selected: 'openai_responses',
                    degraded: false,
                },
            },
        });

        const result = await prepareRunnableCandidate({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
            topLevelTab: 'chat',
            mode: createModeDefinition(),
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
        });

        expect(result.isOk()).toBe(true);
        expect(resolveRuntimeProtocolMock).toHaveBeenCalledWith(
            expect.objectContaining({
                topLevelTab: 'chat',
                openAIExecutionMode: 'realtime_websocket',
            })
        );
    });

    it('returns a vision incompatibility before protocol resolution when attachments need vision support', async () => {
        providerStoreMock.getModelReadState.mockResolvedValue(
            createModelReadState({
                supportsVision: false,
            })
        );

        const result = await prepareRunnableCandidate({
            profileId: 'profile_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-vision',
            topLevelTab: 'chat',
            mode: createModeDefinition(),
            runtimeOptions: {
                reasoning: {
                    effort: 'medium',
                    summary: 'auto',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'auto',
                },
            },
            attachments: [
                {
                    clientId: 'img-test',
                    mimeType: 'image/png',
                    bytesBase64: 'test',
                    width: 1,
                    height: 1,
                    sha256: 'sha',
                },
            ],
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.kind).toBe('incompatible');
        if (result.value.kind !== 'incompatible') {
            throw new Error('Expected incompatible candidate.');
        }
        expect(result.value.error.action).toEqual({
            code: 'model_vision_required',
            providerId: 'openai',
            modelId: 'openai/gpt-5-no-vision',
        });
        expect(resolveRuntimeProtocolMock).not.toHaveBeenCalled();
    });
});
