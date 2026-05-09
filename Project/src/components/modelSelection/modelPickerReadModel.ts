import type { ModelCapabilityBadge, ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import type {
    ModelGroupViewModel,
    ModelLabelCollisionIndex,
    ModelPickerReadModel,
    ModelOptionViewModel,
} from '@/web/components/modelSelection/modelPicker.types';

import {
    kiloBalancedModelId,
    kiloFreeModelId,
    kiloFrontierModelId,
    kiloSmallModelId,
} from '@/shared/kiloModels';
import type { ModelRoleDefaultRecord } from '@/shared/contracts/types/modelOptimization';
import type { ProviderModelFavoriteRecord } from '@/shared/contracts/types/provider';

export { shouldUsePopoverModelPicker } from '@/web/components/modelSelection/shouldUsePopoverModelPicker';

function formatMetric(value: number | undefined): string | undefined {
    if (value === undefined || !Number.isFinite(value)) {
        return undefined;
    }

    return String(value);
}

function stripSubProviderPrefix(label: string): string {
    const colonIndex = label.indexOf(': ');
    if (colonIndex < 0) {
        return label;
    }

    const prefix = label.slice(0, colonIndex).trim().toLowerCase();
    if (prefix === 'kilo') {
        return label;
    }

    return label.slice(colonIndex + 2);
}

function getDisplayLabel(option: ModelPickerOption): string {
    if (option.providerId === 'kilo') {
        return stripSubProviderPrefix(option.label);
    }

    return option.label;
}

function getCollisionKey(option: ModelPickerOption): string | null {
    if (option.providerId !== 'kilo') {
        return null;
    }

    return getDisplayLabel(option).toLowerCase();
}

export function getModelLabelCollisionIndex(options: ModelPickerOption[]): ModelLabelCollisionIndex {
    const collisionIndex = new Map<string, number>();

    for (const option of options) {
        const collisionKey = getCollisionKey(option);
        if (!collisionKey) {
            continue;
        }

        collisionIndex.set(collisionKey, (collisionIndex.get(collisionKey) ?? 0) + 1);
    }

    return collisionIndex;
}

function getModelDisambiguator(option: ModelPickerOption): string | undefined {
    return option.sourceProvider ?? option.promptFamily ?? option.id;
}

function hasLabelCollision(option: ModelPickerOption, collisionIndex: ModelLabelCollisionIndex): boolean {
    const collisionKey = getCollisionKey(option);
    if (!collisionKey) {
        return false;
    }

    return (collisionIndex.get(collisionKey) ?? 0) > 1;
}

export function getOptionDisplayText(
    option: ModelPickerOption,
    collisionIndex: ModelLabelCollisionIndex = new Map()
): string {
    const displayLabel = getDisplayLabel(option);
    if (!hasLabelCollision(option, collisionIndex)) {
        return displayLabel;
    }

    const disambiguator = getModelDisambiguator(option);
    return disambiguator ? `${displayLabel} · ${disambiguator}` : displayLabel;
}

function getGroupKey(option: ModelPickerOption): string {
    return option.providerId === 'kilo' ? 'kilo' : (option.providerId ?? 'other');
}

function getGroupLabel(option: ModelPickerOption): string {
    return option.providerId === 'kilo' ? 'Kilo' : (option.providerLabel ?? option.providerId ?? 'Other');
}

function getGroupOrder(key: string): number {
    return key === 'kilo' ? 0 : 1;
}

interface ModelPickerRawGroup {
    key: string;
    label: string;
    options: ModelPickerOption[];
}

function getModelKey(option: ModelPickerOption): string {
    return `${option.providerId ?? 'unknown'}:${option.id}`;
}

function isFavoriteModel(option: ModelPickerOption, favoriteModels: ProviderModelFavoriteRecord[]): boolean {
    return favoriteModels.some((favorite) => favorite.providerId === option.providerId && favorite.modelId === option.id);
}

function getRoleDefaultBadges(
    option: ModelPickerOption,
    roleDefaultReferences: ModelRoleDefaultRecord[]
): string[] {
    return roleDefaultReferences
        .filter(
            (roleDefault) =>
                roleDefault.providerId === option.providerId &&
                roleDefault.modelId === option.id &&
                roleDefault.status !== 'unconfigured'
        )
        .map((roleDefault) =>
            roleDefault.status === 'fallback'
                ? `${roleDefault.role.replaceAll('_', ' ')} fallback`
                : `${roleDefault.role.replaceAll('_', ' ')} default`
        );
}

function getProviderInstanceBadge(option: ModelPickerOption): string | undefined {
    const providerLabel = option.providerLabel ?? option.providerId;
    if (!providerLabel) {
        return undefined;
    }

    const suffixes = [
        option.providerConnectionLabel,
        option.providerAuthMethod,
        option.providerAuthState,
        option.sourceProvider,
        option.promptFamily,
    ].filter((value): value is string => Boolean(value));
    return suffixes.length > 0 ? `${providerLabel} · ${suffixes.join(' · ')}` : providerLabel;
}

function getAvailabilityLabel(option: ModelPickerOption): string | undefined {
    if (option.compatibilityState === 'compatible') {
        return undefined;
    }
    return option.compatibilityReason ?? option.compatibilityState.replaceAll('_', ' ');
}

export function buildModelPickerGroups(options: ModelPickerOption[]): ModelPickerRawGroup[] {
    const groups = new Map<string, ModelPickerRawGroup>();
    for (const option of options) {
        const groupKey = getGroupKey(option);
        const existingGroup = groups.get(groupKey);
        if (existingGroup) {
            existingGroup.options.push(option);
            continue;
        }

        groups.set(groupKey, {
            key: groupKey,
            label: getGroupLabel(option),
            options: [option],
        });
    }

    return [...groups.values()]
        .sort((left, right) => {
            const orderDifference = getGroupOrder(left.key) - getGroupOrder(right.key);
            if (orderDifference !== 0) {
                return orderDifference;
            }

            return left.label.localeCompare(right.label);
        })
        .map((group) => ({
            ...group,
            options: [...group.options].sort((left, right) => {
                const preferredOrder = new Map<string, number>([
                    [kiloFrontierModelId, 0],
                    [kiloBalancedModelId, 1],
                    [kiloFreeModelId, 2],
                    [kiloSmallModelId, 3],
                ]);
                const leftOrder = preferredOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER;
                const rightOrder = preferredOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER;
                if (leftOrder !== rightOrder) {
                    return leftOrder - rightOrder;
                }

                return getDisplayLabel(left).localeCompare(getDisplayLabel(right));
            }),
        }));
}

export function getModelDescription(option: ModelPickerOption): string {
    if (option.id === kiloFrontierModelId) {
        return 'Automatic Kilo routing to the best model for the task.';
    }

    if (option.id === kiloBalancedModelId) {
        return 'Automatic Kilo routing tuned for lower-cost mixed routing.';
    }

    if (option.id === kiloFreeModelId) {
        return 'Automatic Kilo routing limited to the Kilo free tier.';
    }

    if (option.id === kiloSmallModelId) {
        return 'Automatic Kilo routing tuned for smaller background and utility work.';
    }

    if (option.providerId === 'kilo') {
        if (option.sourceProvider) {
            return `Kilo gateway model routed through ${option.sourceProvider}.`;
        }
        if (option.promptFamily) {
            return `${option.promptFamily} profile on the Kilo gateway.`;
        }

        return 'Kilo gateway model.';
    }

    return `${option.providerLabel ?? option.providerId ?? 'Custom'} provider model.`;
}

export function formatCapabilityBadge(badge: ModelCapabilityBadge): string {
    return badge.label;
}

export function buildModelOptionViewModel(
    option: ModelPickerOption,
    collisionIndex: ModelLabelCollisionIndex,
    input?: {
        favoriteModels?: ProviderModelFavoriteRecord[];
        roleDefaultReferences?: ModelRoleDefaultRecord[];
    }
): ModelOptionViewModel {
    const priceMetric = formatMetric(option.price);
    const latencyMetric = formatMetric(option.latency);
    const throughputMetric = formatMetric(option.tps);
    const favoriteModels = input?.favoriteModels ?? [];
    const roleDefaultReferences = input?.roleDefaultReferences ?? [];

    return {
        key: getModelKey(option),
        option,
        displayText: getOptionDisplayText(option, collisionIndex),
        description: getModelDescription(option),
        metricBadges: [
            priceMetric ? `Price ${priceMetric}` : undefined,
            latencyMetric ? `Latency ${latencyMetric}` : undefined,
            throughputMetric ? `TPS ${throughputMetric}` : undefined,
        ].filter((badge): badge is string => Boolean(badge)),
        sourceProviderBadge: option.sourceProvider,
        providerInstanceBadge: getProviderInstanceBadge(option),
        capabilityBadges: option.capabilityBadges.map((badge) => formatCapabilityBadge(badge)),
        roleDefaultBadges: getRoleDefaultBadges(option, roleDefaultReferences),
        availabilityLabel: getAvailabilityLabel(option),
        isFavorite: isFavoriteModel(option, favoriteModels),
        selected: false,
    };
}

export function buildModelPickerReadModel(input: {
    models: ModelPickerOption[];
    selectedModelId: string;
    favoriteModels?: ProviderModelFavoriteRecord[];
    roleDefaultReferences?: ModelRoleDefaultRecord[];
}): ModelPickerReadModel {
    const labelCollisionIndex = getModelLabelCollisionIndex(input.models);
    const selectedOption = input.models.find((option) => option.id === input.selectedModelId);
    const favoriteModels = input.favoriteModels ?? [];
    const roleDefaultReferences = input.roleDefaultReferences ?? [];

    const groups: ModelGroupViewModel[] = buildModelPickerGroups(input.models).map((group) => ({
        key: group.key,
        label: group.label,
        options: group.options
            .map((option) => ({
                ...buildModelOptionViewModel(option, labelCollisionIndex, {
                    favoriteModels,
                    roleDefaultReferences,
                }),
                selected: option.id === input.selectedModelId,
            }))
            .sort((left, right) => {
                const favoriteDifference = Number(right.isFavorite) - Number(left.isFavorite);
                if (favoriteDifference !== 0) {
                    return favoriteDifference;
                }
                return 0;
            }),
    }));

    return {
        selectedOption,
        labelCollisionIndex,
        groups,
        options: groups.flatMap((group) => group.options),
    };
}
