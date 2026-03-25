import { useDeferredValue, useState } from 'react';

import { resolveThreadDraftDefaults } from '@/web/components/conversation/sidebar/threadDraftDefaults';
import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { WorkspaceEnvironmentPreviewCard } from '@/web/components/workspaces/workspaceEnvironmentSection';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';
import type { WorkspacePreferenceRecord } from '@/app/backend/runtime/contracts/types/runtime';
import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface WorkspaceLifecycleDialogProps {
    open: boolean;
    profileId: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    workspacePreferences: WorkspacePreferenceRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    busy: boolean;
    isPickingDirectory: boolean;
    statusMessage?: string;
    onClose: () => void;
    onBrowseDirectory: () => Promise<string | undefined>;
    onSubmit: (input: {
        label: string;
        absolutePath: string;
        defaultTopLevelTab: TopLevelTab;
        defaultProviderId: RuntimeProviderId | undefined;
        defaultModelId: string;
    }) => Promise<void>;
}

interface WorkspaceLifecycleDraft {
    label: string;
    absolutePath: string;
    defaultTopLevelTab: TopLevelTab;
    defaultProviderId: RuntimeProviderId | undefined;
    defaultModelId: string;
}

function topLevelTabLabel(topLevelTab: TopLevelTab): string {
    if (topLevelTab === 'chat') {
        return 'Chat';
    }
    if (topLevelTab === 'agent') {
        return 'Agent';
    }
    return 'Orchestrator';
}

export function resolveWorkspaceLifecycleDraft(input: {
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    workspacePreferences: WorkspacePreferenceRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
}): WorkspaceLifecycleDraft {
    const nextDefaults = resolveThreadDraftDefaults({
        workspacePreferences: input.workspacePreferences,
        providers: input.providers,
        providerModels: input.providerModels,
        defaults: input.defaults,
        fallbackTopLevelTab: 'agent',
    });

    return {
        label: '',
        absolutePath: '',
        defaultTopLevelTab: nextDefaults.topLevelTab,
        defaultProviderId: nextDefaults.providerId,
        defaultModelId: nextDefaults.modelId,
    };
}

