import { projectProviderSettingsControlPlaneCache } from '@/web/components/settings/providerSettings/providerSettingsControlPlaneCacheProjector';
import { projectProviderSettingsSupplementalCache } from '@/web/components/settings/providerSettings/providerSettingsSupplementalCacheProjector';

import type { ProviderSettingsCacheProjectionInput } from '@/web/components/settings/providerSettings/providerSettingsCache.types';

export type { ProviderSettingsCacheProjectionInput } from '@/web/components/settings/providerSettings/providerSettingsCache.types';

export function patchProviderCache(input: ProviderSettingsCacheProjectionInput): void {
    projectProviderSettingsControlPlaneCache(input);
    projectProviderSettingsSupplementalCache(input);
}
