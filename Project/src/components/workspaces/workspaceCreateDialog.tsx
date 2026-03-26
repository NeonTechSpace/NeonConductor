import { useDeferredValue, useState } from 'react';

import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { DialogSurface } from '@/web/components/ui/dialogSurface';
import { submitWorkspaceCreateRequest } from '@/web/components/workspaces/workspaceCreateDialogSubmit';
import { WorkspaceEnvironmentPreviewCard } from '@/web/components/workspaces/workspaceEnvironmentSection';
import {
    buildWorkspaceModelOptions,
    resolveWorkspaceDefaultDraft,
    topLevelTabLabel,
} from '@/web/components/workspaces/workspacesSurfaceSections';
import { PROGRESSIVE_QUERY_OPTIONS } from '@/web/lib/query/progressiveQueryOptions';
import { isOneOf } from '@/web/lib/typeGuards/isOneOf';
import { trpc } from '@/web/trpc/client';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import { providerIds, type RuntimeProviderId, type TopLevelTab } from '@/shared/contracts';

interface WorkspaceCreateDialogProps {
    open: boolean;
    profileId: string;
    providers: ProviderListItem[];
    providerModels: ProviderModelRecord[];
    defaults:
        | {
              providerId: string;
              modelId: string;
          }
        | undefined;
    isSaving: boolean;
    onClose: () => void;
    onCreateWorkspace: (input: {
        absolutePath: string;
        label: string;
        defaultTopLevelTab: TopLevelTab;
        defaultProviderId: RuntimeProviderId;
        defaultModelId: string;
    }) => Promise<void>;
}

function isRuntimeProviderId(value: string | undefined): value is RuntimeProviderId {
    return isOneOf(value, providerIds);
}