function WorkspaceLifecycleDialogBody({
    profileId,
    providers,
    providerModels,
    busy,
    isPickingDirectory,
    statusMessage,
    onClose,
    onBrowseDirectory,
    onSubmit,
    initialDraft,
}: {
    profileId: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    busy: boolean;
    isPickingDirectory: boolean;
    statusMessage?: string;
    onClose: () => void;
    onBrowseDirectory: () => Promise<string | undefined>;
    onSubmit: (input: {
        label: string;
        absolutePath: string;
        defaultTopLevelTab: TopLevelTab;
        defaultProviderId: RuntimeProviderId | undefined;
        defaultModelId: string;
    }) => Promise<void>;
    initialDraft: WorkspaceLifecycleDraft;
}) {
    const [label, setLabel] = useState(() => initialDraft.label);
    const [absolutePath, setAbsolutePath] = useState(() => initialDraft.absolutePath);
    const [defaultTopLevelTab, setDefaultTopLevelTab] = useState<TopLevelTab>(() => initialDraft.defaultTopLevelTab);
    const [defaultProviderId, setDefaultProviderId] = useState<RuntimeProviderId | undefined>(
        () => initialDraft.defaultProviderId
    );
    const [defaultModelId, setDefaultModelId] = useState(() => initialDraft.defaultModelId);
    const deferredAbsolutePath = useDeferredValue(absolutePath.trim());
    const environmentQuery = trpc.runtime.inspectWorkspaceEnvironment.useQuery(
        {
            profileId,
            absolutePath: deferredAbsolutePath.length > 0 ? deferredAbsolutePath : '.',
        },
        {
            enabled: deferredAbsolutePath.length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );

    const selectedProvider = defaultProviderId
        ? providers.find((provider) => provider.id === defaultProviderId)
        : undefined;
    const modelOptions =
        selectedProvider?.id
            ? providerModels
                  .filter((model) => model.providerId === selectedProvider.id)
                  .map((model) =>
                      buildModelPickerOption({
                          model,
                          provider: selectedProvider,
                          compatibilityContext: {
                              surface: 'settings',
                          },
                      })
                  )
            : [];
    const selectedModelId =
        defaultModelId && modelOptions.some((option) => option.id === defaultModelId)
            ? defaultModelId
            : modelOptions[0]?.id ?? '';

    async function handleBrowseDirectory() {
        const nextPath = await onBrowseDirectory();
        if (!nextPath) {
            return;
        }

        setAbsolutePath(nextPath);
        if (label.trim().length === 0) {
            const nextLabel = nextPath.split(/[\\/]/).filter(Boolean).at(-1);
            if (nextLabel) {
                setLabel(nextLabel);
            }
        }
    }

    return (
        <div className='border-border bg-background w-[min(92vw,34rem)] rounded-[28px] border p-5 shadow-xl'>
            <div className='space-y-1'>
                <h2 id='workspace-lifecycle-title' className='text-lg font-semibold'>
                    Add workspace
                </h2>
                <p id='workspace-lifecycle-description' className='text-muted-foreground text-sm'>
                    Register the root once. NeonConductor will create the starter thread right away.
                </p>
            </div>

            <div className='mt-4 space-y-4'>
                <label className='block space-y-2'>
                    <span className='text-sm font-medium'>Workspace name</span>
                    <input
                        type='text'
                        value={label}
                        onChange={(event) => {
                            setLabel(event.target.value);
                        }}
                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                        autoComplete='off'
                        placeholder='My workspace'
                    />
                </label>

                <div className='space-y-2'>
                    <span className='text-sm font-medium'>Folder path</span>
                    <div className='grid grid-cols-[minmax(0,1fr)_auto] gap-2'>
                        <input
                            type='text'
                            value={absolutePath}
                            onChange={(event) => {
                                setAbsolutePath(event.target.value);
                            }}
                            className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                            autoComplete='off'
                            placeholder=''
                        />
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-2xl border px-4 py-2 text-sm font-medium'
                            disabled={isPickingDirectory}
                            onClick={() => {
                                handleBrowseDirectory();
                            }}>
                            {isPickingDirectory ? 'Opening…' : 'Browse…'}
                        </button>
                    </div>
                    <p className='text-muted-foreground text-xs'>
                        Paste a path directly or choose the folder in your OS file picker.
                    </p>
                </div>

                <WorkspaceEnvironmentPreviewCard
                    isLoading={environmentQuery.isLoading}
                    errorMessage={environmentQuery.error?.message}
                    snapshot={environmentQuery.data?.snapshot}
                    emptyMessage='The selected folder becomes the workspace root for sessions, execution, and registry discovery.'
                />

                <div className='space-y-4 rounded-2xl border border-border/70 bg-card/35 px-4 py-4'>
                    <div className='space-y-1'>
                        <p className='text-sm font-medium'>Workspace defaults</p>
                        <p className='text-muted-foreground text-xs leading-5'>
                            These defaults seed the starter thread and future threads in this workspace.
                        </p>
                    </div>

                    <div className='grid gap-4 md:grid-cols-[minmax(0,0.26fr)_minmax(0,0.26fr)_minmax(0,0.48fr)]'>
                        <label className='space-y-2'>
                            <span className='text-sm font-medium'>Mode</span>
                            <select
                                className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                value={defaultTopLevelTab}
                                onChange={(event) => {
                                    const nextValue = event.target.value;
                                    if (nextValue === 'chat' || nextValue === 'agent' || nextValue === 'orchestrator') {
                                        setDefaultTopLevelTab(nextValue);
                                    }
                                }}>
                                <option value='chat'>{topLevelTabLabel('chat')}</option>
                                <option value='agent'>{topLevelTabLabel('agent')}</option>
                                <option value='orchestrator'>{topLevelTabLabel('orchestrator')}</option>
                            </select>
                        </label>

                        <label className='space-y-2'>
                            <span className='text-sm font-medium'>Provider</span>
                            <select
                                className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                value={defaultProviderId ?? ''}
                                onChange={(event) => {
                                    const nextProviderId = providers.find(
                                        (provider) => provider.id === event.target.value
                                    )?.id;
                                    setDefaultProviderId(nextProviderId);
                                    const nextModelId =
                                        providerModels.find((model) => model.providerId === nextProviderId)?.id ?? '';
                                    setDefaultModelId(nextModelId);
                                }}>
                                {providers.map((provider) => (
                                    <option key={provider.id} value={provider.id}>
                                        {provider.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className='space-y-2'>
                            <span className='text-sm font-medium'>Model</span>
                            <ModelPicker
                                providerId={defaultProviderId}
                                selectedModelId={selectedModelId}
                                models={modelOptions}
                                ariaLabel='Workspace default model'
                                placeholder='Select a model'
                                onSelectModel={setDefaultModelId}
                                onSelectOption={(option) => {
                                    const nextProviderId = providers.find(
                                        (provider) => provider.id === option.providerId
                                    )?.id;
                                    if (nextProviderId) {
                                        setDefaultProviderId(nextProviderId);
                                    }
                                    setDefaultModelId(option.id);
                                }}
                            />
                        </label>
                    </div>
                </div>

                {statusMessage ? <p className='text-destructive text-sm'>{statusMessage}</p> : null}
            </div>

            <div className='mt-5 flex items-center justify-end gap-2 border-t border-border/70 pt-4'>
                <button
                    type='button'
                    className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                    onClick={onClose}>
                    Cancel
                </button>
                <button
                    type='button'
                    className='rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={
                        busy ||
                        label.trim().length === 0 ||
                        absolutePath.trim().length === 0 ||
                        !defaultProviderId ||
                        selectedModelId.length === 0
                    }
                    onClick={() => {
                        void onSubmit({
                            label,
                            absolutePath,
                            defaultTopLevelTab,
                            defaultProviderId,
                            defaultModelId: selectedModelId,
                        });
                    }}>
                    {busy ? 'Saving…' : 'Save workspace'}
                </button>
            </div>
        </div>
    );
}

export function WorkspaceLifecycleDialog({
    open,
    profileId,
    providers,
    providerModels,
    workspacePreferences,
    defaults,
    busy,
    isPickingDirectory,
    statusMessage,
    onClose,
    onBrowseDirectory,
    onSubmit,
}: WorkspaceLifecycleDialogProps) {
    const initialDraft = resolveWorkspaceLifecycleDraft({
        providers,
        providerModels,
        workspacePreferences,
        defaults,
    });

    return (
        <DialogSurface
            open={open}
            titleId='workspace-lifecycle-title'
            descriptionId='workspace-lifecycle-description'
            onClose={onClose}>
            {open ? (
                <WorkspaceLifecycleDialogBody
                    profileId={profileId}
                    providers={providers}
                    providerModels={providerModels}
                    busy={busy}
                    isPickingDirectory={isPickingDirectory}
                    onClose={onClose}
                    onBrowseDirectory={onBrowseDirectory}
                    onSubmit={onSubmit}
                    initialDraft={initialDraft}
                    {...(statusMessage ? { statusMessage } : {})}
                />
            ) : null}
        </DialogSurface>
    );
}
