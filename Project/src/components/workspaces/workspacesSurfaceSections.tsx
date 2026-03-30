import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import { useWorkspaceDefaultsController } from '@/web/components/workspaces/useWorkspaceDefaultsController';
import {
    isWorkspaceRuntimeProviderId,
    topLevelTabLabel,
} from '@/web/components/workspaces/workspacesSurfaceSectionHelpers';

import type { ProviderModelRecord } from '@/app/backend/persistence/types';
import type { ProviderListItem } from '@/app/backend/providers/service/types';

import type { WorkspacePreferenceRecord } from '@/shared/contracts/types/runtime';

export function WorkspaceDefaultsSection(input: {
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
    const controller = useWorkspaceDefaultsController(input);

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
                        value={controller.topLevelTab}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            if (nextValue === 'chat' || nextValue === 'agent' || nextValue === 'orchestrator') {
                                controller.selectTopLevelTab(nextValue);
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
                        value={controller.providerId ?? ''}
                        onChange={(event) => {
                            const nextProviderId =
                                input.providers.find((provider) => provider.id === event.target.value)?.id;
                            controller.selectProvider(
                                isWorkspaceRuntimeProviderId(nextProviderId) ? nextProviderId : undefined
                            );
                        }}>
                        {input.providers.map((provider) => (
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
                        providerId={controller.providerId}
                        selectedModelId={controller.selectedModelId}
                        models={controller.modelOptions}
                        ariaLabel='Workspace default model'
                        placeholder='Select a model'
                        onSelectModel={controller.selectModel}
                        onSelectOption={controller.selectModelOption}
                    />
                    {controller.selectedModelOption?.compatibilityReason &&
                    controller.selectedModelOption.compatibilityScope !== 'provider' ? (
                        <p className='text-muted-foreground text-xs'>
                            {controller.selectedModelOption.compatibilityReason}
                        </p>
                    ) : null}
                </label>
            </div>

            <div className='border-border/70 mt-4 flex items-center justify-end gap-2 border-t pt-4'>
                {controller.feedbackMessage ? (
                    <p className='text-muted-foreground mr-auto text-xs'>{controller.feedbackMessage}</p>
                ) : null}
                <button
                    type='button'
                    className='border-primary/40 bg-primary/10 text-primary rounded-full border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-60'
                    disabled={!controller.providerId || controller.selectedModelId.length === 0 || controller.isSaving}
                    onClick={() => {
                        void controller.saveDefaults();
                    }}>
                    {controller.isSaving ? 'Saving…' : 'Save thread defaults'}
                </button>
            </div>
        </article>
    );
}
