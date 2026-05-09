import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { useProviderWorkflowRoutingController } from '@/web/components/settings/providerSettings/hooks/useProviderWorkflowRoutingController';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import { Button } from '@/web/components/ui/button';

interface ProviderWorkflowRoutingSectionProps {
    profileId: string;
}

export function ProviderWorkflowRoutingSection({ profileId }: ProviderWorkflowRoutingSectionProps) {
    const controller = useProviderWorkflowRoutingController({ profileId });

    return (
        <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Planner role routing</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Choose the internal planner role targets for planning surfaces. These preferences stay profile-wide
                    and only affect planning, not the runnable defaults below.
                </p>
            </div>

            <SettingsFeedbackBanner message={controller.feedback.message} tone={controller.feedback.tone} />

            <div className='grid gap-4 xl:grid-cols-2'>
                {controller.targets.map((target) => (
                    <article key={target.targetKey} className='border-border/70 bg-background/70 rounded-2xl border p-4'>
                        <div className='flex items-start justify-between gap-3'>
                            <div className='space-y-1'>
                                <p className='text-sm font-semibold'>{target.label}</p>
                                <p className='text-muted-foreground text-xs leading-5'>{target.sourceLabel}</p>
                            </div>
                            <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                Planner role
                            </span>
                        </div>

                        <div className='mt-4 space-y-2'>
                            <label className='sr-only' htmlFor={`workflow-routing-${target.targetKey}`}>
                                {target.label} routing model
                            </label>
                            <ModelPicker
                                id={`workflow-routing-${target.targetKey}`}
                                name={`workflowRouting${target.targetKey}`}
                                providerId={target.selectedProviderId}
                                selectedModelId={target.selectedModelId}
                                models={target.modeOptions}
                                favoriteModels={controller.modelFavorites}
                                roleDefaultReferences={controller.modelRoleDefaults}
                                disabled={target.modeOptions.length === 0}
                                ariaLabel={`${target.label} routing model`}
                                placeholder='Select model'
                                onSelectModel={() => {}}
                                onToggleFavorite={controller.saveModelFavorite}
                                onSelectOption={(option) => {
                                    if (!option.providerId) {
                                        return;
                                    }

                                    controller.saveWorkflowRoutingPreference({
                                        targetKey: target.targetKey,
                                        providerId: option.providerId,
                                        modelId: option.id,
                                    });
                                }}
                            />
                            <div className='flex flex-wrap items-center gap-2'>
                                <p className='text-muted-foreground text-[11px] leading-5'>
                                    {controller.isSaving
                                        ? 'Saving workflow routing...'
                                        : target.selectedModelId
                                          ? 'Selecting a different model updates this routing target immediately.'
                                          : 'Select a model to save it as the routing default.'}
                                </p>
                                {target.canClear ? (
                                    <Button
                                        type='button'
                                        size='sm'
                                        variant='outline'
                                        disabled={controller.isSaving}
                                        onClick={() => {
                                            controller.clearWorkflowRoutingPreference({
                                                targetKey: target.targetKey,
                                            });
                                        }}>
                                        Clear
                                    </Button>
                                ) : null}
                            </div>
                            {target.selectedOption?.compatibilityReason ? (
                                <p className='text-muted-foreground text-[11px] leading-5'>
                                    {target.selectedOption.compatibilityReason}
                                </p>
                            ) : null}
                        </div>
                    </article>
                ))}
            </div>
        </section>
    );
}
