import { buildModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';

interface SidebarInlineThreadDraftProps {
    workspaceLabel: string;
    title: string;
    topLevelTab: TopLevelTab;
    providerId: RuntimeProviderId | undefined;
    modelId: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    busy: boolean;
    onTitleChange: (title: string) => void;
    onTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
    onProviderChange: (providerId: RuntimeProviderId | undefined) => void;
    onModelChange: (modelId: string) => void;
    onCancel: () => void;
    onSubmit: () => void;
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

export function SidebarInlineThreadDraft({
    workspaceLabel,
    title,
    topLevelTab,
    providerId,
    modelId,
    providers,
    providerModels,
    busy,
    onTitleChange,
    onTopLevelTabChange,
    onProviderChange,
    onModelChange,
    onCancel,
    onSubmit,
}: SidebarInlineThreadDraftProps) {
    const selectedProvider = providerId ? providers.find((provider) => provider.id === providerId) : undefined;
    const modelOptions = selectedProvider?.id
        ? providerModels
              .filter((model) => model.providerId === selectedProvider.id)
              .map((model) =>
                  buildModelPickerOption({
                      model,
                      provider: selectedProvider,
                      compatibilityContext: {
                          surface: 'conversation',
                          hasPendingImageAttachments: false,
                          imageAttachmentsAllowed: true,
                      },
                  })
              )
        : [];
    const selectedModelId =
        modelId && modelOptions.some((option) => option.id === modelId) ? modelId : (modelOptions[0]?.id ?? '');

    return (
        <div className='border-border bg-card/65 space-y-3 rounded-3xl border p-3'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>New thread in {workspaceLabel}</p>
                <p className='text-muted-foreground text-xs'>
                    Create a thread in this workspace. The composer owns the run controls after the thread opens.
                </p>
            </div>

            <label className='block space-y-1.5'>
                <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                    Title
                </span>
                <input
                    type='text'
                    value={title}
                    onChange={(event) => {
                        onTitleChange(event.target.value);
                    }}
                    className='border-border bg-background h-9 w-full rounded-2xl border px-3 text-sm'
                    autoComplete='off'
                    placeholder='Optional thread title'
                />
            </label>

            <div className='grid gap-2'>
                <label className='space-y-1.5'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Mode
                    </span>
                    <select
                        className='border-border bg-background h-9 w-full rounded-2xl border px-3 text-sm'
                        value={topLevelTab}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === 'chat' || nextValue === 'agent' || nextValue === 'orchestrator') {
                                onTopLevelTabChange(nextValue);
                            }
                        }}>
                        <option value='chat'>{topLevelTabLabel('chat')}</option>
                        <option value='agent'>{topLevelTabLabel('agent')}</option>
                        <option value='orchestrator'>{topLevelTabLabel('orchestrator')}</option>
                    </select>
                </label>

                <label className='space-y-1.5'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Provider
                    </span>
                    <select
                        className='border-border bg-background h-9 w-full rounded-2xl border px-3 text-sm'
                        value={providerId ?? ''}
                        onChange={(event) => {
                            const nextProviderId = providers.find((provider) => provider.id === event.target.value)?.id;
                            onProviderChange(nextProviderId);
                        }}>
                        {providers.map((provider) => (
                            <option key={provider.id} value={provider.id}>
                                {provider.label}
                            </option>
                        ))}
                    </select>
                </label>

                <label className='space-y-1.5'>
                    <span className='text-muted-foreground text-[11px] font-semibold tracking-[0.12em] uppercase'>
                        Model
                    </span>
                    <ModelPicker
                        providerId={providerId}
                        selectedModelId={selectedModelId}
                        models={modelOptions}
                        ariaLabel='Thread model'
                        placeholder='Select a model'
                        onSelectModel={onModelChange}
                        onSelectOption={(option) => {
                            const nextProviderId = providers.find((provider) => provider.id === option.providerId)?.id;
                            if (nextProviderId) {
                                onProviderChange(nextProviderId);
                            }
                            onModelChange(option.id);
                        }}
                    />
                </label>
            </div>

            <div className='flex items-center justify-end gap-2 pt-1'>
                <button
                    type='button'
                    className='border-border bg-background hover:bg-accent rounded-full border px-3 py-1.5 text-sm font-medium'
                    onClick={onCancel}>
                    Cancel
                </button>
                <button
                    type='button'
                    className='border-primary/40 bg-primary/10 text-primary rounded-full border px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={busy || !providerId || selectedModelId.length === 0}
                    onClick={onSubmit}>
                    {busy ? 'Creating…' : 'Create thread'}
                </button>
            </div>
        </div>
    );
}
