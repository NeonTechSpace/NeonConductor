import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { ProviderDefaultModelSection } from '@/web/components/settings/providerSettings/defaultModelSection';

describe('provider default model section', () => {
    it('shows capability-driven runtime notes without hiding the model entry', () => {
        const html = renderToStaticMarkup(
            createElement(ProviderDefaultModelSection, {
                selectedProviderId: 'openai',
                selectedModelId: 'openai/gpt-5-text',
                models: [
                    {
                        id: 'openai/gpt-5-text',
                        label: 'GPT-5 Text',
                        providerId: 'openai',
                        providerLabel: 'OpenAI',
                        supportsTools: false,
                        supportsVision: false,
                        supportsReasoning: true,
                        supportsPromptCache: false,
                        capabilityBadges: [],
                        compatibilityState: 'warning',
                        compatibilityReason: 'Connect OpenAI before using this model in runs.',
                    },
                ],
                isDefaultModel: true,
                isSavingDefault: false,
                isSyncingCatalog: false,
                onSelectModel: () => {},
                onSyncCatalog: () => {},
            })
        );

        expect(html).toContain('Connect OpenAI before using this model in runs.');
        expect(html).toContain('Runtime notes:');
        expect(html).toContain('Agent modes that require native tools will skip this model.');
    });
});
