import { describe, expect, it } from 'vitest';

import { mapProviderCatalogModel } from '@/app/backend/persistence/stores/provider/providerCatalogMapper';

describe('providerCatalogMapper reasoning efforts', () => {
    it('preserves Kilo reasoning variants from the raw gateway payload', () => {
        const model = mapProviderCatalogModel({
            model_id: 'openai/gpt-5',
            provider_id: 'kilo',
            label: 'GPT-5',
            upstream_provider: 'openai',
            supports_tools: 1,
            supports_reasoning: 1,
            supports_vision: 0,
            supports_audio_input: 0,
            supports_audio_output: 0,
            supports_prompt_cache: null,
            tool_protocol: null,
            api_family: 'kilo_gateway',
            routed_api_family: 'openai_compatible',
            pricing_json: '{}',
            provider_settings_json: '{}',
            raw_json: JSON.stringify({
                opencode: {
                    variants: {
                        minimal: { reasoning: { effort: 'minimal' } },
                        high: { reasoning: { effort: 'high' } },
                    },
                },
            }),
            input_modalities_json: JSON.stringify(['text']),
            output_modalities_json: JSON.stringify(['text']),
            prompt_family: 'codex',
            context_length: 200000,
            source: 'provider_api',
            updated_at: '2026-03-12T00:00:00.000Z',
        });

        expect(model.reasoningEfforts).toEqual(['minimal', 'high']);
        expect(model.routedApiFamily).toBe('openai_compatible');
    });

    it('keeps Kilo reasoning effort metadata undefined when trusted variants are absent', () => {
        const model = mapProviderCatalogModel({
            model_id: 'openai/gpt-5',
            provider_id: 'kilo',
            label: 'GPT-5',
            upstream_provider: 'openai',
            supports_tools: 1,
            supports_reasoning: 1,
            supports_vision: 0,
            supports_audio_input: 0,
            supports_audio_output: 0,
            supports_prompt_cache: null,
            tool_protocol: null,
            api_family: 'kilo_gateway',
            routed_api_family: 'anthropic_messages',
            pricing_json: '{}',
            provider_settings_json: '{}',
            raw_json: '{}',
            input_modalities_json: JSON.stringify(['text']),
            output_modalities_json: JSON.stringify(['text']),
            prompt_family: 'codex',
            context_length: 200000,
            source: 'provider_api',
            updated_at: '2026-03-12T00:00:00.000Z',
        });

        expect(model.reasoningEfforts).toBeUndefined();
        expect(model.routedApiFamily).toBe('anthropic_messages');
    });
});
