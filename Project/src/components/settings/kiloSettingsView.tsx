import { KiloAccountAccessScreen, KiloGatewayModelsScreen, KiloRoutingScreen } from '@/web/components/settings/kiloSettingsSections';
import { useKiloInitialCatalogBootstrap } from '@/web/components/settings/providerSettings/hooks/useKiloInitialCatalogBootstrap';
import { useKiloSettingsController } from '@/web/components/settings/providerSettings/hooks/useKiloSettingsController';
import type { KiloSettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import { SettingsContentScaffold } from '@/web/components/settings/shared/settingsContentScaffold';

interface KiloSettingsViewProps {
    profileId: string;
    subsection?: KiloSettingsSubsectionId;
    onSubsectionChange?: (subsection: KiloSettingsSubsectionId) => void;
}

function getKiloSectionMetadata(subsection: KiloSettingsSubsectionId): {
    title: string;
    description: string;
} {
    switch (subsection) {
        case 'account':
            return {
                title: 'Account & Access',
                description:
                    'Sign in to Kilo, inspect identity and organization state, and manage session access from one place.',
            };
        case 'models':
            return {
                title: 'Gateway Models',
                description:
                    'Set the default Kilo model for this profile and decide which provider and model pairs specialists should prefer.',
            };
        case 'routing':
            return {
                title: 'Provider Choice',
                description:
                    'Choose how Kilo should route a selected model when multiple upstream providers are available.',
            };
        case 'marketplace':
            return {
                title: 'Marketplace',
                description:
                    'Marketplace installation and update management remain reserved here while the rest of the Kilo setup lives in the shared Settings shell.',
            };
    }
}

export function KiloSettingsView({ profileId, subsection = 'account' }: KiloSettingsViewProps) {
    const controller = useKiloSettingsController(profileId);
    const sectionMetadata = getKiloSectionMetadata(subsection);

    useKiloInitialCatalogBootstrap({
        selectedProviderId: controller.selectedProvider?.id,
        effectiveAuthState: controller.effectiveAuthState,
        modelOptionCount: controller.models.options.length,
        isSyncingCatalog: controller.models.isSyncingCatalog,
        syncCatalog: controller.models.syncCatalog,
    });

    if (!controller.selectedProvider || controller.selectedProvider.id !== 'kilo') {
        return <p className='text-muted-foreground p-5 text-sm'>Kilo is not available for this profile.</p>;
    }

    return (
        <SettingsContentScaffold
            eyebrow='Kilo'
            title={sectionMetadata.title}
            description={sectionMetadata.description}
            toolbar={
                subsection === 'account' ? (
                    <div className='border-border/70 bg-background/80 rounded-full border px-3 py-1.5 text-xs font-medium'>
                        Auth {controller.effectiveAuthState}
                    </div>
                ) : undefined
            }
            contentClassName='max-w-6xl'>
            {subsection === 'account' ? (
                <KiloAccountAccessScreen
                    profileId={profileId}
                    controller={controller}
                    selectedProvider={controller.selectedProvider}
                />
            ) : null}
            {subsection === 'models' ? <KiloGatewayModelsScreen profileId={profileId} controller={controller} /> : null}
            {subsection === 'routing' ? <KiloRoutingScreen controller={controller} /> : null}
            {subsection === 'marketplace' ? (
                <div className='border-border/70 bg-card/50 rounded-[24px] border p-5'>
                    <p className='text-sm font-semibold'>Marketplace is not available yet</p>
                    <p className='text-muted-foreground mt-2 text-sm leading-6'>
                        Marketplace installation and update management remain reserved here, while app-level modes and
                        instruction controls now live in their own shared settings surface.
                    </p>
                </div>
            ) : null}
        </SettingsContentScaffold>
    );
}
