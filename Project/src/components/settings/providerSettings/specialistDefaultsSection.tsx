import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { useProviderSpecialistDefaultsController } from '@/web/components/settings/providerSettings/hooks/useProviderSpecialistDefaultsController';

interface ProviderSpecialistDefaultsSectionProps {
    profileId: string;
}

export function ProviderSpecialistDefaultsSection({ profileId }: ProviderSpecialistDefaultsSectionProps) {
    const controller = useProviderSpecialistDefaultsController({ profileId });

    return (
        <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Specialist defaults</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Choose the default provider/model for each runnable specialist preset. If a preset has no saved
                    specialist default, NeonConductor falls back to the shared default model.
                </p>
            </div>

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <div className='grid gap-4 xl:grid-cols-2'>
                {controller.groups.map((group) => (
                    <article key={group.label} className='border-border/70 bg-background/70 rounded-2xl border p-4'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>{group.label}</p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                Saved defaults here override the shared fallback for {group.label.toLowerCase()} runs.
                            </p>
                        </div>

                        <div className='mt-4 space-y-4'>
                            {group.targets.map((target) => {
                                return (
                                    <div key={`${target.target.topLevelTab}:${target.target.modeKey}`} className='space-y-2'>
                                        <div className='flex items-center justify-between gap-3'>
                                            <div className='space-y-1'>
                                                <p className='text-sm font-medium'>{target.target.label}</p>
                                                <p className='text-muted-foreground text-[11px] leading-5'>
                                                    {target.sourceLabel}
                                                </p>
                                            </div>
                                            <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                                {target.target.topLevelTab}
                                            </span>
                                        </div>
                                        <ModelPicker
                                            providerId={target.selectedProviderId}
                                            selectedModelId={target.selectedModelId}
                                            models={target.modeOptions}
                                            disabled={target.modeOptions.length === 0}
                                            ariaLabel={`${target.target.label} default model`}
                                            placeholder='Select model'
                                            onSelectModel={() => {}}
                                            onSelectOption={(option) => {
                                                if (!option.providerId) {
                                                    return;
                                                }

                                                controller.saveSpecialistDefault({
                                                    topLevelTab: target.target.topLevelTab,
                                                    modeKey: target.target.modeKey,
                                                    providerId: option.providerId,
                                                    modelId: option.id,
                                                });
                                            }}
                                        />
                                        {target.selectedOption?.compatibilityReason &&
                                        target.selectedOption.compatibilityScope !== 'provider' ? (
                                            <p className='text-muted-foreground text-[11px] leading-5'>
                                                {target.selectedOption.compatibilityReason}
                                            </p>
                                        ) : null}
                                    </div>
                                );
                            })}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