function WorkspaceCreateDialogBody({
    profileId,
    providers,
    providerModels,
    defaults,
    isSaving,
    onClose,
    onCreateWorkspace,
}: Omit<WorkspaceCreateDialogProps, 'open'>) {
    const initialDraft = resolveWorkspaceDefaultDraft({
        providers,
        providerModels,
        defaults,
    });
    const [workspaceLabelDraft, setWorkspaceLabelDraft] = useState('');
    const [workspacePathDraft, setWorkspacePathDraft] = useState('');
    const [isPickingWorkspaceDirectory, setIsPickingWorkspaceDirectory] = useState(false);
    const [workspaceDefaultTopLevelTabDraft, setWorkspaceDefaultTopLevelTabDraft] = useState<TopLevelTab>(
        initialDraft.topLevelTab
    );
    const [workspaceDefaultProviderIdDraft, setWorkspaceDefaultProviderIdDraft] = useState<
        RuntimeProviderId | undefined
    >(initialDraft.providerId);
    const [workspaceDefaultModelIdDraft, setWorkspaceDefaultModelIdDraft] = useState(initialDraft.modelId);
    const [submitError, setSubmitError] = useState<string | undefined>(undefined);
    const deferredWorkspacePathDraft = useDeferredValue(workspacePathDraft.trim());
    const desktopBridge = typeof window !== 'undefined' ? window.neonDesktop : undefined;
    const hasDesktopDirectoryPicker = Boolean(desktopBridge);
    const environmentQuery = trpc.runtime.inspectWorkspaceEnvironment.useQuery(
        {
            profileId,
            absolutePath: deferredWorkspacePathDraft.length > 0 ? deferredWorkspacePathDraft : '.',
        },
        {
            enabled: deferredWorkspacePathDraft.length > 0,
            ...PROGRESSIVE_QUERY_OPTIONS,
        }
    );
    const createDefaultProvider = workspaceDefaultProviderIdDraft
        ? providers.find((provider) => provider.id === workspaceDefaultProviderIdDraft)
        : undefined;
    const createModelOptions = buildWorkspaceModelOptions(createDefaultProvider, providerModels);
    const createSelectedModelId =
        workspaceDefaultModelIdDraft && createModelOptions.some((option) => option.id === workspaceDefaultModelIdDraft)
            ? workspaceDefaultModelIdDraft
            : (createModelOptions[0]?.id ?? '');
    const createSelectedModelOption = createModelOptions.find((option) => option.id === createSelectedModelId);

    async function browseForWorkspaceDirectory() {
        if (!desktopBridge || isPickingWorkspaceDirectory) {
            return;
        }

        setSubmitError(undefined);
        setIsPickingWorkspaceDirectory(true);
        try {
            const result = await desktopBridge.pickDirectory();
            if (result.canceled) {
                return;
            }

            setWorkspacePathDraft(result.absolutePath);
            if (workspaceLabelDraft.trim().length === 0) {
                const nextLabel = result.absolutePath.split(/[\\/]/).filter(Boolean).at(-1);
                if (nextLabel) {
                    setWorkspaceLabelDraft(nextLabel);
                }
            }
        } catch (error) {
            setSubmitError(error instanceof Error ? error.message : 'Workspace directory could not be selected.');
        } finally {
            setIsPickingWorkspaceDirectory(false);
        }
    }

    async function handleCreateWorkspace() {
        if (!workspaceDefaultProviderIdDraft) {
            return;
        }

        setSubmitError(undefined);
        const nextError = await submitWorkspaceCreateRequest({
            onCreateWorkspace,
            onClose,
            createWorkspaceInput: {
                absolutePath: workspacePathDraft,
                label: workspaceLabelDraft,
                defaultTopLevelTab: workspaceDefaultTopLevelTabDraft,
                defaultProviderId: workspaceDefaultProviderIdDraft,
                defaultModelId: createSelectedModelId,
            },
        });
        setSubmitError(nextError);
    }

    return (
        <div className='border-border bg-background w-[min(92vw,34rem)] rounded-[28px] border p-5 shadow-xl'>
            <div className='space-y-1'>
                <h2 id='workspace-create-title' className='text-lg font-semibold'>
                    New workspace
                </h2>
                <p id='workspace-create-description' className='text-muted-foreground text-sm'>
                    Add this folder once, then reuse it for sessions, isolated runs, and workspace files.
                </p>
            </div>

            <div className='mt-4 space-y-4'>
                <label className='block space-y-2'>
                    <span className='text-sm font-medium'>Workspace name</span>
                    <input
                        type='text'
                        value={workspaceLabelDraft}
                        onChange={(event) => {
                            setSubmitError(undefined);
                            setWorkspaceLabelDraft(event.target.value);
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
                            value={workspacePathDraft}
                            onChange={(event) => {
                                setSubmitError(undefined);
                                setWorkspacePathDraft(event.target.value);
                            }}
                            className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                            autoComplete='off'
                            placeholder=''
                        />
                        <button
                            type='button'
                            className='border-border bg-card hover:bg-accent rounded-2xl border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                            disabled={isPickingWorkspaceDirectory || !hasDesktopDirectoryPicker}
                            onClick={() => {
                                void browseForWorkspaceDirectory();
                            }}>
                            {isPickingWorkspaceDirectory ? 'Opening…' : 'Browse…'}
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
                    emptyMessage='Neon will use this folder for sessions, commands, rules, and skills tied to the workspace.'
                />

                <div className='border-border/70 bg-card/35 space-y-4 rounded-2xl border px-4 py-4'>
                    <div className='space-y-1'>
                        <p className='text-sm font-medium'>Workspace defaults</p>
                        <p className='text-muted-foreground text-xs leading-5'>
                            These choices become the starting mode, provider, and model for new threads in this
                            workspace.
                        </p>
                    </div>

                    <div className='grid gap-4 md:grid-cols-[minmax(0,0.26fr)_minmax(0,0.26fr)_minmax(0,0.48fr)]'>
                        <label className='space-y-2'>
                            <span className='text-sm font-medium'>Mode</span>
                            <select
                                className='border-border bg-card h-10 w-full rounded-2xl border px-3 text-sm'
                                value={workspaceDefaultTopLevelTabDraft}
                                onChange={(event) => {
                                    const nextValue = event.target.value;
                                    if (nextValue === 'chat' || nextValue === 'agent' || nextValue === 'orchestrator') {
                                        setSubmitError(undefined);
                                        setWorkspaceDefaultTopLevelTabDraft(nextValue);
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
                                value={workspaceDefaultProviderIdDraft ?? ''}
                                onChange={(event) => {
                                    setSubmitError(undefined);
                                    const nextProviderId = providers.find(
                                        (provider) => provider.id === event.target.value
                                    )?.id;
                                    setWorkspaceDefaultProviderIdDraft(nextProviderId);
                                    const nextProvider = nextProviderId
                                        ? providers.find((provider) => provider.id === nextProviderId)
                                        : undefined;
                                    const nextModelId =
                                        buildWorkspaceModelOptions(nextProvider, providerModels)[0]?.id ?? '';
                                    setWorkspaceDefaultModelIdDraft(nextModelId);
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
                                providerId={workspaceDefaultProviderIdDraft}
                                selectedModelId={createSelectedModelId}
                                models={createModelOptions}
                                ariaLabel='Workspace default model'
                                placeholder='Select a model'
                                onSelectModel={setWorkspaceDefaultModelIdDraft}
                                onSelectOption={(option: { providerId?: string; id: string }) => {
                                    setSubmitError(undefined);
                                    if (
                                        option.providerId &&
                                        option.providerId !== workspaceDefaultProviderIdDraft &&
                                        isRuntimeProviderId(option.providerId)
                                    ) {
                                        setWorkspaceDefaultProviderIdDraft(option.providerId);
                                    }
                                    setWorkspaceDefaultModelIdDraft(option.id);
                                }}
                            />
                            {createSelectedModelOption?.compatibilityReason &&
                            createSelectedModelOption.compatibilityScope !== 'provider' ? (
                                <p className='text-muted-foreground text-xs'>
                                    {createSelectedModelOption.compatibilityReason}
                                </p>
                            ) : null}
                        </label>
                    </div>
                </div>
                {submitError ? <p className='text-destructive text-sm'>{submitError}</p> : null}
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
                        isSaving ||
                        workspacePathDraft.trim().length === 0 ||
                        workspaceLabelDraft.trim().length === 0 ||
                        !workspaceDefaultProviderIdDraft ||
                        createSelectedModelId.length === 0
                    }
                    onClick={() => {
                        void handleCreateWorkspace();
                    }}>
                    {isSaving ? 'Saving…' : 'Add workspace'}
                </button>
            </div>
        </div>
    );
}

export function WorkspaceCreateDialog(props: WorkspaceCreateDialogProps) {
    return (
        <DialogSurface
            open={props.open}
            titleId='workspace-create-title'
            descriptionId='workspace-create-description'
            onClose={props.onClose}>
            {props.open ? <WorkspaceCreateDialogBody {...props} /> : null}
        </DialogSurface>
    );
}
