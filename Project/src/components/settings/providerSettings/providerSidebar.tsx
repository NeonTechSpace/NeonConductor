import { methodLabel } from '@/web/components/settings/providerSettings/helpers';
import type { ProviderListItem } from '@/web/components/settings/providerSettings/types';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderSidebarProps {
    providers: ProviderListItem[];
    selectedProviderId: RuntimeProviderId | undefined;
    onSelectProvider: (providerId: RuntimeProviderId) => void;
    onPreviewProvider?: (providerId: RuntimeProviderId) => void;
}

export function ProviderSidebar({
    providers,
    selectedProviderId,
    onSelectProvider,
    onPreviewProvider,
}: ProviderSidebarProps) {
    return (
        <SettingsSelectionRail
            title='Providers'
            ariaLabel='Provider list'
            {...(selectedProviderId ? { selectedId: selectedProviderId } : {})}
            onSelect={(providerId) => {
                const provider = providers.find((candidate) => candidate.id === providerId);
                if (!provider) {
                    return;
                }

                onSelectProvider(provider.id);
            }}
            onItemIntent={(providerId) => {
                const provider = providers.find((candidate) => candidate.id === providerId);
                if (!provider) {
                    return;
                }

                onPreviewProvider?.(provider.id);
            }}
            items={providers.map((provider) => ({
                id: provider.id,
                title: provider.label,
                subtitle: `${provider.authState.replace('_', ' ')} · ${methodLabel(provider.authMethod)}`,
                ...(provider.isDefault ? { meta: 'Default' } : {}),
            }))}
        />
    );
}

