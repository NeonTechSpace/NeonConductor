import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
    getModelLabelCollisionIndex,
    getOptionDisplayText,
    ModelPicker,
} from '@/web/components/modelSelection/modelPicker';

describe('model picker', () => {
    it('renders a dedicated trigger button for Kilo models', () => {
        const html = renderToStaticMarkup(
            createElement(ModelPicker, {
                providerId: 'kilo',
                selectedModelId: 'kilo/auto',
                models: [
                    {
                        id: 'kilo/auto',
                        label: 'Kilo Auto',
                        price: 12,
                        latency: 90,
                        tps: 120,
                    },
                    {
                        id: 'kilo/code',
                        label: 'Kilo Code',
                    },
                ],
                ariaLabel: 'Model',
                placeholder: 'Select model',
                onSelectModel: () => {},
            })
        );

        expect(html).toContain('<button');
        expect(html).toContain('Kilo Auto');
        expect(html).not.toContain('<select');
        expect(html).not.toContain('price 12');
    });

    it('keeps non-Kilo providers on the simple native select path', () => {
        const html = renderToStaticMarkup(
            createElement(ModelPicker, {
                providerId: 'openai',
                selectedModelId: 'openai/gpt-5',
                models: [
                    {
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                    },
                ],
                ariaLabel: 'Model',
                placeholder: 'Select model',
                onSelectModel: () => {},
            })
        );

        expect(html).toContain('<select');
        expect(html).toContain('GPT-5');
        expect(html).not.toContain('Search Kilo models');
    });

    it('uses the grouped popover picker when models span multiple providers', () => {
        const html = renderToStaticMarkup(
            createElement(ModelPicker, {
                providerId: undefined,
                selectedModelId: 'kilo/auto',
                models: [
                    {
                        id: 'kilo/auto',
                        label: 'Kilo Auto',
                        providerId: 'kilo',
                        providerLabel: 'Kilo',
                    },
                    {
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                        providerLabel: 'OpenAI',
                    },
                ],
                ariaLabel: 'Model',
                placeholder: 'Select model',
                onSelectModel: () => {},
            })
        );

        expect(html).toContain('<button');
        expect(html).toContain('Kilo Auto');
        expect(html).not.toContain('<select');
    });

    it('disambiguates same-label kilo models with secondary context', () => {
        const models = [
            {
                id: 'kilo/auto-openai',
                label: 'Kilo Auto Free',
                providerId: 'kilo',
                sourceProvider: 'OpenAI',
            },
            {
                id: 'kilo/auto-anthropic',
                label: 'Kilo Auto Free',
                providerId: 'kilo',
                sourceProvider: 'Anthropic',
            },
        ];
        const collisionIndex = getModelLabelCollisionIndex(models);

        expect(getOptionDisplayText(models[0], collisionIndex)).toBe('Kilo Auto Free · OpenAI');
        expect(getOptionDisplayText(models[1], collisionIndex)).toBe('Kilo Auto Free · Anthropic');

        const html = renderToStaticMarkup(
            createElement(ModelPicker, {
                providerId: 'kilo',
                selectedModelId: 'kilo/auto-anthropic',
                models,
                ariaLabel: 'Model',
                placeholder: 'Select model',
                onSelectModel: () => {},
            })
        );

        expect(html).toContain('Kilo Auto Free · Anthropic');
    });

    it('keeps non-collided kilo labels unchanged', () => {
        const models = [
            {
                id: 'kilo/auto',
                label: 'Kilo Auto',
                providerId: 'kilo',
            },
        ];
        const collisionIndex = getModelLabelCollisionIndex(models);

        expect(getOptionDisplayText(models[0], collisionIndex)).toBe('Kilo Auto');
    });
});
