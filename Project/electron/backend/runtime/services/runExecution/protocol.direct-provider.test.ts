import { describe, expect, it } from 'vitest';

import {
    createProtocolModelCapabilities,
    createProtocolRuntimeOptions,
    protocolTestProfileId,
    resolveProviderRuntimePathContextMock,
    resolveRuntimeProtocolForTest,
} from './protocol.shared.test';

describe('resolveRuntimeProtocol direct provider routing', () => {
    it('selects the direct Anthropic runtime path for Anthropic-native models on a compatible provider path', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/claude-via-custom-endpoint',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'anthropic_messages',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.runtime.toolProtocol).toBe('anthropic_messages');
        expect(result.value.runtime.apiFamily).toBe('anthropic_messages');
        expect(result.value.transport.selected).toBe('anthropic_messages');
    });

    it('fails closed for direct Anthropic models when the provider path uses incompatible auth', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/claude-via-custom-endpoint',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'anthropic_messages',
            }),
            authMethod: 'oauth_pkce',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected incompatible direct Anthropic auth to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the direct Gemini runtime path for Gemini-native models on a compatible provider path', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValueOnce({
            isOk: () => true,
            isErr: () => false,
            value: {
                profileId: protocolTestProfileId,
                providerId: 'openai',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            },
        });

        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gemini-via-custom-endpoint',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'google_generativeai',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.runtime.toolProtocol).toBe('google_generativeai');
        expect(result.value.runtime.apiFamily).toBe('google_generativeai');
        expect(result.value.transport.selected).toBe('google_generativeai');
    });

    it('fails closed for direct Gemini models on an incompatible direct-provider path', async () => {
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
            modelId: 'openai/gemini-via-custom-endpoint',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                toolProtocol: 'google_generativeai',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected incompatible direct Gemini path to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });
});
