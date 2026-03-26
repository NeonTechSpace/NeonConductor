import { useState } from 'react';

import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { SettingsFeedbackBanner } from '@/web/components/settings/shared/settingsFeedbackBanner';
import {
    getProviderControlDefaults,
    getProviderControlSpecialistDefaults,
    listProviderControlModels,
    listProviderControlProviders,
} from '@/web/lib/providerControl/selectors';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import { findProviderSpecialistDefault, providerSpecialistDefaultTargets } from '@/shared/contracts';
import { providerIds } from '@/shared/contracts';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';

interface ProviderSpecialistDefaultsSectionProps {
    profileId: string;
}

function isRuntimeProviderId(value: string | undefined): value is ProviderListItem['id'] {
    return isOneOf(value, providerIds);
}

function createModeOptions(input: {
    providers: Array<Pick<ProviderListItem, 'id' | 'label' | 'authState' | 'authMethod'>>;
    providerModels: ProviderModelRecord[];
    topLevelTab: 'agent' | 'orchestrator';
    modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
}) {
    return input.providers.flatMap((provider) =>
        input.providerModels
            .filter((model) => model.providerId === provider.id)
            .map((model) =>
                buildModelPickerOption({
                    model,
                    provider,
                    compatibilityContext: {
                        surface: 'conversation',
                        requiresTools: true,
                        modeKey: input.modeKey,
                    },
                })
            )
    );
}

