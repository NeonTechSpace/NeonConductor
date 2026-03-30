import { describe, expect, it, vi, beforeEach } from 'vitest';

const { resolveProviderRuntimePathContextMock } = vi.hoisted(() => ({
    resolveProviderRuntimePathContextMock: vi.fn(),
}));

vi.mock('@/app/backend/providers/runtimePathContext', () => ({
    resolveProviderRuntimePathContext: resolveProviderRuntimePathContextMock,
}));

import {
    resolveDirectAnthropicRuntimeProtocol,
    resolveDirectGeminiRuntimeProtocol,
    supportsAnthropicCatalogRuntimeFamily,
} from '@/app/backend/providers/directRuntimeEligibilityPolicy';

describe('directRuntimeEligibilityPolicy', () => {
    beforeEach(() => {
        resolveProviderRuntimePathContextMock.mockReset();
    });

    it('uses base-url truth for Anthropic catalog eligibility', () => {
        expect(
            supportsAnthropicCatalogRuntimeFamily({
                providerId: 'openai',
                model: {
                    providerId: 'openai',
                    modelId: 'openai/claude',
                    label: 'Claude',
                    source: 'provider_api',
                    updatedAt: '2026-03-30T00:00:00.000Z',
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
                        toolProtocol: 'anthropic_messages',
                        apiFamily: 'anthropic_messages',
                    },
                },
                context: {
                    providerId: 'openai',
                    optionProfileId: 'default',
                    resolvedBaseUrl: 'https://api.anthropic.com/v1',
                },
            })
        ).toBe(true);
    });

    it('fails closed when a Gemini direct path resolves to a non-compatible base URL', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValue({
            isErr: () => false,
            value: {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            },
        });

        const result = await resolveDirectGeminiRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/gemini-custom',
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
                    toolProtocol: 'google_generativeai',
                    apiFamily: 'google_generativeai',
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

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected incompatible Gemini path to fail.');
        }
        expect(result.error.message).toContain('Gemini-compatible base URL');
    });

    it('resolves Anthropic direct runtime when auth and base URL are valid', async () => {
        resolveProviderRuntimePathContextMock.mockResolvedValue({
            isErr: () => false,
            value: {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.anthropic.com/v1',
            },
        });

        const result = await resolveDirectAnthropicRuntimeProtocol({
            profileId: 'profile_local_default',
            providerId: 'openai',
            modelId: 'openai/claude-custom',
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
                    toolProtocol: 'anthropic_messages',
                    apiFamily: 'anthropic_messages',
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
    });
});
