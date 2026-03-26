import { describe, expect, it } from 'vitest';

import {
    resolveSelectedModelId,
    resolveSelectedProviderId,
} from '@/web/components/settings/providerSettings/selection';

describe('provider settings selection helpers', () => {
    it('falls back to the default provider when the current selection is missing', () => {
        expect(
            resolveSelectedProviderId(
                [
                    { id: 'openai', label: 'OpenAI', isDefault: false },
                    { id: 'kilo', label: 'Kilo', isDefault: true },
                ] as never,
                'zai'
            )
        ).toBe('kilo');
    });

    it('prefers the saved default model when the current model is unavailable', () => {
        expect(
            resolveSelectedModelId({
                selectedProviderId: 'openai',
                selectedModelId: '',
                models: [
                    {
                        id: 'openai/gpt-5',
                        providerId: 'openai',
                        label: 'GPT-5',
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
                            toolProtocol: 'openai_chat_completions',
                            apiFamily: 'openai_compatible',
                        },
                    },
                ],
                defaults: {
                    providerId: 'openai',
                    modelId: 'openai/gpt-5',
                },
            })
        ).toBe('openai/gpt-5');
    });
});