export function ProviderSpecialistDefaultsSection({ profileId }: ProviderSpecialistDefaultsSectionProps) {
    const utils = trpc.useUtils();
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery({ profileId }, PROGRESSIVE_QUERY_OPTIONS);
    const [statusMessage, setStatusMessage] = useState<string | undefined>(undefined);

    const setSpecialistDefaultMutation = trpc.provider.setSpecialistDefault.useMutation({
        onSuccess: (result, variables) => {
            if (!result.success) {
                const failureMessage =
                    result.reason === 'model_not_found'
                        ? 'Selected model is not available.'
                        : result.reason === 'model_tools_required'
                          ? 'Selected model cannot be used for specialist defaults because it does not support native tools.'
                          : result.reason === 'provider_not_found'
                            ? 'Selected provider is no longer available.'
                            : 'Specialist default could not be saved.';
                setStatusMessage(failureMessage);
                return;
            }

            setStatusMessage(`${variables.topLevelTab}.${variables.modeKey} default updated.`);
            utils.provider.getControlPlane.invalidate({ profileId }).catch(() => undefined);
            utils.runtime.getShellBootstrap.invalidate({ profileId }).catch(() => undefined);
        },
    });

    const providerControl = shellBootstrapQuery.data?.providerControl;
    const providers = listProviderControlProviders(providerControl).filter((provider) =>
        isRuntimeProviderId(provider.id)
    );
    const providerModels = listProviderControlModels(providerControl);
    const defaults = getProviderControlDefaults(providerControl);
    const specialistDefaults = getProviderControlSpecialistDefaults(providerControl);
    const sectionGroups = [
        {
            label: 'Agent',
            targets: providerSpecialistDefaultTargets.filter((target) => target.topLevelTab === 'agent'),
        },
        {
            label: 'Orchestrator',
            targets: providerSpecialistDefaultTargets.filter((target) => target.topLevelTab === 'orchestrator'),
        },
    ];

    async function handleSelectSpecialistDefault(input: {
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: ProviderListItem['id'];
        modelId: string;
    }) {
        await setSpecialistDefaultMutation
            .mutateAsync({
                profileId,
                topLevelTab: input.topLevelTab,
                modeKey: input.modeKey,
                providerId: input.providerId,
                modelId: input.modelId,
            })
            .catch(() => undefined);
    }

    return (
        <section className='border-border/70 bg-card/40 space-y-4 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Specialist defaults</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    Choose the default provider/model for each runnable specialist preset. If a preset has no saved
                    specialist default, NeonConductor falls back to the shared default model.
                </p>
            </div>

            <SettingsFeedbackBanner
                message={setSpecialistDefaultMutation.error?.message ?? statusMessage}
                tone={setSpecialistDefaultMutation.error ? 'error' : statusMessage ? 'success' : 'info'}
            />

            <div className='grid gap-4 xl:grid-cols-2'>
                {sectionGroups.map((group) => (
                    <article key={group.label} className='border-border/70 bg-background/70 rounded-2xl border p-4'>
                        <div className='space-y-1'>
                            <p className='text-sm font-semibold'>{group.label}</p>
                            <p className='text-muted-foreground text-xs leading-5'>
                                Saved defaults here override the shared fallback for {group.label.toLowerCase()} runs.
                            </p>
                        </div>

                        <div className='mt-4 space-y-4'>
                            {group.targets.map((target) => {
                                const modeOptions = createModeOptions({
                                    providers,
                                    providerModels,
                                    topLevelTab: target.topLevelTab,
                                    modeKey: target.modeKey,
                                });
                                const savedSpecialistDefault = findProviderSpecialistDefault(
                                    specialistDefaults,
                                    target
                                );
                                const fallbackProviderId =
                                    defaults && isRuntimeProviderId(defaults.providerId)
                                        ? defaults.providerId
                                        : undefined;
                                const fallbackModelId =
                                    fallbackProviderId && defaults?.modelId
                                        ? canonicalizeProviderModelId(fallbackProviderId, defaults.modelId)
                                        : '';
                                const savedModelId =
                                    savedSpecialistDefault &&
                                    modeOptions.some(
                                        (option) =>
                                            option.providerId === savedSpecialistDefault.providerId &&
                                            option.id ===
                                                canonicalizeProviderModelId(
                                                    savedSpecialistDefault.providerId,
                                                    savedSpecialistDefault.modelId
                                                )
                                    )
                                        ? canonicalizeProviderModelId(
                                              savedSpecialistDefault.providerId,
                                              savedSpecialistDefault.modelId
                                          )
                                        : '';
                                const selectedModelId =
                                    savedModelId ||
                                    (fallbackModelId && modeOptions.some((option) => option.id === fallbackModelId)
                                        ? fallbackModelId
                                        : '');
                                const selectedProviderId =
                                    savedSpecialistDefault?.providerId ??
                                    (fallbackProviderId &&
                                    modeOptions.some((option) => option.providerId === fallbackProviderId)
                                        ? fallbackProviderId
                                        : undefined);
                                const selectedOption = modeOptions.find((option) => option.id === selectedModelId);
                                const sourceLabel = savedSpecialistDefault
                                    ? 'Saved specialist default'
                                    : 'Using shared fallback';

                                return (
                                    <div key={`${target.topLevelTab}:${target.modeKey}`} className='space-y-2'>
                                        <div className='flex items-center justify-between gap-3'>
                                            <div className='space-y-1'>
                                                <p className='text-sm font-medium'>{target.label}</p>
                                                <p className='text-muted-foreground text-[11px] leading-5'>
                                                    {sourceLabel}
                                                </p>
                                            </div>
                                            <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                                                {target.topLevelTab}
                                            </span>
                                        </div>
                                        <ModelPicker
                                            providerId={selectedProviderId}
                                            selectedModelId={selectedModelId}
                                            models={modeOptions}
                                            disabled={modeOptions.length === 0}
                                            ariaLabel={`${target.label} default model`}
                                            placeholder='Select model'
                                            onSelectModel={() => {}}
                                            onSelectOption={(option) => {
                                                if (!option.providerId || !isRuntimeProviderId(option.providerId)) {
                                                    return;
                                                }

                                                void handleSelectSpecialistDefault({
                                                    topLevelTab: target.topLevelTab,
                                                    modeKey: target.modeKey,
                                                    providerId: option.providerId,
                                                    modelId: option.id,
                                                });
                                            }}
                                        />
                                        {selectedOption?.compatibilityReason &&
                                        selectedOption.compatibilityScope !== 'provider' ? (
                                            <p className='text-muted-foreground text-[11px] leading-5'>
                                                {selectedOption.compatibilityReason}
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
