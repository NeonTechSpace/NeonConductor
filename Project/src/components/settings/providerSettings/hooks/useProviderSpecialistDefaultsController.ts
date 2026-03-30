import { useState } from 'react';

import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { createFailClosedAsyncAction } from '@/web/lib/async/createFailClosedAsyncAction';
import {
    buildProviderSettingsFeedback,
    type ProviderSettingsFeedbackState,
} from '@/web/components/settings/providerSettings/hooks/providerSettingsFeedback';
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
import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';

import { findProviderSpecialistDefault, providerSpecialistDefaultTargets } from '@/shared/contracts';
import { providerIds } from '@/shared/contracts';
import { canonicalizeProviderModelId } from '@/shared/kiloModels';

function isRuntimeProviderId(value: string | undefined): value is ProviderListItem['id'] {
    return isOneOf(value, providerIds);
}

function createModeOptions(input: {
    providers: Array<Pick<ProviderListItem, 'id' | 'label' | 'authState' | 'authMethod'>>;
    providerModels: ProviderModelRecord[];
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

export interface ProviderSpecialistDefaultsTargetViewModel {
    target: (typeof providerSpecialistDefaultTargets)[number];
    modeOptions: ModelPickerOption[];
    selectedProviderId: ProviderListItem['id'] | undefined;
    selectedModelId: string;
    selectedOption: ModelPickerOption | undefined;
    sourceLabel: string;
}

export interface ProviderSpecialistDefaultsSectionGroupViewModel {
    label: string;
    targets: ProviderSpecialistDefaultsTargetViewModel[];
}

export interface ProviderSpecialistDefaultsControllerState {
    feedback: ProviderSettingsFeedbackState;
    groups: ProviderSpecialistDefaultsSectionGroupViewModel[];
    isSaving: boolean;
    saveSpecialistDefault: (input: {
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: ProviderListItem['id'];
        modelId: string;
    }) => void;
}

export function useProviderSpecialistDefaultsController(input: { profileId: string }): ProviderSpecialistDefaultsControllerState {
    const utils = trpc.useUtils();
    const shellBootstrapQuery = trpc.runtime.getShellBootstrap.useQuery({ profileId: input.profileId }, PROGRESSIVE_QUERY_OPTIONS);
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
            void Promise.allSettled([
                utils.provider.getControlPlane.invalidate({ profileId: input.profileId }),
                utils.runtime.getShellBootstrap.invalidate({ profileId: input.profileId }),
            ]);
        },
    });

    const providerControl = shellBootstrapQuery.data?.providerControl;
    const providers = listProviderControlProviders(providerControl).filter((provider) =>
        isRuntimeProviderId(provider.id)
    );
    const providerModels = listProviderControlModels(providerControl);
    const defaults = getProviderControlDefaults(providerControl);
    const specialistDefaults = getProviderControlSpecialistDefaults(providerControl);

    const groups = [
        {
            label: 'Agent',
            targets: providerSpecialistDefaultTargets
                .filter((target) => target.topLevelTab === 'agent')
                .map((target) => {
                    const modeOptions = createModeOptions({
                        providers,
                        providerModels,
                        modeKey: target.modeKey,
                    });
                    const savedSpecialistDefault = findProviderSpecialistDefault(specialistDefaults, target);
                    const fallbackProviderId =
                        defaults && isRuntimeProviderId(defaults.providerId) ? defaults.providerId : undefined;
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
                        savedModelId || (fallbackModelId && modeOptions.some((option) => option.id === fallbackModelId) ? fallbackModelId : '');
                    const selectedProviderId =
                        savedSpecialistDefault?.providerId ??
                        (fallbackProviderId && modeOptions.some((option) => option.providerId === fallbackProviderId)
                            ? fallbackProviderId
                            : undefined);
                    const selectedOption = modeOptions.find((option) => option.id === selectedModelId);

                    return {
                        target,
                        modeOptions,
                        selectedProviderId,
                        selectedModelId,
                        selectedOption,
                        sourceLabel: savedSpecialistDefault ? 'Saved specialist default' : 'Using shared fallback',
                    };
                }),
        },
        {
            label: 'Orchestrator',
            targets: providerSpecialistDefaultTargets
                .filter((target) => target.topLevelTab === 'orchestrator')
                .map((target) => {
                    const modeOptions = createModeOptions({
                        providers,
                        providerModels,
                        modeKey: target.modeKey,
                    });
                    const savedSpecialistDefault = findProviderSpecialistDefault(specialistDefaults, target);
                    const fallbackProviderId =
                        defaults && isRuntimeProviderId(defaults.providerId) ? defaults.providerId : undefined;
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
                        savedModelId || (fallbackModelId && modeOptions.some((option) => option.id === fallbackModelId) ? fallbackModelId : '');
                    const selectedProviderId =
                        savedSpecialistDefault?.providerId ??
                        (fallbackProviderId && modeOptions.some((option) => option.providerId === fallbackProviderId)
                            ? fallbackProviderId
                            : undefined);
                    const selectedOption = modeOptions.find((option) => option.id === selectedModelId);

                    return {
                        target,
                        modeOptions,
                        selectedProviderId,
                        selectedModelId,
                        selectedOption,
                        sourceLabel: savedSpecialistDefault ? 'Saved specialist default' : 'Using shared fallback',
                    };
                }),
        },
    ];

    async function saveSpecialistDefaultInternal(inputValue: {
        topLevelTab: 'agent' | 'orchestrator';
        modeKey: 'ask' | 'code' | 'debug' | 'orchestrate';
        providerId: ProviderListItem['id'];
        modelId: string;
    }) {
        try {
            await setSpecialistDefaultMutation.mutateAsync({
                profileId: input.profileId,
                topLevelTab: inputValue.topLevelTab,
                modeKey: inputValue.modeKey,
                providerId: inputValue.providerId,
                modelId: inputValue.modelId,
            });
        } catch {
            // The mutation error is surfaced through the hook state and feedback banner.
        }
    }

    return {
        feedback: buildProviderSettingsFeedback({
            statusMessage,
            mutationErrorSources: [setSpecialistDefaultMutation],
        }),
        groups,
        isSaving: setSpecialistDefaultMutation.isPending,
        saveSpecialistDefault: createFailClosedAsyncAction(saveSpecialistDefaultInternal),
    };
}
