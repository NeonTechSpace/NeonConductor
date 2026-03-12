import { RefreshCw } from 'lucide-react';

import { getModelRuntimeNotes } from '@/web/components/modelSelection/modelCapabilities';
import { ModelPicker } from '@/web/components/modelSelection/modelPicker';
import type { ProviderModelOption } from '@/web/components/settings/providerSettings/types';
import { Button } from '@/web/components/ui/button';

import type { RuntimeProviderId } from '@/shared/contracts';

interface ProviderDefaultModelSectionProps {
    selectedProviderId: RuntimeProviderId | undefined;
    selectedModelId: string;
    models: ProviderModelOption[];
    isDefaultModel: boolean;
    isSavingDefault: boolean;
    isSyncingCatalog: boolean;
    onSelectModel: (modelId: string) => void;
    onSyncCatalog: () => void;
}

export function ProviderDefaultModelSection({
    selectedProviderId,
    selectedModelId,
    models,
    isDefaultModel,
    isSavingDefault,
    isSyncingCatalog,
    onSelectModel,
    onSyncCatalog,
}: ProviderDefaultModelSectionProps) {
    const isKilo = selectedProviderId === 'kilo';
    const selectedModel = models.find((model) => model.id === selectedModelId);
    const selectedModelNotes = selectedModel ? getModelRuntimeNotes(selectedModel).slice(0, 2) : [];

    return (
        <section className='border-border/70 bg-card/40 space-y-3 rounded-2xl border p-4'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Default Model</p>
                <p className='text-muted-foreground text-xs'>
                    {isKilo
                        ? 'Choose the Kilo model profile that should be preselected in settings and the composer. Changes save immediately.'
                        : 'Choose the model that should be preselected for this provider in settings and the composer. Changes save immediately.'}
                </p>
            </div>
            <div className='space-y-2'>
                <label className='sr-only' htmlFor='provider-default-model'>
                    Default model
                </label>
                <ModelPicker
                    id='provider-default-model'
                    name='providerDefaultModel'
                    providerId={selectedProviderId}
                    selectedModelId={selectedModelId}
                    models={models}
                    disabled={models.length === 0}
                    ariaLabel='Default model'
                    placeholder='Select model'
                    onSelectModel={onSelectModel}
                />
                <p className='text-muted-foreground text-[11px] leading-5'>
                    {isSavingDefault
                        ? 'Saving default model...'
                        : isDefaultModel
                          ? 'Selected model is already the saved default.'
                          : selectedModelId
                            ? 'Selecting a different model updates the saved default immediately.'
                            : 'Select a model to save it as the default.'}
                </p>
                {selectedModel?.compatibilityReason ? (
                    <p
                        className={`text-[11px] leading-5 ${
                            selectedModel.compatibilityState === 'warning'
                                ? 'text-amber-700 dark:text-amber-300'
                                : selectedModel.compatibilityState === 'incompatible'
                                  ? 'text-destructive'
                                  : 'text-muted-foreground'
                        }`}>
                        {selectedModel.compatibilityReason}
                    </p>
                ) : null}
                {selectedModelNotes.length > 0 ? (
                    <p className='text-muted-foreground text-[11px] leading-5'>
                        Runtime notes: {selectedModelNotes.join(' ')}
                    </p>
                ) : null}
            </div>
            {isKilo ? (
                <details className='border-border/70 bg-background/70 rounded-2xl border p-4'>
                    <summary className='cursor-pointer list-none text-sm font-medium'>Advanced catalog tools</summary>
                    <div className='mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <p className='text-muted-foreground text-xs leading-5'>
                            Kilo metadata refreshes automatically after sign-in and whenever the app needs newer gateway
                            data. Use manual refresh only if the model list looks stale.
                        </p>
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            disabled={isSyncingCatalog || !selectedProviderId}
                            onClick={onSyncCatalog}>
                            <RefreshCw className='h-3.5 w-3.5' />
                            {isSyncingCatalog ? 'Refreshing…' : 'Refresh Catalog'}
                        </Button>
                    </div>
                </details>
            ) : (
                <div className='flex justify-end'>
                    <Button
                        type='button'
                        size='sm'
                        variant='outline'
                        disabled={isSyncingCatalog || !selectedProviderId}
                        onClick={onSyncCatalog}>
                        <RefreshCw className='h-3.5 w-3.5' />
                        {isSyncingCatalog ? 'Syncing…' : 'Sync'}
                    </Button>
                </div>
            )}
        </section>
    );
}
