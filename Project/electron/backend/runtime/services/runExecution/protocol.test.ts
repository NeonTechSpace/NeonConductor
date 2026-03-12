import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resolveRuntimeProtocol } from '@/app/backend/runtime/services/runExecution/protocol';

const { resolveProviderNativeRuntimeSpecializationMock, resolveProviderRuntimePathContextMock } = vi.hoisted(() => ({
    resolveProviderNativeRuntimeSpecializationMock: vi.fn(),
    resolveProviderRuntimePathContextMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/adapters/providerNative', () => ({
    resolveProviderNativeRuntimeSpecialization: resolveProviderNativeRuntimeSpecializationMock,
}));

vi.mock('@/app/backend/providers/runtimePathContext', () => ({
    resolveProviderRuntimePathContext: resolveProviderRuntimePathContextMock,
}));

describe('resolveRuntimeProtocol', () => {
    beforeEach(() => {
        resolveProviderNativeRuntimeSpecializationMock.mockReset();
        resolveProviderRuntimePathContextMock.mockReset();
        resolveProviderRuntimePathContextMock.mockResolvedValue({
            isOk: () => true,
            isErr: () => false,
            value: {
                profileId: 'profile_local_default',
                providerId: 'openai',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.anthropic.com/v1',
            },
        });
    });

    it('selects the responses path for responses-protocol models', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                supportsPromptCache: true,
                toolProtocol: 'openai_responses',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
        expect(result.value.toolProtocol).toBe('openai_responses');
        expect(result.value.transport.selected).toBe('openai_responses');
    });

    it('rejects explicit chat transport for responses-only models', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_responses',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
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
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'moonshot',
            modelId: 'moonshot/kimi-latest',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'openai_chat_completions',
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
        expect(result.value.toolProtocol).toBe('openai_chat_completions');
        expect(result.value.transport.selected).toBe('openai_chat_completions');
    });

    it('rejects OpenAI transport overrides for kilo gateway models', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'kilo/auto',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: 'openai_compatible',
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
                    includeEncrypted: false,
                },
                cache: {
                    strategy: 'auto',
                },
                transport: {
                    family: 'openai_responses',
                },
            },
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected Kilo transport override to fail.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the kilo transport for routed Anthropic gateway models', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'anthropic/claude-sonnet-4.5',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: 'anthropic_messages',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
        expect(result.value.toolProtocol).toBe('kilo_gateway');
        expect(result.value.routedApiFamily).toBe('anthropic_messages');
        expect(result.value.transport.selected).toBe('kilo_gateway');
    });

    it('fails closed for Kilo gateway models that are missing routed family metadata', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'kilo/auto',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing Kilo routed family metadata to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the kilo transport for routed Gemini gateway models', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'kilo',
            modelId: 'google/gemini-2.5-pro',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'kilo_gateway',
                apiFamily: 'kilo_gateway',
                routedApiFamily: 'google_generativeai',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
        expect(result.value.toolProtocol).toBe('kilo_gateway');
        expect(result.value.routedApiFamily).toBe('google_generativeai');
        expect(result.value.transport.selected).toBe('kilo_gateway');
    });

    it('fails closed for provider-native models on an incompatible provider path', async () => {
        resolveProviderNativeRuntimeSpecializationMock.mockResolvedValueOnce(null);

        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/minimax-native',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'provider_native',
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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

        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/minimax-native',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: false,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'provider_native',
                inputModalities: ['text'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
        expect(result.value.toolProtocol).toBe('provider_native');
        expect(result.value.transport.selected).toBe('provider_native');
    });

    it('fails closed when a model is missing runtime protocol metadata', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected missing runtime protocol metadata to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });

    it('selects the direct Anthropic runtime path for Anthropic-native models on a compatible provider path', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/claude-via-custom-endpoint',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'anthropic_messages',
                apiFamily: 'anthropic_messages',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
        expect(result.value.toolProtocol).toBe('anthropic_messages');
        expect(result.value.apiFamily).toBe('anthropic_messages');
        expect(result.value.transport.selected).toBe('anthropic_messages');
    });

    it('fails closed for direct Anthropic models when the provider path uses incompatible auth', async () => {
        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/claude-via-custom-endpoint',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'anthropic_messages',
                apiFamily: 'anthropic_messages',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'oauth_pkce',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
                profileId: 'profile_local_default',
                providerId: 'openai',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            },
        });

        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/gemini-via-custom-endpoint',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'google_generativeai',
                apiFamily: 'google_generativeai',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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
        expect(result.value.toolProtocol).toBe('google_generativeai');
        expect(result.value.apiFamily).toBe('google_generativeai');
        expect(result.value.transport.selected).toBe('google_generativeai');
    });

    it('fails closed for direct Gemini models on an incompatible direct-provider path', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValueOnce({
            isOk: () => true,
            isErr: () => false,
            value: {
                profileId: 'profile_local_default',
                providerId: 'openai',
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            },
        });

        const result = await resolveRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/gemini-via-custom-endpoint',
            modelCapabilities: {
                supportsTools: true,
                supportsReasoning: true,
                supportsVision: true,
                supportsAudioInput: false,
                supportsAudioOutput: false,
                toolProtocol: 'google_generativeai',
                apiFamily: 'google_generativeai',
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
            },
            authMethod: 'api_key',
            runtimeOptions: {
                reasoning: {
                    effort: 'none',
                    summary: 'none',
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

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected incompatible direct Gemini path to fail closed.');
        }
        expect(result.error.code).toBe('runtime_option_invalid');
    });
});
