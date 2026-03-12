import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
    ComposerActionPanel,
    shouldSubmitComposerOnEnter,
} from '@/web/components/conversation/panels/composerActionPanel';

describe('composer enter handling', () => {
    it('submits only on plain enter', () => {
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: false,
                nativeEvent: {},
            })
        ).toBe(true);
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: true,
                nativeEvent: {},
            })
        ).toBe(false);
        expect(
            shouldSubmitComposerOnEnter({
                key: 'a',
                shiftKey: false,
                nativeEvent: {},
            })
        ).toBe(false);
    });

    it('suppresses submit while IME composition is active', () => {
        expect(
            shouldSubmitComposerOnEnter({
                key: 'Enter',
                shiftKey: false,
                nativeEvent: { isComposing: true },
            })
        ).toBe(false);
    });

    it('disables reasoning selection when the active model does not support it', () => {
        const html = renderToStaticMarkup(
            createElement(ComposerActionPanel, {
                prompt: '',
                pendingImages: [],
                disabled: false,
                isSubmitting: false,
                selectedProviderId: 'openai',
                selectedModelId: 'openai/gpt-5',
                topLevelTab: 'chat',
                activeModeKey: 'chat',
                modes: [],
                reasoningEffort: 'none',
                selectedModelSupportsReasoning: false,
                canAttachImages: false,
                maxImageAttachmentsPerMessage: 4,
                modelOptions: [
                    {
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                        providerLabel: 'OpenAI',
                    },
                ],
                runErrorMessage: undefined,
                onProviderChange: () => {},
                onModelChange: () => {},
                onReasoningEffortChange: () => {},
                onModeChange: () => {},
                onPromptChange: () => {},
                onAddImageFiles: () => {},
                onRemovePendingImage: () => {},
                onRetryPendingImage: () => {},
                onSubmitPrompt: () => {},
            })
        );

        expect(html).toContain('Reasoning');
        expect(html).toContain('This model does not support reasoning.');
        expect(html).toContain('composer-reasoning-select');
        expect(html).toContain('disabled=""');
    });

    it('disables adjustable reasoning when Kilo does not advertise valid effort levels', () => {
        const html = renderToStaticMarkup(
            createElement(ComposerActionPanel, {
                prompt: '',
                pendingImages: [],
                disabled: false,
                isSubmitting: false,
                selectedProviderId: 'kilo',
                selectedModelId: 'google/gemini-2.5-flash-lite',
                topLevelTab: 'chat',
                activeModeKey: 'chat',
                modes: [],
                reasoningEffort: 'none',
                selectedModelSupportsReasoning: true,
                supportedReasoningEfforts: [],
                canAttachImages: false,
                maxImageAttachmentsPerMessage: 4,
                modelOptions: [
                    {
                        id: 'google/gemini-2.5-flash-lite',
                        label: 'Gemini 2.5 Flash Lite',
                        providerId: 'kilo',
                        providerLabel: 'Kilo',
                    },
                ],
                runErrorMessage: undefined,
                onProviderChange: () => {},
                onModelChange: () => {},
                onReasoningEffortChange: () => {},
                onModeChange: () => {},
                onPromptChange: () => {},
                onAddImageFiles: () => {},
                onRemovePendingImage: () => {},
                onRetryPendingImage: () => {},
                onSubmitPrompt: () => {},
            })
        );

        expect(html).toContain('This model supports reasoning, but Kilo does not expose adjustable effort levels.');
        expect(html).toContain('disabled=""');
    });
});
