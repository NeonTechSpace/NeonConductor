import { KiloAccountAccessScreen, KiloGatewayModelsScreen, KiloRoutingScreen } from '@/web/components/settings/kiloSettingsSections';
import { useKiloSettingsController } from '@/web/components/settings/providerSettings/hooks/useKiloSettingsController';
import { useKiloInitialCatalogBootstrap } from '@/web/components/settings/providerSettings/hooks/useKiloInitialCatalogBootstrap';
import { KILO_SETTINGS_SUBSECTIONS, type KiloSettingsSubsectionId } from '@/web/components/settings/settingsNavigation';
import { SettingsSelectionRail } from '@/web/components/settings/shared/settingsSelectionRail';

interface KiloSettingsViewProps {
    profileId: string;
    subsection?: KiloSettingsSubsectionId;
    onSubsectionChange?: (subsection: KiloSettingsSubsectionId) => void;
}

export function KiloSettingsView({ profileId, subsection = 'account', onSubsectionChange }: KiloSettingsViewProps) {
    const controller = useKiloSettingsController(profileId);

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
        <section className='grid h-full min-h-0 min-w-0 overflow-hidden xl:grid-cols-[280px_minmax(0,1fr)]'>
            <SettingsSelectionRail
                title='Kilo'
                ariaLabel='Kilo settings sections'
                selectedId={subsection}
                onSelect={(itemId) => {
                    const nextSection = KILO_SETTINGS_SUBSECTIONS.find((candidate) => candidate.id === itemId);
                    if (!nextSection || nextSection.availability !== 'available') {
                        return;
                    }

                    onSubsectionChange?.(nextSection.id);
                }}
                items={KILO_SETTINGS_SUBSECTIONS.map((item) => ({
                    id: item.id,
                    title: item.label,
                    subtitle: item.description,
                    ...(item.availability === 'planned' ? { meta: 'Planned', disabled: true } : {}),
                }))}
            />

            <div className='min-h-0 min-w-0 overflow-y-auto p-5 md:p-6'>
                {subsection === 'account' ? (
                    <KiloAccountAccessScreen
                        profileId={profileId}
                        controller={controller}
                        selectedProvider={controller.selectedProvider}
                    />
                ) : null}
                {subsection === 'models' ? (
                    <KiloGatewayModelsScreen profileId={profileId} controller={controller} />
                ) : null}
                {subsection === 'routing' ? <KiloRoutingScreen controller={controller} /> : null}
                {subsection === 'marketplace' ? (
                    <div className='border-border/70 bg-card/50 rounded-[24px] border p-5'>
                        <p className='text-sm font-semibold'>Marketplace is not available yet</p>
                        <p className='text-muted-foreground mt-2 text-sm leading-6'>
                            Marketplace installation and update management remain reserved here, while app-level modes
                            and instruction controls now live in their own shared settings surface.
                        </p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
