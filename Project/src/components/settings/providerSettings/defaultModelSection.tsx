import { RefreshCw } from 'lucide-react';

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
    onSetDefault: () => void;
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
    onSetDefault,
    onSyncCatalog,
}: ProviderDefaultModelSectionProps) {
    const isKilo = selectedProviderId === 'kilo';

    return (
        <section className='space-y-3 rounded-2xl border border-border/70 bg-card/40 p-4'>
            <div className='space-y-1'>
                <p className='text-sm font-semibold'>Default Model</p>
                <p className='text-muted-foreground text-xs'>
                    {isKilo
                        ? 'Choose the Kilo model profile that should be preselected in settings and the composer.'
                        : 'Choose the model that should be preselected for this provider in settings and the composer.'}
                </p>
            </div>
            <div className={`grid gap-2 ${isKilo ? 'md:grid-cols-[minmax(0,1fr)_auto]' : 'md:grid-cols-[minmax(0,1fr)_auto_auto]'}`}>
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
                <Button
                    type='button'
                    size='sm'
                    variant='outline'
                    className='md:self-end'
                    disabled={!selectedModelId || isSavingDefault || isDefaultModel}
                    onClick={onSetDefault}>
                    {isDefaultModel ? 'Default' : 'Set Default'}
                </Button>
            </div>
            {isKilo ? (
                <details className='border-border/70 bg-background/70 rounded-2xl border p-4'>
                    <summary className='cursor-pointer list-none text-sm font-medium'>Advanced catalog tools</summary>
                    <div className='mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
                        <p className='text-muted-foreground text-xs leading-5'>
                            Kilo metadata refreshes automatically after sign-in and whenever the app needs newer
                            gateway data. Use manual refresh only if the model list looks stale.
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

