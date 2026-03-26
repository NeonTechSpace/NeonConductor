interface SettingsPlannedSectionProps {
    eyebrow: string;
    title: string;
    description: string;
    warning?: string;
}

export function SettingsPlannedSection({ eyebrow, title, description, warning }: SettingsPlannedSectionProps) {
    return (
        <section className='mx-auto flex max-w-3xl flex-col gap-5 p-5 md:p-6'>
            <div className='space-y-2'>
                <p className='text-primary text-[11px] font-semibold tracking-[0.16em] uppercase'>{eyebrow}</p>
                <div className='space-y-1'>
                    <h4 className='text-xl font-semibold text-balance'>{title}</h4>
                    <p className='text-muted-foreground text-sm leading-6'>{description}</p>
                </div>
            </div>

            <div className='border-border/70 bg-card/55 rounded-[24px] border p-5'>
                <p className='text-sm font-semibold'>Not available yet</p>
                <p className='text-muted-foreground mt-2 text-sm leading-6'>
                    This area is reserved in the settings IA so it lands in the correct long-term location instead of
                    moving again later.
                </p>
                {warning ? (
                    <div className='mt-4 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-4 py-3'>
                        <p className='text-sm font-medium text-amber-700 dark:text-amber-300'>Warning</p>
                        <p className='mt-1 text-sm leading-6 text-amber-800/90 dark:text-amber-200/90'>{warning}</p>
                    </div>
                ) : null}
            </div>
        </section>
    );
}
