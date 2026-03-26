import { describe, expect, it } from 'vitest';

import {
    createProtocolModelCapabilities,
    createProtocolRuntimeOptions,
    protocolTestProfileId,
    resolveProviderRuntimePathContextMock,
    resolveRuntimeProtocolForTest,
} from '@/app/backend/runtime/services/runExecution/protocol.shared.test';

describe('resolveRuntimeProtocol openai transports', () => {
    it('selects the responses path for responses-protocol models', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                supportsPromptCache: true,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.runtime.toolProtocol).toBe('openai_responses');
        expect(result.value.transport.selected).toBe('openai_responses');
    });

    it('rejects explicit chat transport for responses-only models', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'openai_responses',
            }),
            authMethod: 'api_key',
            runtimeOptions: {
                ...createProtocolRuntimeOptions(),
                transport: {
                    family: 'openai_chat_completions',
                },
            },
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected responses-only transport mismatch to fail.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the chat-completions path for chat-protocol models', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'moonshot',
            modelId: 'moonshot/kimi-latest',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text'],
                outputModalities: ['text'],
                toolProtocol: 'openai_chat_completions',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.runtime.toolProtocol).toBe('openai_chat_completions');
        expect(result.value.transport.selected).toBe('openai_chat_completions');
    });

    it('selects the OpenAI realtime websocket transport for docs-confirmed OpenAI models outside the realtime family', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValueOnce({
            isOk: () => true,
            isErr: () => false,
            value: {
                profileId: protocolTestProfileId,
                providerId: 'openai',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            },
        });

        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5.4',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                supportsRealtimeWebSocket: true,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            }),
            authMethod: 'api_key',
            topLevelTab: 'agent',
            openAIExecutionMode: 'realtime_websocket',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.transport.selected).toBe('openai_realtime_websocket');
    });

    it('rejects OpenAI realtime websocket mode for chat runs', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                supportsRealtimeWebSocket: true,
                inputModalities: ['text'],
                outputModalities: ['text'],
            }),
            authMethod: 'api_key',
            topLevelTab: 'chat',
            openAIExecutionMode: 'realtime_websocket',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected chat-mode realtime websocket selection to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
        expect(result.error.action).toMatchObject({
            code: 'runtime_options_invalid',
            detail: 'chat_mode_not_supported',
        });
    });

    it('rejects OpenAI realtime websocket mode when auth is not API-key based', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                supportsRealtimeWebSocket: true,
                inputModalities: ['text'],
                outputModalities: ['text'],
            }),
            authMethod: 'oauth_pkce',
            topLevelTab: 'agent',
            openAIExecutionMode: 'realtime_websocket',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected non-API-key realtime websocket selection to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
        expect(result.error.action).toMatchObject({
            code: 'runtime_options_invalid',
            detail: 'api_key_required',
        });
    });

    it('rejects OpenAI realtime websocket mode for non-OpenAI providers', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'moonshot',
            modelId: 'moonshot/kimi-k2-turbo-preview',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                supportsRealtimeWebSocket: true,
                inputModalities: ['text'],
                outputModalities: ['text'],
            }),
            authMethod: 'api_key',
            topLevelTab: 'agent',
            openAIExecutionMode: 'realtime_websocket',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected non-OpenAI realtime websocket selection to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
        expect(result.error.action).toMatchObject({
            code: 'runtime_options_invalid',
            detail: 'provider_not_supported',
        });
    });

    it('rejects OpenAI realtime websocket mode for custom base URLs', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValueOnce({
            isOk: () => true,
            isErr: () => false,
            value: {
                profileId: protocolTestProfileId,
                providerId: 'openai',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://custom-openai-gateway.example/v1',
            },
        });

        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-realtime',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                supportsRealtimeWebSocket: true,
                inputModalities: ['text'],
                outputModalities: ['text'],
            }),
            authMethod: 'api_key',
            topLevelTab: 'agent',
            openAIExecutionMode: 'realtime_websocket',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected custom-base realtime websocket selection to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
        expect(result.error.action).toMatchObject({
            code: 'runtime_options_invalid',
            detail: 'base_url_not_supported',
        });
    });

    it('rejects OpenAI realtime websocket mode for non-realtime-capable models', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValueOnce({
            isOk: () => true,
            isErr: () => false,
            value: {
                profileId: protocolTestProfileId,
                providerId: 'openai',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            },
        });

        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                supportsRealtimeWebSocket: false,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            }),
            authMethod: 'api_key',
            topLevelTab: 'agent',
            openAIExecutionMode: 'realtime_websocket',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected non-realtime-capable model to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
        expect(result.error.action).toMatchObject({
            code: 'runtime_options_invalid',
            detail: 'model_not_realtime_capable',
        });
    });
});

