import { useState } from 'react';

import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { resolveSelectedModelId, resolveSelectedProviderId } from '@/web/components/settings/providerSettings/selection';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';
import type { WorkspacePreferenceRecord } from '@/app/backend/runtime/contracts/types/runtime';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

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

export function buildWorkspaceModelOptions(
    provider: ProviderListItem | undefined,
    models: ProviderModelRecord[]
) {
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
    const nextProviderId = resolveSelectedProviderId(
        input.providers,
        input.workspacePreference?.defaultProviderId
    );
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
        },
    });
    const selectedProvider = providerId ? providers.find((provider) => provider.id === providerId) : undefined;
    const modelOptions = buildWorkspaceModelOptions(selectedProvider, providerModels);
    const selectedModelId =
        modelId && modelOptions.some((option) => option.id === modelId) ? modelId : modelOptions[0]?.id ?? '';
    const selectedModelOption = modelOptions.find((option) => option.id === selectedModelId);

    return (
        <article className='border-border/70 bg-card/55 rounded-[24px] border p-5'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Workspace defaults</p>
                <p className='text-muted-foreground text-xs leading-5'>
                    New threads in this workspace start from these defaults before the active header can override them.
                </p>
            </div>

            <div className='mt-4 grid gap-4 md:grid-cols-[minmax(0,0.26fr)_minmax(0,0.26fr)_minmax(0,0.48fr)]'>
                <label className='space-y-2'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Mode
                    </span>
                    <select
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        value={topLevelTab}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === 'chat' || nextValue === 'agent' || nextValue === 'orchestrator') {
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
                        Provider
                    </span>
                    <select
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        value={providerId ?? ''}
                        onChange={(event) => {
                            const nextProviderId = providers.find((provider) => provider.id === event.target.value)?.id;
                            setProviderId(nextProviderId);
                            const nextProvider = nextProviderId
                                ? providers.find((provider) => provider.id === nextProviderId)
                                : undefined;
                            const nextModelId =
                                buildWorkspaceModelOptions(nextProvider, providerModels)[0]?.id ?? '';
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
                        Model
                    </span>
                    <ModelPicker
                        providerId={providerId}
                        selectedModelId={selectedModelId}
                        models={modelOptions}
                        ariaLabel='Workspace default model'
                        placeholder='Select a model'
                        onSelectModel={setModelId}
                        onSelectOption={(option) => {
                            if (option.providerId && option.providerId !== providerId) {
                                setProviderId(option.providerId as RuntimeProviderId);
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

            <div className='mt-4 flex items-center justify-end gap-2 border-t border-border/70 pt-4'>
                <button
                    type='button'
                    className='rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={!providerId || selectedModelId.length === 0 || setWorkspacePreferenceMutation.isPending}
                    onClick={() => {
                        void setWorkspacePreferenceMutation.mutateAsync({
                            profileId,
                            workspaceFingerprint,
                            defaultTopLevelTab: topLevelTab,
                            ...(providerId
                                ? {
                                      defaultProviderId: providerId,
                                      defaultModelId: selectedModelId,
                                  }
                                : {}),
                        });
                    }}>
                    {setWorkspacePreferenceMutation.isPending ? 'Saving…' : 'Save defaults'}
                </button>
            </div>
        </article>
    );
}
