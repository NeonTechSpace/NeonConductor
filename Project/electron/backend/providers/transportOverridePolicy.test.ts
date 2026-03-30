import { describe, expect, it } from 'vitest';

import { buildTransport, invalidTransportOverride } from '@/app/backend/providers/transportOverridePolicy';

describe('transportOverridePolicy', () => {
    it('builds a stable transport resolution from runtime options', () => {
        expect(
            buildTransport({
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
            selected: 'openai_responses',
        })
        ).toEqual({
            requested: 'auto',
            selected: 'openai_responses',
            degraded: false,
        });
    });

    it('fails closed when a direct-family protocol receives a transport override', () => {
        const result = invalidTransportOverride(
            {
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
                        family: 'openai_responses',
                    },
                },
            },
            'protocol "google_generativeai"'
        );

        expect(result?.isErr()).toBe(true);
        if (!result || result.isOk()) {
            throw new Error('Expected invalid transport override to fail.');
        }
        expect(result.error.message).toContain('openai_responses');
    });
});
