import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import type { ModelRoleDefaultRecord } from '@/shared/contracts/types/modelOptimization';
import type { ProviderModelFavoriteRecord } from '@/shared/contracts/types/provider';
import type { RuntimeProviderId } from '@/shared/contracts';

export interface ModelPickerProps {
    providerId: RuntimeProviderId | undefined;
    selectedModelId: string;
    models: ModelPickerOption[];
    favoriteModels?: ProviderModelFavoriteRecord[];
    roleDefaultReferences?: ModelRoleDefaultRecord[];
    continuationLockMessage?: string;
    disabled?: boolean;
    id?: string;
    name?: string;
    ariaLabel: string;
    placeholder: string;
    onSelectModel: (modelId: string) => void;
    onSelectOption?: (option: ModelPickerOption) => void;
    onToggleFavorite?: (option: ModelPickerOption, favorite: boolean) => void;
}

export interface ModelGroupViewModel {
    key: string;
    label: string;
    options: ModelOptionViewModel[];
}

export interface PopoverLayout {
    top: number;
    left: number;
    width: number;
    maxHeight: number;
}

export type ModelLabelCollisionIndex = ReadonlyMap<string, number>;

export interface ModelOptionViewModel {
    key: string;
    option: ModelPickerOption;
    displayText: string;
    description: string;
    metricBadges: string[];
    sourceProviderBadge: string | undefined;
    providerInstanceBadge: string | undefined;
    capabilityBadges: string[];
    roleDefaultBadges: string[];
    availabilityLabel: string | undefined;
    isFavorite: boolean;
    selected: boolean;
}

export interface ModelPickerReadModel {
    selectedOption: ModelPickerOption | undefined;
    labelCollisionIndex: ModelLabelCollisionIndex;
    groups: Array<{
        key: string;
        label: string;
        options: ModelOptionViewModel[];
    }>;
    options: ModelOptionViewModel[];
}
