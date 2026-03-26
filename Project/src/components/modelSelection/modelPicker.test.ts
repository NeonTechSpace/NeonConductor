import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import {
    getModelLabelCollisionIndex,
    getOptionDisplayText,
    ModelPicker,
} from '@/web/components/modelSelection/modelPicker';

import { kiloBalancedModelId, kiloFrontierModelId, kiloSmallModelId } from '@/shared/kiloModels';

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
                selectedModelId: kiloFrontierModelId,
                models: [
                    createOption({
                        id: kiloFrontierModelId,
                        label: 'Kilo Auto Frontier',
                        price: 12,
                        latency: 90,
                        tps: 120,
                    }),
                    createOption({
                        id: kiloSmallModelId,
                        label: 'Kilo Auto Small',
                    }),
                ],
                ariaLabel: 'Model',
                placeholder: 'Select model',
                onSelectModel: () => {},
            })
        );

        expect(html).toContain('<button');
        expect(html).toContain('Kilo Auto Frontier');
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
                selectedModelId: kiloFrontierModelId,
                models: [
                    createOption({
                        id: kiloFrontierModelId,
                        label: 'Kilo Auto Frontier',
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
        expect(html).toContain('Kilo Auto Frontier');
        expect(html).not.toContain('<select');
    });

    it('disambiguates same-label kilo models with secondary context', () => {
        const models = [
            createOption({
                id: kiloBalancedModelId,
                label: 'Kilo Auto Balanced',
                providerId: 'kilo',
                sourceProvider: 'OpenAI',
            }),
            createOption({
                id: kiloFrontierModelId,
                label: 'Kilo Auto Balanced',
                providerId: 'kilo',
                sourceProvider: 'Anthropic',
            }),
        ];
        const collisionIndex = getModelLabelCollisionIndex(models);
        const firstModel = models[0];
        const secondModel = models[1];
        if (!firstModel || !secondModel) {
            throw new Error('Expected two Kilo models for collision test.');
        }

        expect(getOptionDisplayText(firstModel, collisionIndex)).toBe('Kilo Auto Balanced · OpenAI');
        expect(getOptionDisplayText(secondModel, collisionIndex)).toBe('Kilo Auto Balanced · Anthropic');

        const html = renderToStaticMarkup(
            createElement(ModelPicker, {
                providerId: 'kilo',
                selectedModelId: kiloFrontierModelId,
                models,
                ariaLabel: 'Model',
                placeholder: 'Select model',
                onSelectModel: () => {},
            })
        );

        expect(html).toContain('Kilo Auto Balanced · Anthropic');
    });

    it('keeps non-collided kilo labels unchanged', () => {
        const models = [
            createOption({
                id: kiloFrontierModelId,
                label: 'Kilo Auto Frontier',
                providerId: 'kilo',
            }),
        ];
        const collisionIndex = getModelLabelCollisionIndex(models);
        const firstModel = models[0];
        if (!firstModel) {
            throw new Error('Expected a Kilo model for non-collision test.');
        }

        expect(getOptionDisplayText(firstModel, collisionIndex)).toBe('Kilo Auto Frontier');
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
