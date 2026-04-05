import { cn } from '@/web/lib/utils';

import type { ReactNode } from 'react';


interface SettingsContentScaffoldProps {
    eyebrow: string;
    title: string;
    description: string;
    toolbar?: ReactNode;
    children: ReactNode;
    className?: string;
    contentClassName?: string;
}

export function SettingsContentScaffold({
    eyebrow,
    title,
    description,
    toolbar,
    children,
    className,
    contentClassName,
}: SettingsContentScaffoldProps) {
    return (
        <div className='min-h-0 min-w-0 overflow-y-auto'>
            <div className={cn('mx-auto flex max-w-5xl flex-col gap-5 p-5 md:p-6', className)}>
                <div className='flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between'>
                    <div className='min-w-0 space-y-2'>
                        <p className='text-primary text-[11px] font-semibold tracking-[0.16em] uppercase'>
                            {eyebrow}
                        </p>
                        <div className='space-y-1'>
                            <h4 className='text-xl font-semibold text-balance'>{title}</h4>
                            <p className='text-muted-foreground max-w-3xl text-sm leading-6'>{description}</p>
                        </div>
                    </div>
                    {toolbar ? <div className='min-w-0 shrink-0'>{toolbar}</div> : null}
                </div>

                <div className={cn('space-y-5', contentClassName)}>{children}</div>
            </div>
        </div>
    );
}
