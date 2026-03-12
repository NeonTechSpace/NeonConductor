import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import {
    getModelLabelCollisionIndex,
    getOptionDisplayText,
    ModelPicker,
} from '@/web/components/modelSelection/modelPicker';

function createOption(input: Partial<ModelPickerOption> & Pick<ModelPickerOption, 'id' | 'label'>): ModelPickerOption {
    return {
        id: input.id,
        label: input.label,
        supportsTools: input.supportsTools ?? true,
        supportsVision: input.supportsVision ?? false,
        supportsReasoning: input.supportsReasoning ?? false,
        capabilityBadges: input.capabilityBadges ?? [],
        compatibilityState: input.compatibilityState ?? 'compatible',
        ...(input.providerId ? { providerId: input.providerId } : {}),
        ...(input.providerLabel ? { providerLabel: input.providerLabel } : {}),
        ...(input.sourceProvider ? { sourceProvider: input.sourceProvider } : {}),
        ...(input.source ? { source: input.source } : {}),
        ...(input.promptFamily ? { promptFamily: input.promptFamily } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.latency !== undefined ? { latency: input.latency } : {}),
        ...(input.tps !== undefined ? { tps: input.tps } : {}),
    };
}

describe('model picker', () => {
    it('renders a dedicated trigger button for Kilo models', () => {
        const html = renderToStaticMarkup(
            createElement(ModelPicker, {
                providerId: 'kilo',
                selectedModelId: 'kilo/auto',
                models: [
                    createOption({
                        id: 'kilo/auto',
                        label: 'Kilo Auto',
                        price: 12,
                        latency: 90,
                        tps: 120,
                    }),
                    createOption({
                        id: 'kilo/code',
                        label: 'Kilo Code',
                    }),
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
                    createOption({
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                    }),
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
                    createOption({
                        id: 'kilo/auto',
                        label: 'Kilo Auto',
                        providerId: 'kilo',
                        providerLabel: 'Kilo',
                    }),
                    createOption({
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                        providerLabel: 'OpenAI',
                    }),
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
            createOption({
                id: 'kilo/auto-openai',
                label: 'Kilo Auto Free',
                providerId: 'kilo',
                sourceProvider: 'OpenAI',
            }),
            createOption({
                id: 'kilo/auto-anthropic',
                label: 'Kilo Auto Free',
                providerId: 'kilo',
                sourceProvider: 'Anthropic',
            }),
        ];
        const collisionIndex = getModelLabelCollisionIndex(models);

        expect(getOptionDisplayText(models[0]!, collisionIndex)).toBe('Kilo Auto Free · OpenAI');
        expect(getOptionDisplayText(models[1]!, collisionIndex)).toBe('Kilo Auto Free · Anthropic');

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
            createOption({
                id: 'kilo/auto',
                label: 'Kilo Auto',
                providerId: 'kilo',
            }),
        ];
        const collisionIndex = getModelLabelCollisionIndex(models);

        expect(getOptionDisplayText(models[0]!, collisionIndex)).toBe('Kilo Auto');
    });

    it('switches to the popover picker when capability badges or incompatibility reasons are present', () => {
        const html = renderToStaticMarkup(
            createElement(ModelPicker, {
                providerId: 'openai',
                selectedModelId: 'openai/gpt-5',
                models: [
                    createOption({
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                        providerLabel: 'OpenAI',
                        capabilityBadges: [
                            {
                                key: 'native_tools',
                                label: 'Native Tools',
                            },
                            {
                                key: 'protocol',
                                label: 'Responses',
                            },
                        ],
                        compatibilityState: 'incompatible',
                        compatibilityReason: 'This mode requires native tool calling.',
                    }),
                ],
                ariaLabel: 'Model',
                placeholder: 'Select model',
                onSelectModel: () => {},
            })
        );

        expect(html).toContain('<button');
        expect(html).not.toContain('<select');
    });
});
