import type { OperatorDiagnosticViewModel } from '@/web/lib/operatorDiagnostics';
import { cn } from '@/web/lib/utils';

interface OperatorDiagnosticListProps {
    diagnostics: OperatorDiagnosticViewModel[];
    className?: string;
    compact?: boolean;
}

function toneClassName(tone: OperatorDiagnosticViewModel['tone']): string {
    switch (tone) {
        case 'error':
            return 'border-destructive/30 bg-destructive/10 text-destructive';
        case 'warning':
            return 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100';
        case 'info':
            return 'border-border bg-background/70 text-muted-foreground';
    }
}

export function OperatorDiagnosticCard(input: { diagnostic: OperatorDiagnosticViewModel; compact?: boolean }) {
    const { diagnostic, compact = false } = input;

    return (
        <article
            aria-live='polite'
            role={diagnostic.tone === 'error' ? 'alert' : 'status'}
            className={cn('rounded-xl border px-3 py-2 text-sm', toneClassName(diagnostic.tone), compact && 'text-xs')}>
            <div className='flex flex-wrap items-start justify-between gap-2'>
                <div className='min-w-0 flex-1'>
                    <p className='font-semibold'>{diagnostic.title}</p>
                    <p className={cn('mt-1 leading-5', diagnostic.tone === 'info' ? 'text-muted-foreground' : '')}>
                        {diagnostic.detail}
                    </p>
                </div>
                {diagnostic.actionLabel ? (
                    <span className='rounded-full border border-current/20 px-2 py-0.5 text-[11px] font-medium'>
                        {diagnostic.actionLabel}
                    </span>
                ) : null}
            </div>
            {diagnostic.metadata && diagnostic.metadata.length > 0 ? (
                <dl className='mt-2 grid gap-1 text-[11px]'>
                    {diagnostic.metadata.map((item) => (
                        <div key={`${item.label}:${item.value}`} className='flex min-w-0 gap-2'>
                            <dt className='shrink-0 font-medium'>{item.label}</dt>
                            <dd className='min-w-0 break-all'>{item.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
        </article>
    );
}

export function OperatorDiagnosticList({ diagnostics, className, compact = false }: OperatorDiagnosticListProps) {
    if (diagnostics.length === 0) {
        return null;
    }

    return (
        <div className={cn('space-y-2', className)}>
            {diagnostics.map((diagnostic) => (
                <OperatorDiagnosticCard
                    key={`${diagnostic.tone}:${diagnostic.title}:${diagnostic.detail}`}
                    diagnostic={diagnostic}
                    compact={compact}
                />
            ))}
        </div>
    );
}
