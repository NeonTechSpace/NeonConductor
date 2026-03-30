import { buildProviderSettingsControllerState, type ProviderSettingsControllerState } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsController';
import { useProviderSettingsSurfaceState } from '@/web/components/settings/providerSettings/hooks/useProviderSettingsSurfaceState';

export interface KiloSettingsControllerState {
    feedback: ProviderSettingsControllerState['feedback'];
    providerStatus: ProviderSettingsControllerState['providerStatus'];
    authentication: ProviderSettingsControllerState['authentication'];
    models: ProviderSettingsControllerState['models'];
    kilo: ProviderSettingsControllerState['kilo'];
    selectedProvider: ProviderSettingsControllerState['selection']['selectedProvider'];
    effectiveAuthState: string;
}

export function useKiloSettingsController(profileId: string) {
    const surfaceState = useProviderSettingsSurfaceState(profileId, { initialProviderId: 'kilo' });
    const controllerState = buildProviderSettingsControllerState(surfaceState);
    const selectedProvider =
        controllerState.selection.selectedProvider?.id === 'kilo'
            ? controllerState.selection.selectedProvider
            : controllerState.selection.providerItems.find((provider) => provider.id === 'kilo');
    const effectiveAuthState =
        controllerState.providerStatus.authState?.authState ?? selectedProvider?.authState ?? 'logged_out';

    return {
        feedback: controllerState.feedback,
        providerStatus: controllerState.providerStatus,
        authentication: controllerState.authentication,
        models: controllerState.models,
        kilo: controllerState.kilo,
        selectedProvider,
        effectiveAuthState,
    } satisfies KiloSettingsControllerState;
}
