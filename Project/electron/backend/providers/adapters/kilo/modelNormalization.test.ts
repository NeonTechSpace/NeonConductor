import { describe, expect, it } from 'vitest';

import { normalizeKiloModel } from '@/app/backend/providers/adapters/kilo/modelNormalization';

const emptyNormalizationInput = {
    providerIds: new Set<string>(),
    modelsByProviderIndex: new Map<string, ReadonlySet<string>>(),
};

describe('kilo model normalization', () => {
    it('maps recognized upstream providers directly when owned_by is present', () => {
        const normalized = normalizeKiloModel(
            {
                id: 'google/gemini-2.5-pro',
                name: 'Gemini 2.5 Pro',
                upstreamProvider: 'google',
                supportedParameters: ['tools'],
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                pricing: {},
                raw: {},
            },
            emptyNormalizationInput
        );

        expect(normalized.runtime.apiFamily).toBe('kilo_gateway');
        if (normalized.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected kilo gateway runtime.');
        }
        expect(normalized.runtime.routedApiFamily).toBe('google_generativeai');
    });

    it.each([
        ['moonshotai/kimi-k2.5', 'openai_compatible'],
        ['z-ai/glm-5', 'openai_compatible'],
        ['google/gemini-3.1-pro-preview', 'google_generativeai'],
        ['anthropic/claude-sonnet-4.6', 'anthropic_messages'],
    ] as const)(
        'derives routed family from the trusted namespace prefix for %s when owned_by is missing',
        (modelId, routedApiFamily) => {
            const normalized = normalizeKiloModel(
                {
                    id: modelId,
                    name: modelId,
                    supportedParameters: ['tools'],
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                    pricing: {},
                    raw: {},
                },
                emptyNormalizationInput
            );

            if (normalized.runtime.toolProtocol !== 'kilo_gateway') {
                throw new Error('Expected kilo gateway runtime.');
            }
            expect(normalized.runtime.routedApiFamily).toBe(routedApiFamily);
        }
    );

    it('derives frontier as anthropic via prompt-family metadata when owned_by is missing', () => {
        const normalized = normalizeKiloModel(
            {
                id: 'kilo-auto/frontier',
                name: 'Kilo Auto Frontier',
                promptFamily: 'anthropic',
                supportedParameters: ['tools', 'reasoning'],
                inputModalities: ['text', 'image'],
                outputModalities: ['text'],
                pricing: {},
                raw: {
                    opencode: {
                        prompt: 'anthropic',
                    },
                },
            },
            emptyNormalizationInput
        );

        if (normalized.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected kilo gateway runtime.');
        }
        expect(normalized.runtime.routedApiFamily).toBe('anthropic_messages');
    });

    it('derives small as openai-compatible via codex prompt-family metadata when owned_by is missing', () => {
        const normalized = normalizeKiloModel(
            {
                id: 'kilo-auto/small',
                name: 'Kilo Auto Small',
                promptFamily: 'codex',
                supportedParameters: ['tools', 'reasoning'],
                inputModalities: ['text'],
                outputModalities: ['text'],
                pricing: {},
                raw: {
                    opencode: {
                        prompt: 'codex',
                    },
                },
            },
            emptyNormalizationInput
        );

        if (normalized.runtime.toolProtocol !== 'kilo_gateway') {
            throw new Error('Expected kilo gateway runtime.');
        }
        expect(normalized.runtime.routedApiFamily).toBe('openai_compatible');
    });

    it.each(['kilo-auto/balanced', 'kilo-auto/free'])(
        'derives %s as openai-compatible from the trusted kilo-auto namespace when prompt metadata is missing',
        (modelId) => {
            const normalized = normalizeKiloModel(
                {
                    id: modelId,
                    name: modelId,
                    supportedParameters: ['tools', 'reasoning'],
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                    pricing: {},
                    raw: {},
                },
                emptyNormalizationInput
            );

            if (normalized.runtime.toolProtocol !== 'kilo_gateway') {
                throw new Error('Expected kilo gateway runtime.');
            }
            expect(normalized.runtime.routedApiFamily).toBe('openai_compatible');
        }
    );

    it('fails closed for unknown namespaces without explicit hints', () => {
        expect(() =>
            normalizeKiloModel(
                {
                    id: 'mystery/model',
                    name: 'Mystery Model',
                    supportedParameters: ['tools'],
                    inputModalities: ['text'],
                    outputModalities: ['text'],
                    pricing: {},
                    raw: {},
                },
                emptyNormalizationInput
            )
        ).toThrow('missing a supported routed API family');
    });
});
