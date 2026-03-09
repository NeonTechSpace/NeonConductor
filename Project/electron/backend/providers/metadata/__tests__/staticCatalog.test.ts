import { describe, expect, it } from 'vitest';

import { listStaticModelDefinitions } from '@/app/backend/providers/metadata/staticCatalog/registry';

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
});
