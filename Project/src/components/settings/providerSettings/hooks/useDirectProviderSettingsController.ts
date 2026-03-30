import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';

import { buildProviderSettingsControllerState, type ProviderSettingsControllerState } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import {
    useProviderSettingsSurfaceState,
    type ProviderSettingsControllerOptions,
} from '@/web/components/settings/providerSettings/hooks/useProviderSettingsSurfaceState';

import type { RuntimeProviderId } from '@/shared/contracts';

function wrapFailClosedAction<TArgs extends unknown[]>(action: (...args: TArgs) => Promise<void>) {
    return createFailClosedAsyncAction(action);
}

export interface DirectProviderSettingsControllerState {
    feedback: ProviderSettingsControllerState['feedback'];
    selection: {
        providerItems: ProviderSettingsControllerState['selection']['providerItems'];
        selectedProviderId: RuntimeProviderId | undefined;
        selectedProvider: Exclude<ProviderSettingsControllerState['selection']['selectedProvider'], undefined>;
        selectProvider: ProviderSettingsControllerState['selection']['selectProvider'];
        prefetchProvider: ProviderSettingsControllerState['selection']['prefetchProvider'];
    } | {
        providerItems: ProviderSettingsControllerState['selection']['providerItems'];
        selectedProviderId: RuntimeProviderId | undefined;
        selectedProvider: undefined;
        selectProvider: ProviderSettingsControllerState['selection']['selectProvider'];
        prefetchProvider: ProviderSettingsControllerState['selection']['prefetchProvider'];
    };
    providerStatus: ProviderSettingsControllerState['providerStatus'];
    authentication: ProviderSettingsControllerState['authentication'];
    models: ProviderSettingsControllerState['models'];
    isKiloSelected: boolean;
}

export function useDirectProviderSettingsController(profileId: string, options?: ProviderSettingsControllerOptions) {
    const surfaceState = useProviderSettingsSurfaceState(profileId, options);
    const controllerState = buildProviderSettingsControllerState(surfaceState);
    const providerItems = controllerState.selection.providerItems.filter((provider) => provider.id !== 'kilo');
    const isKiloSelected = controllerState.selection.selectedProviderId === 'kilo';
    const selectedProvider =
        controllerState.selection.selectedProvider?.id === 'kilo'
            ? undefined
            : controllerState.selection.selectedProvider;

    return {
        feedback: controllerState.feedback,
        selection: {
            providerItems,
            selectedProviderId: controllerState.selection.selectedProviderId,
            selectedProvider,
            selectProvider: controllerState.selection.selectProvider,
            prefetchProvider: controllerState.selection.prefetchProvider,
        },
        providerStatus: {
            ...controllerState.providerStatus,
            refreshOpenAICodexUsage: wrapFailClosedAction(controllerState.providerStatus.refreshOpenAICodexUsage),
        },
        authentication: controllerState.authentication,
        models: controllerState.models,
        isKiloSelected,
    } satisfies DirectProviderSettingsControllerState;
}
