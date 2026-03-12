import { describe, expect, it } from 'vitest';

import { normalizeCatalogMetadata, toProviderCatalogUpsert } from '@/app/backend/providers/metadata/normalize';
import {
    applyProviderMetadataOverrideFromEntries,
    type ProviderMetadataOverrideEntry,
} from '@/app/backend/providers/metadata/overrides';
import type { NormalizedModelMetadata, ProviderCatalogModel } from '@/app/backend/providers/types';

function createCatalogModel(overrides?: Partial<ProviderCatalogModel>): ProviderCatalogModel {
    return {
        modelId: 'openai/gpt-5',
        label: 'GPT-5',
        isFree: false,
        capabilities: {
            supportsTools: true,
            supportsReasoning: true,
            supportsVision: false,
            supportsAudioInput: false,
            supportsAudioOutput: false,
            toolProtocol: 'openai_responses',
            apiFamily: 'openai_compatible',
            inputModalities: ['text'],
            outputModalities: ['text'],
        },
        pricing: {},
        raw: {},
        ...overrides,
    };
}

describe('provider metadata normalization', () => {
    it('keeps optional fields unknown when upstream metadata is thin', () => {
        const result = normalizeCatalogMetadata('openai', [createCatalogModel()]);
        expect(result.models).toHaveLength(1);
        const model = result.models[0];
        expect(model).toBeDefined();
        if (!model) {
            throw new Error('Expected normalized model.');
        }
        expect(model).toMatchObject({
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            source: 'provider_api',
        });
        expect(model.contextLength).toBeUndefined();
        expect(model.inputPrice).toBeUndefined();
        expect(model.outputPrice).toBeUndefined();
        expect(model.maxOutputTokens).toBeUndefined();
    });

    it('derives safe metadata hints from pricing/raw payloads without overriding explicit values', () => {
        const result = normalizeCatalogMetadata('kilo', [
            createCatalogModel({
                modelId: 'kilo/auto',
                label: 'Kilo Auto',
                upstreamProvider: 'openai',
                capabilities: {
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
                pricing: {
                    input: 0.000001,
                    output: 0.000003,
                    cache_read: 0.0000002,
                    cache_write: 0.0000005,
                },
                raw: {
                    latency_ms: 120,
                    tps: 35,
                    max_output_tokens: 8192,
                },
                contextLength: 200000,
            }),
        ]);

        expect(result.models).toHaveLength(1);
        const model = result.models[0];
        expect(model).toBeDefined();
        if (!model) {
            throw new Error('Expected normalized model.');
        }
        expect(model).toMatchObject({
            providerId: 'kilo',
            modelId: 'kilo/auto',
            contextLength: 200000,
            inputPrice: 0.000001,
            outputPrice: 0.000003,
            cacheReadPrice: 0.0000002,
            cacheWritePrice: 0.0000005,
            latency: 120,
            tps: 35,
            maxOutputTokens: 8192,
        });

        const upsert = toProviderCatalogUpsert(model);
        expect(upsert.contextLength).toBe(200000);
        expect(upsert.pricing?.['input']).toBe(0.000001);
        expect(upsert.pricing?.['output']).toBe(0.000003);
    });

    it('drops invalid metadata rows fail-closed', () => {
        const result = normalizeCatalogMetadata('openai', [
            createCatalogModel({
                pricing: {
                    input: -1,
                },
            }),
        ]);

        expect(result.models).toHaveLength(0);
        expect(result.droppedCount).toBe(1);
    });

    it('drops runnable provider-api rows that are missing required protocol metadata', () => {
        const result = normalizeCatalogMetadata('openai', [
            createCatalogModel({
                capabilities: {
                    supportsTools: false,
                    supportsReasoning: true,
                    supportsVision: false,
                    supportsAudioInput: false,
                    supportsAudioOutput: false,
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                },
            }),
        ]);

        expect(result.models).toHaveLength(0);
        expect(result.droppedCount).toBe(1);
    });

    it('drops provider-native rows without trusted provider settings before runtime', () => {
        const result = normalizeCatalogMetadata(
            'openai',
            [
                createCatalogModel({
                    modelId: 'openai/minimax-native',
                    label: 'MiniMax Native',
                    upstreamProvider: 'minimax',
                    capabilities: {
                        supportsTools: true,
                        supportsReasoning: true,
                        supportsVision: false,
                        supportsAudioInput: false,
                        supportsAudioOutput: false,
                        toolProtocol: 'provider_native',
                        apiFamily: 'provider_native',
                        inputModalities: ['text'],
                        outputModalities: ['text'],
                    },
                }),
            ],
            {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.minimax.io/v1',
            }
        );

        expect(result.models).toHaveLength(0);
        expect(result.droppedCount).toBe(1);
    });

    it('drops Kilo gateway rows that are missing routed upstream family metadata', () => {
        const result = normalizeCatalogMetadata('kilo', [
            createCatalogModel({
                modelId: 'kilo/auto',
                label: 'Kilo Auto',
                upstreamProvider: 'kilo',
                capabilities: {
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
            }),
        ]);

        expect(result.models).toHaveLength(0);
        expect(result.droppedCount).toBe(1);
    });

    it('keeps Kilo gateway rows when routed upstream family metadata is present', () => {
        const result = normalizeCatalogMetadata('kilo', [
            createCatalogModel({
                modelId: 'anthropic/claude-sonnet-4.5',
                label: 'Claude Sonnet 4.5',
                upstreamProvider: 'anthropic',
                capabilities: {
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
            }),
        ]);

        expect(result.models).toHaveLength(1);
        expect(result.models[0]?.routedApiFamily).toBe('anthropic_messages');
    });

    it('keeps trusted provider-native rows when the active connection context supports the specialization', () => {
        const result = normalizeCatalogMetadata(
            'openai',
            [
                createCatalogModel({
                    modelId: 'openai/minimax-native',
                    label: 'MiniMax Native',
                    upstreamProvider: 'minimax',
                    capabilities: {
                        supportsTools: true,
                        supportsReasoning: true,
                        supportsVision: false,
                        supportsAudioInput: false,
                        supportsAudioOutput: false,
                        toolProtocol: 'provider_native',
                        apiFamily: 'provider_native',
                        inputModalities: ['text'],
                        outputModalities: ['text'],
                    },
                    providerSettings: {
                        providerNativeId: 'minimax_openai_compat',
                    },
                }),
            ],
            {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.minimax.io/v1',
            }
        );

        expect(result.models).toHaveLength(1);
        expect(result.models[0]?.toolProtocol).toBe('provider_native');
    });

    it('drops direct Anthropic rows when the active connection profile is not Anthropic-compatible', () => {
        const result = normalizeCatalogMetadata(
            'openai',
            [
                createCatalogModel({
                    modelId: 'openai/claude-custom',
                    label: 'Claude Custom',
                    upstreamProvider: 'anthropic',
                    capabilities: {
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
                }),
            ],
            {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            }
        );

        expect(result.models).toHaveLength(0);
        expect(result.droppedCount).toBe(1);
    });

    it('keeps direct Anthropic rows when the active connection profile is Anthropic-compatible', () => {
        const result = normalizeCatalogMetadata(
            'openai',
            [
                createCatalogModel({
                    modelId: 'openai/claude-custom',
                    label: 'Claude Custom',
                    upstreamProvider: 'anthropic',
                    capabilities: {
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
                }),
            ],
            {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.anthropic.com/v1',
            }
        );

        expect(result.models).toHaveLength(1);
        expect(result.models[0]?.toolProtocol).toBe('anthropic_messages');
        expect(result.models[0]?.apiFamily).toBe('anthropic_messages');
    });

    it('drops direct Gemini rows when the active connection profile is not Gemini-compatible', () => {
        const result = normalizeCatalogMetadata(
            'openai',
            [
                createCatalogModel({
                    modelId: 'openai/gemini-custom',
                    label: 'Gemini Custom',
                    upstreamProvider: 'google',
                    capabilities: {
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
                }),
            ],
            {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://api.openai.com/v1',
            }
        );

        expect(result.models).toHaveLength(0);
        expect(result.droppedCount).toBe(1);
    });

    it('keeps direct Gemini rows when the active connection profile is Gemini-compatible', () => {
        const result = normalizeCatalogMetadata(
            'openai',
            [
                createCatalogModel({
                    modelId: 'openai/gemini-custom',
                    label: 'Gemini Custom',
                    upstreamProvider: 'google',
                    capabilities: {
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
                }),
            ],
            {
                optionProfileId: 'default',
                resolvedBaseUrl: 'https://generativelanguage.googleapis.com/v1beta',
            }
        );

        expect(result.models).toHaveLength(1);
        expect(result.models[0]?.toolProtocol).toBe('google_generativeai');
        expect(result.models[0]?.apiFamily).toBe('google_generativeai');
    });

    it('applies scoped overrides with higher precedence than provider values', () => {
        const model: NormalizedModelMetadata = {
            providerId: 'openai',
            modelId: 'openai/gpt-5',
            label: 'GPT-5',
            source: 'provider_api',
            updatedAt: '2026-03-05T00:00:00.000Z',
            inputPrice: 1,
        };
        const overrides: ProviderMetadataOverrideEntry[] = [
            {
                providerId: 'openai',
                modelId: 'openai/gpt-5',
                reason: 'known provider mismatch',
                updatedAt: '2026-03-01T00:00:00.000Z',
                patch: {
                    inputPrice: 0.5,
                },
            },
        ];

        const applied = applyProviderMetadataOverrideFromEntries(model, overrides);
        expect(applied.applied).toBe(true);
        expect(applied.model.inputPrice).toBe(0.5);
        expect(applied.model.source).toBe('override_registry');
        expect(applied.model.updatedAt).toBe('2026-03-01T00:00:00.000Z');
    });
});
