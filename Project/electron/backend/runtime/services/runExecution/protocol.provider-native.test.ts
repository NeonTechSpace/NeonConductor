import { describe, expect, it } from 'vitest';

import {
    createProtocolModelCapabilities,
    createProtocolRuntimeOptions,
    protocolTestProfileId,
    resolveProviderNativeRuntimeSpecializationMock,
    resolveRuntimeProtocolForTest,
} from './protocol.shared.test';

describe('resolveRuntimeProtocol provider-native routing', () => {
    it('fails closed for provider-native models on an incompatible provider path', async () => {
        resolveProviderNativeRuntimeSpecializationMock.mockResolvedValueOnce(null);

        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/minimax-native',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text'],
                outputModalities: ['text'],
                toolProtocol: 'provider_native',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected provider-native protocol to fail without a specialization.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the provider-native specialization when the provider path is MiniMax-compatible', async () => {
        resolveProviderNativeRuntimeSpecializationMock.mockResolvedValueOnce({
            id: 'minimax_openai_compat',
            providerId: 'openai',
            matchContext: () => 'trusted',
            transportSelection: 'provider_native',
            buildRequest: () => {
                throw new Error('not needed in protocol test');
            },
            createStreamState: () => ({}),
            parseStreamEvent: () => {
                throw new Error('not needed in protocol test');
            },
            finalizeStream: () => {
                throw new Error('not needed in protocol test');
            },
            parseNonStreamPayload: () => {
                throw new Error('not needed in protocol test');
            },
        });

        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/minimax-native',
            modelCapabilities: createProtocolModelCapabilities({
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text'],
                outputModalities: ['text'],
                toolProtocol: 'provider_native',
            }),
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value.runtime.toolProtocol).toBe('provider_native');
        expect(result.value.transport.selected).toBe('provider_native');
    });

    it('fails closed when a model is missing runtime protocol metadata', async () => {
        const result = await resolveRuntimeProtocolForTest({
            profileId: protocolTestProfileId,
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: {
                features: {
                    supportsTools: true,
                    supportsReasoning: true,
                    supportsVision: true,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text', 'image'],
                    outputModalities: ['text'],
                },
            } as never,
            authMethod: 'api_key',
            runtimeOptions: createProtocolRuntimeOptions(),
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing runtime protocol metadata to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });
});
