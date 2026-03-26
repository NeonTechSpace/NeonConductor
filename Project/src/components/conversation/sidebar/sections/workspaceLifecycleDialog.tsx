import type { WorkspaceLifecycleDraftState } from '@/web/components/conversation/sidebar/sidebarTypes';
import type { ModelPickerOption } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { WorkspaceEnvironmentPreviewCard } from '@/web/components/workspaces/workspaceEnvironmentSection';

import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { RuntimeProviderId, TopLevelTab } from '@/shared/contracts';
import type { WorkspaceEnvironmentSnapshot } from '@/shared/contracts/types/runtime';


interface WorkspaceLifecycleDialogProps {
    open: boolean;
    draft: WorkspaceLifecycleDraftState;
    providers: ProviderListItem[];
    modelOptions: ModelPickerOption[];
    selectedModelId: string;
    busy: boolean;
    isPickingDirectory: boolean;
    statusMessage?: string;
    environmentPreview: {
        isLoading: boolean;
        errorMessage: string | undefined;
        snapshot: WorkspaceEnvironmentSnapshot | undefined;
    };
    onClose: () => void;
    onBrowseDirectory: () => Promise<void>;
    onLabelChange: (label: string) => void;
    onAbsolutePathChange: (absolutePath: string) => void;
    onDefaultTopLevelTabChange: (topLevelTab: TopLevelTab) => void;
    onDefaultProviderIdChange: (providerId: RuntimeProviderId | undefined) => void;
    onDefaultModelIdChange: (modelId: string) => void;
    onSubmit: () => Promise<void>;
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

export function WorkspaceLifecycleDialog({
    open,
    draft,
    providers,
    modelOptions,
    selectedModelId,
    busy,
    isPickingDirectory,
    statusMessage,
    environmentPreview,
    onClose,
    onBrowseDirectory,
    onLabelChange,
    onAbsolutePathChange,
    onDefaultTopLevelTabChange,
    onDefaultProviderIdChange,
    onDefaultModelIdChange,
    onSubmit,
}: WorkspaceLifecycleDialogProps) {
    return (
        <DialogSurface
            open={open}
            titleId='workspace-lifecycle-title'
            descriptionId='workspace-lifecycle-description'
            onClose={onClose}>
            {open ? (
                <div className='border-border bg-background w-[min(92vw,34rem)] rounded-[28px] border p-5 shadow-xl'>
                    <div className='space-y-1'>
                        <h2 id='workspace-lifecycle-title' className='text-lg font-semibold'>
                            Add workspace
                        </h2>
                        <p id='workspace-lifecycle-description' className='text-muted-foreground text-sm'>
                            Add a folder once. Neon will try to create the starter thread right away.
                        </p>
                    </div>

                    <div className='mt-4 space-y-4'>
                        <label className='block space-y-2'>
                            <span className='text-sm font-medium'>Workspace name</span>
                            <input
                                type='text'
                                value={draft.label}
                                onChange={(event) => {
                                    onLabelChange(event.target.value);
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
                                    value={draft.absolutePath}
                                    onChange={(event) => {
                                        onAbsolutePathChange(event.target.value);
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
                                        void onBrowseDirectory();
                                    }}>
                                    {isPickingDirectory ? 'Opening…' : 'Browse…'}
                                </button>
                            </div>
                            <p className='text-muted-foreground text-xs'>
                                Paste a path directly or choose the folder in your OS file picker.
                            </p>
                        </div>

                        <WorkspaceEnvironmentPreviewCard
                            isLoading={environmentPreview.isLoading}
                            errorMessage={environmentPreview.errorMessage}
                            snapshot={environmentPreview.snapshot}
                            emptyMessage='Neon will use this folder for sessions, commands, rules, and skills tied to the workspace.'
                        />

                        <div className='border-border/70 bg-card/35 space-y-4 rounded-2xl border px-4 py-4'>
                            <div className='space-y-1'>
                                <p className='text-sm font-medium'>Workspace defaults</p>
                                <p className='text-muted-foreground text-xs leading-5'>
                                    These choices become the starting mode, provider, and model for the starter thread
                                    and future threads in this workspace.
                                </p>
                            </div>

                            <div className='grid gap-4 md:grid-cols-[minmax(0,0.26fr)_minmax(0,0.26fr)_minmax(0,0.48fr)]'>
                                <label className='space-y-2'>
                                    <span className='text-sm font-medium'>Mode</span>
                                    <select
                                        className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                        value={draft.defaultTopLevelTab}
                                        onChange={(event) => {
                                            const nextValue = event.target.value;
                                            if (
                                                nextValue === 'chat' ||
                                                nextValue === 'agent' ||
                                                nextValue === 'orchestrator'
                                            ) {
                                                onDefaultTopLevelTabChange(nextValue);
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
                                        value={draft.defaultProviderId ?? ''}
                                        onChange={(event) => {
                                            const nextProviderId = providers.find(
                                                (provider) => provider.id === event.target.value
                                            )?.id;
                                            onDefaultProviderIdChange(nextProviderId);
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
                                        providerId={draft.defaultProviderId}
                                        selectedModelId={selectedModelId}
                                        models={modelOptions}
                                        ariaLabel='Workspace default model'
                                        placeholder='Select a model'
                                        onSelectModel={onDefaultModelIdChange}
                                        onSelectOption={(option) => {
                                            const nextProviderId = providers.find(
                                                (provider) => provider.id === option.providerId
                                            )?.id;
                                            if (nextProviderId) {
                                                onDefaultProviderIdChange(nextProviderId);
                                            }
                                            onDefaultModelIdChange(option.id);
                                        }}
                                    />
                                </label>
                            </div>
                        </div>

                        {statusMessage ? <p className='text-destructive text-sm'>{statusMessage}</p> : null}
                    </div>

                    <div className='border-border/70 mt-5 flex items-center justify-end gap-2 border-t pt-4'>
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-full border px-4 py-2 text-sm font-medium'
                            onClick={onClose}>
                            Cancel
                        </button>
                        <button
                            type='button'
                            className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={
                                busy ||
                                draft.label.trim().length === 0 ||
                                draft.absolutePath.trim().length === 0 ||
                                !draft.defaultProviderId ||
                                selectedModelId.length === 0
                            }
                            onClick={() => {
                                void onSubmit();
                            }}>
                            {busy ? 'Saving…' : 'Save workspace'}
                        </button>
                    </div>
                </div>
            ) : null}
        </DialogSurface>
    );
}
