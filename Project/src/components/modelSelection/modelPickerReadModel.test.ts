import { describe, expect, it } from 'vitest';

import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import {
    buildModelPickerReadModel,
    getModelLabelCollisionIndex,
    getOptionDisplayText,
    shouldUsePopoverModelPicker,
} from '@/web/components/modelSelection/modelPickerReadModel';

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
        ...(input.providerAuthMethod ? { providerAuthMethod: input.providerAuthMethod } : {}),
        ...(input.providerAuthState ? { providerAuthState: input.providerAuthState } : {}),
        ...(input.providerConnectionLabel ? { providerConnectionLabel: input.providerConnectionLabel } : {}),
        ...(input.sourceProvider ? { sourceProvider: input.sourceProvider } : {}),
        ...(input.source ? { source: input.source } : {}),
        ...(input.promptFamily ? { promptFamily: input.promptFamily } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.latency !== undefined ? { latency: input.latency } : {}),
        ...(input.tps !== undefined ? { tps: input.tps } : {}),
        ...(input.compatibilityScope ? { compatibilityScope: input.compatibilityScope } : {}),
        ...(input.compatibilityReason ? { compatibilityReason: input.compatibilityReason } : {}),
    };
}

describe('model picker read model', () => {
    it('builds grouped kilo-first options with separated badges and descriptions', () => {
        const readModel = buildModelPickerReadModel({
            selectedModelId: kiloFrontierModelId,
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
                    ],
                    price: 12,
                    latency: 90,
                    tps: 120,
                }),
                createOption({
                    id: kiloSmallModelId,
                    label: 'Kilo Auto Small',
                    providerId: 'kilo',
                    sourceProvider: 'OpenAI',
                    price: 1,
                }),
                createOption({
                    id: kiloFrontierModelId,
                    label: 'Kilo Auto Frontier',
                    providerId: 'kilo',
                    sourceProvider: 'Anthropic',
                    price: 10,
                    latency: 80,
                }),
            ],
        });

        expect(readModel.groups.map((group) => group.key)).toEqual(['kilo', 'openai']);
        expect(readModel.selectedOption?.id).toBe(kiloFrontierModelId);

        const selectedOption = readModel.options.find((option) => option.selected);
        expect(selectedOption?.displayText).toBe('Kilo Auto Frontier');
        expect(selectedOption?.description).toBe('Automatic Kilo routing to the best model for the task.');
        expect(selectedOption?.sourceProviderBadge).toBe('Anthropic');
        expect(selectedOption?.capabilityBadges).toEqual([]);
        expect(selectedOption?.metricBadges).toEqual(['Price 10', 'Latency 80']);

        const openAiOption = readModel.options.find((option) => option.option.id === 'openai/gpt-5');
        expect(openAiOption?.sourceProviderBadge).toBeUndefined();
        expect(openAiOption?.capabilityBadges).toEqual(['Native Tools']);
        expect(openAiOption?.metricBadges).toEqual(['Price 12', 'Latency 90', 'TPS 120']);
        expect(openAiOption?.description).toBe('OpenAI provider model.');
    });

    it('projects favorites, role defaults, provider instance details, and availability warnings', () => {
        const readModel = buildModelPickerReadModel({
            selectedModelId: 'openai/gpt-5',
            models: [
                createOption({
                    id: 'openai/gpt-5-mini',
                    label: 'GPT-5 Mini',
                    providerId: 'openai',
                    providerLabel: 'OpenAI',
                    providerAuthMethod: 'api_key',
                    providerAuthState: 'configured',
                    providerConnectionLabel: 'Default',
                }),
                createOption({
                    id: 'openai/gpt-5',
                    label: 'GPT-5',
                    providerId: 'openai',
                    providerLabel: 'OpenAI',
                    compatibilityState: 'warning',
                    compatibilityReason: 'Provider credentials need attention.',
                }),
            ],
            favoriteModels: [{ providerId: 'openai', modelId: 'openai/gpt-5-mini' }],
            roleDefaultReferences: [
                {
                    role: 'chat',
                    providerId: 'openai',
                    modelId: 'openai/gpt-5-mini',
                    source: 'role_override',
                    status: 'configured',
                    sourceLabel: 'Saved role default',
                },
            ],
        });

        expect(readModel.groups[0]?.options.map((option) => option.option.id)).toEqual([
            'openai/gpt-5-mini',
            'openai/gpt-5',
        ]);
        expect(readModel.groups[0]?.options[0]?.isFavorite).toBe(true);
        expect(readModel.groups[0]?.options[0]?.roleDefaultBadges).toEqual(['chat default']);
        expect(readModel.groups[0]?.options[0]?.providerInstanceBadge).toBe('OpenAI · Default · api_key · configured');
        expect(readModel.groups[0]?.options[1]?.availabilityLabel).toBe('Provider credentials need attention.');
    });

    it('disambiguates colliding kilo labels with secondary context', () => {
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
    });

    it('chooses the popover picker for kilo, multi-provider, and incompatible model sets', () => {
        expect(
            shouldUsePopoverModelPicker({
                providerId: 'kilo',
                models: [
                    createOption({
                        id: kiloFrontierModelId,
                        label: 'Kilo Auto Frontier',
                        providerId: 'kilo',
                    }),
                ],
            })
        ).toBe(true);

        expect(
            shouldUsePopoverModelPicker({
                providerId: 'openai',
                models: [
                    createOption({
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                        capabilityBadges: [
                            {
                                key: 'native_tools',
                                label: 'Native Tools',
                            },
                        ],
                    }),
                ],
            })
        ).toBe(true);

        expect(
            shouldUsePopoverModelPicker({
                providerId: 'openai',
                models: [
                    createOption({
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                    }),
                    createOption({
                        id: 'anthropic/claude',
                        label: 'Claude',
                        providerId: 'openai_codex',
                    }),
                ],
            })
        ).toBe(true);

        expect(
            shouldUsePopoverModelPicker({
                providerId: 'openai',
                models: [
                    createOption({
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                        compatibilityState: 'incompatible',
                    }),
                ],
            })
        ).toBe(true);

        expect(
            shouldUsePopoverModelPicker({
                providerId: 'openai',
                models: [
                    createOption({
                        id: 'openai/gpt-5',
                        label: 'GPT-5',
                        providerId: 'openai',
                    }),
                ],
            })
        ).toBe(false);
    });
});
