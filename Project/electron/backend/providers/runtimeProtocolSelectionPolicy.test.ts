import { describe, expect, it, vi, beforeEach } from 'vitest';

const { resolveProviderRuntimePathContextMock } = vi.hoisted(() => ({
    resolveProviderRuntimePathContextMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/runtimePathContext', () => ({
    resolveProviderRuntimePathContext: resolveProviderRuntimePathContextMock,
}));

import { runtimeProtocolSelectionDefinitions } from '@/app/backend/providers/runtimeProtocolSelectionPolicy';

describe('runtimeProtocolSelectionPolicy', () => {
    beforeEach(() => {
        resolveProviderRuntimePathContextMock.mockReset();
    });

    it('keeps realtime websocket locked to official OpenAI paths', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValue({
            isErr: () => false,
            value: {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            },
        });

        const result = await runtimeProtocolSelectionDefinitions.openai_responses.resolveProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'gpt-4.1',
            modelCapabilities: {
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: true,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'openai_responses',
                    apiFamily: 'openai_compatible',
                    supportsRealtimeWebSocket: true,
                },
            },
            authMethod: 'api_key',
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
            topLevelTab: 'agent',
            openAIExecutionMode: 'realtime_websocket',
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.transport.selected).toBe('openai_realtime_websocket');
    });

    it('resolves supported Kilo routed families through the gateway path', async () => {
        const result = await runtimeProtocolSelectionDefinitions.kilo_gateway.resolveProtocol({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'kilo/native',
            modelCapabilities: {
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
                runtime: {
                    toolProtocol: 'kilo_gateway',
                    apiFamily: 'kilo_gateway',
                    routedApiFamily: 'openai_compatible',
                },
            },
            authMethod: 'api_key',
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
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.transport.selected).toBe('kilo_gateway');
    });
});
