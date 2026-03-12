import {
    DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
    MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY,
    MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE,
} from '@/shared/contracts';

interface ComposerMediaSettingsSectionProps {
    draft: {
        maxImageAttachmentsPerMessage: string;
        imageCompressionConcurrency: string;
    };
    isSaving: boolean;
    onDraftChange: (
        updater: (
            current: ComposerMediaSettingsSectionProps['draft']
        ) => ComposerMediaSettingsSectionProps['draft']
    ) => void;
    onSave: () => void;
}

export function ComposerMediaSettingsSection({
    draft,
    isSaving,
    onDraftChange,
    onSave,
}: ComposerMediaSettingsSectionProps) {
    return (
        <section className='space-y-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4'>
            <div className='space-y-1'>
                <h4 className='text-sm font-semibold'>Composer media</h4>
                <p className='text-muted-foreground text-xs leading-5'>
                    These app-level defaults control how many images a message can hold and how many compress at once
                    on this device.
                </p>
            </div>

            <div className='grid gap-3 md:grid-cols-2'>
                <div className='max-w-sm space-y-1'>
                    <label className='text-sm font-medium'>Images per message</label>
                    <input
                        aria-label='Maximum images per message'
                        type='number'
                        min={1}
                        max={MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE}
                        value={draft.maxImageAttachmentsPerMessage}
                        onChange={(event) => {
                            onDraftChange((current) => ({
                                ...current,
                                maxImageAttachmentsPerMessage: event.target.value,
                            }));
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                    />
                    <p className='text-muted-foreground text-xs'>
                        Default {DEFAULT_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE}. Hard max{' '}
                        {MAX_COMPOSER_MAX_IMAGE_ATTACHMENTS_PER_MESSAGE}.
                    </p>
                </div>

                <div className='max-w-sm space-y-1'>
                    <label className='text-sm font-medium'>Images processed simultaneously</label>
                    <input
                        aria-label='Image compression concurrency'
                        type='number'
                        min={1}
                        max={MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY}
                        value={draft.imageCompressionConcurrency}
                        onChange={(event) => {
                            onDraftChange((current) => ({
                                ...current,
                                imageCompressionConcurrency: event.target.value,
                            }));
                        }}
                        className='border-border bg-background h-9 w-full rounded-md border px-2 text-sm'
                    />
                    <p className='text-muted-foreground text-xs'>
                        Default {DEFAULT_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY}. Hard max{' '}
                        {MAX_COMPOSER_IMAGE_COMPRESSION_CONCURRENCY}.
                    </p>
                </div>
            </div>

            <div className='space-y-3'>
                <p className='text-xs leading-5 text-amber-100/90'>
                    Higher values can increase CPU load, memory use, and prompt preparation time. Slower machines
                    usually feel better with lower concurrency.
                </p>
                <button
                    type='button'
                    className='border-border bg-background hover:bg-accent rounded-md border px-3 py-2 text-sm'
                    disabled={isSaving}
                    onClick={onSave}>
                    Save composer media defaults
                </button>
            </div>
        </section>
    );
}
