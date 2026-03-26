import { useState } from 'react';

import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import {
    resolveSelectedModelId,
    resolveSelectedProviderId,
} from '@/web/components/settings/providerSettings/selection';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import { providerIds, type RuntimeProviderId, type TopLevelTab } from '@/shared/contracts';
import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';


export function formatTimestamp(value: string | undefined): string {
    if (!value) {
        return 'Unknown';
    }

    return new Date(value).toLocaleString();
}

export function topLevelTabLabel(value: TopLevelTab): string {
    if (value === 'chat') {
        return 'Chat';
    }

    if (value === 'agent') {
        return 'Agent';
    }

    return 'Orchestrator';
}

export function buildWorkspaceModelOptions(provider: ProviderListItem | undefined, models: ProviderModelRecord[]) {
    if (!provider) {
        return [];
    }

    return models
        .filter((model) => model.providerId === provider.id)
        .map((model) =>
            buildModelPickerOption({
                model,
                provider,
                compatibilityContext: {
                    surface: 'settings',
                },
            })
        );
}

function isRuntimeProviderId(value: string | undefined): value is RuntimeProviderId {
    return isOneOf(value, providerIds);
}

export function resolveWorkspaceDefaultDraft(input: {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    workspacePreference?: WorkspacePreferenceRecord;
}): {
    topLevelTab: TopLevelTab;
    providerId: RuntimeProviderId | undefined;
    modelId: string;
} {
    const nextProviderId = resolveSelectedProviderId(input.providers, input.workspacePreference?.defaultProviderId);
    const nextModelId = resolveSelectedModelId({
        selectedProviderId: nextProviderId,
        selectedModelId: input.workspacePreference?.defaultModelId ?? '',
        models: input.providerModels.filter((model) => model.providerId === nextProviderId),
        defaults: input.defaults,
    });

    return {
        topLevelTab: input.workspacePreference?.defaultTopLevelTab ?? 'agent',
        providerId: nextProviderId,
        modelId: nextModelId,
    };
}

export function WorkspaceDefaultsSection({
    profileId,
    workspaceFingerprint,
    providers,
    providerModels,
    defaults,
    workspacePreference,
}: {
    profileId: string;
    workspaceFingerprint: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    workspacePreference?: WorkspacePreferenceRecord;
}) {
    const utils = trpc.useUtils();
    const initialDraft = resolveWorkspaceDefaultDraft({
        providers,
        providerModels,
        defaults,
        ...(workspacePreference ? { workspacePreference } : {}),
    });
    const [topLevelTab, setTopLevelTab] = useState<TopLevelTab>(initialDraft.topLevelTab);
    const [providerId, setProviderId] = useState<RuntimeProviderId | undefined>(initialDraft.providerId);
    const [modelId, setModelId] = useState(initialDraft.modelId);
    const [feedbackMessage, setFeedbackMessage] = useState<string | undefined>(undefined);
    const setWorkspacePreferenceMutation = trpc.runtime.setWorkspacePreference.useMutation({
        onSuccess: ({ workspacePreference }) => {
            utils.runtime.getShellBootstrap.setData({ profileId }, (current) =>
                current
                    ? {
                          ...current,
                          workspacePreferences: [
                              workspacePreference,
                              ...current.workspacePreferences.filter(
                                  (record) => record.workspaceFingerprint !== workspacePreference.workspaceFingerprint
                              ),
                          ],
                      }
                    : current
            );
            setFeedbackMessage('Saved the defaults Neon will use for new threads in this workspace.');
        },
        onError: () => {
            setFeedbackMessage('Could not save workspace defaults.');
        },
    });
    const selectedProvider = providerId ? providers.find((provider) => provider.id === providerId) : undefined;
    const modelOptions = buildWorkspaceModelOptions(selectedProvider, providerModels);
    const selectedModelId =
        modelId && modelOptions.some((option) => option.id === modelId) ? modelId : (modelOptions[0]?.id ?? '');
    const selectedModelOption = modelOptions.find((option) => option.id === selectedModelId);

    async function handleSaveDefaults() {
        if (!providerId || selectedModelId.length === 0) {
            return;
        }

        await setWorkspacePreferenceMutation
            .mutateAsync({
                profileId,
                workspaceFingerprint,
                defaultTopLevelTab: topLevelTab,
                defaultProviderId: providerId,
                defaultModelId: selectedModelId,
            })
            .catch(() => undefined);
    }

    return (
        <article className='border-border/70 bg-card/55 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Defaults for new threads</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    These choices set the starting mode, provider, and model for new threads in this workspace. You can
                    still change them later per thread.
                </p>
            </div>

            <div className='mt-4 grid gap-4 md:grid-cols-[minmax(0,0.26fr)_minmax(0,0.26fr)_minmax(0,0.48fr)]'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Starting mode
                    </span>
                    <select
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        value={topLevelTab}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === 'chat' || nextValue === 'agent' || nextValue === 'orchestrator') {
                                setFeedbackMessage(undefined);
                                setTopLevelTab(nextValue);
                            }
                        }}>
                        <option value='chat'>{topLevelTabLabel('chat')}</option>
                        <option value='agent'>{topLevelTabLabel('agent')}</option>
                        <option value='orchestrator'>{topLevelTabLabel('orchestrator')}</option>
                    </select>
                </label>

                <label className='space-y-2'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Starting provider
                    </span>
                    <select
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        value={providerId ?? ''}
                        onChange={(event) => {
                            setFeedbackMessage(undefined);
                            const nextProviderId = providers.find((provider) => provider.id === event.target.value)?.id;
                            setProviderId(nextProviderId);
                            const nextProvider = nextProviderId
                                ? providers.find((provider) => provider.id === nextProviderId)
                                : undefined;
                            const nextModelId = buildWorkspaceModelOptions(nextProvider, providerModels)[0]?.id ?? '';
                            setModelId(nextModelId);
                        }}>
                        {providers.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className='space-y-2'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Starting model
                    </span>
                    <ModelPicker
                        providerId={providerId}
                        selectedModelId={selectedModelId}
                        models={modelOptions}
                        ariaLabel='Workspace default model'
                        placeholder='Select a model'
                        onSelectModel={(nextModelId) => {
                            setFeedbackMessage(undefined);
                            setModelId(nextModelId);
                        }}
                        onSelectOption={(option) => {
                            setFeedbackMessage(undefined);
                            if (
                                option.providerId &&
                                option.providerId !== providerId &&
                                isRuntimeProviderId(option.providerId)
                            ) {
                                setProviderId(option.providerId);
                            }
                            setModelId(option.id);
                        }}
                    />
                    {selectedModelOption?.compatibilityReason &&
                    selectedModelOption.compatibilityScope !== 'provider' ? (
                        <p className='text-muted-foreground text-xs'>{selectedModelOption.compatibilityReason}</p>
                    ) : null}
                </label>
            </div>

            <div className='border-border/70 mt-4 flex items-center justify-end gap-2 border-t pt-4'>
                {feedbackMessage ? <p className='text-muted-foreground mr-auto text-xs'>{feedbackMessage}</p> : null}
                <button
                    type='button'
                    className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={!providerId || selectedModelId.length === 0 || setWorkspacePreferenceMutation.isPending}
                    onClick={() => {
                        void handleSaveDefaults();
                    }}>
                    {setWorkspacePreferenceMutation.isPending ? 'Saving…' : 'Save thread defaults'}
                </button>
            </div>
        </article>
    );
}
