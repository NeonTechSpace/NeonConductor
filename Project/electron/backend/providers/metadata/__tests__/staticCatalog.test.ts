import { describe, expect, it } from 'vitest';

import { listStaticModelDefinitions } from '@/app/backend/providers/metadata/staticCatalog/registry';

const expectedOpenAiModelIds = [
    'openai/gpt-3.5-turbo',
    'openai/gpt-4.1',
    'openai/gpt-4.1-mini',
    'openai/gpt-4.1-nano',
    'openai/gpt-4o',
    'openai/gpt-4o-mini',
    'openai/gpt-5',
    'openai/gpt-5-chat-latest',
    'openai/gpt-5-codex',
    'openai/gpt-5-mini',
    'openai/gpt-5-nano',
    'openai/gpt-5-pro',
    'openai/gpt-5.1',
    'openai/gpt-5.1-chat-latest',
    'openai/gpt-5.1-codex',
    'openai/gpt-5.1-codex-max',
    'openai/gpt-5.1-codex-mini',
    'openai/gpt-5.2',
    'openai/gpt-5.2-chat-latest',
    'openai/gpt-5.2-codex',
    'openai/gpt-5.2-pro',
    'openai/gpt-5.3-chat-latest',
    'openai/gpt-5.3-codex',
    'openai/gpt-5.4',
    'openai/gpt-5.4-pro',
    'openai/gpt-realtime',
    'openai/gpt-realtime-1.5',
    'openai/gpt-realtime-mini',
    'openai/o1',
    'openai/o3',
    'openai/o3-mini',
    'openai/o4-mini',
];

describe('static model catalog', () => {
    it('ships context lengths for every static provider model', () => {
        const definitions = [
            ...listStaticModelDefinitions('openai', 'default'),
            ...listStaticModelDefinitions('zai', 'coding_international'),
            ...listStaticModelDefinitions('zai', 'general_international'),
            ...listStaticModelDefinitions('moonshot', 'standard_api'),
            ...listStaticModelDefinitions('moonshot', 'coding_plan'),
        ];

        expect(definitions.length).toBeGreaterThan(0);
        for (const definition of definitions) {
            expect(definition.contextLength).toBeDefined();
            expect(definition.contextLength).toBeGreaterThan(0);
            expect(definition.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
            expect(definition.sourceNote.length).toBeGreaterThan(0);
        }
    });

    it('ships explicit max output tokens for current openai and zai models', () => {
        const definitions = [
            ...listStaticModelDefinitions('openai', 'default'),
            ...listStaticModelDefinitions('zai', 'coding_international'),
        ];

        for (const definition of definitions) {
            expect(definition.maxOutputTokens).toBeDefined();
            expect(definition.maxOutputTokens).toBeGreaterThan(0);
        }
    });

    it('exposes the curated chat-capable non-kilo model sets by endpoint profile', () => {
        const openAiModelIds = listStaticModelDefinitions('openai', 'default').map((definition) => definition.modelId);
        expect(openAiModelIds.slice().sort()).toEqual(expectedOpenAiModelIds.slice().sort());
        expect(openAiModelIds).not.toContain('openai/gpt-3.5-turbo-0125');
        expect(openAiModelIds).not.toContain('openai/gpt-3.5-turbo-1106');
        expect(openAiModelIds).not.toContain('openai/gpt-3.5-turbo-16k');
        expect(openAiModelIds).not.toContain('openai/codex-mini');
        expect(
            listStaticModelDefinitions('zai', 'coding_international').map((definition) => definition.modelId)
        ).toEqual([
            'zai/glm-4.5',
            'zai/glm-4.5-air',
            'zai/glm-4.5-flash',
            'zai/glm-4.5v',
            'zai/glm-4.6',
        ]);
        expect(
            listStaticModelDefinitions('zai', 'general_international').map((definition) => definition.modelId)
        ).toEqual([
            'zai/glm-4.5',
            'zai/glm-4.5-air',
            'zai/glm-4.5-flash',
            'zai/glm-4.5v',
            'zai/glm-4.6',
        ]);
        expect(
            listStaticModelDefinitions('moonshot', 'coding_plan').map((definition) => definition.modelId)
        ).toEqual([
            'moonshot/kimi-for-coding',
            'moonshot/kimi-k2',
            'moonshot/kimi-k2-thinking',
            'moonshot/kimi-k2-thinking-turbo',
            'moonshot/kimi-latest',
        ]);
        expect(
            listStaticModelDefinitions('moonshot', 'standard_api').map((definition) => definition.modelId)
        ).toEqual([
            'moonshot/kimi-k2-thinking',
            'moonshot/kimi-k2',
            'moonshot/kimi-k2-thinking-turbo',
            'moonshot/kimi-latest',
        ]);
    });

    it('marks vision-capable static models with image input modalities', () => {
        const openAiVisionModels = listStaticModelDefinitions('openai', 'default').filter(
            (definition) => definition.supportsVision === true
        );
        expect(openAiVisionModels.length).toBeGreaterThan(0);
        expect(openAiVisionModels.every((definition) => definition.inputModalities?.includes('image'))).toBe(true);

        const openAiTextOnlyModels = listStaticModelDefinitions('openai', 'default').filter(
            (definition) => definition.supportsVision === false
        );
        expect(openAiTextOnlyModels.map((definition) => definition.modelId)).toEqual(
            expect.arrayContaining([
                'openai/gpt-3.5-turbo',
                'openai/gpt-realtime',
                'openai/gpt-realtime-1.5',
                'openai/gpt-realtime-mini',
                'openai/o1',
            ])
        );
        expect(openAiTextOnlyModels.every((definition) => definition.inputModalities?.includes('image') !== true)).toBe(
            true
        );

        const zaiVisionModels = listStaticModelDefinitions('zai', 'coding_international').filter(
            (definition) => definition.supportsVision
        );
        expect(zaiVisionModels.map((definition) => definition.modelId)).toEqual(['zai/glm-4.5v', 'zai/glm-4.6']);
        expect(zaiVisionModels.every((definition) => definition.inputModalities?.includes('image'))).toBe(true);
    });

    it('marks docs-confirmed OpenAI realtime-capable aliases for websocket execution', () => {
        const realtimeCapableModelIds = listStaticModelDefinitions('openai', 'default')
            .filter((definition) => definition.supportsRealtimeWebSocket === true)
            .map((definition) => definition.modelId);

        expect(realtimeCapableModelIds).toEqual(
            expect.arrayContaining([
                'openai/gpt-3.5-turbo',
                'openai/gpt-4o',
                'openai/gpt-5.4',
                'openai/gpt-realtime',
                'openai/o3',
            ])
        );
    });
});
