import { AlertCircle, CheckCircle2, ChevronDown, CircleDot, Clock3, LoaderCircle, MessageCircle } from 'lucide-react';
import { useState } from 'react';

import type {
    WorkbenchTimelineIconToken,
    WorkbenchTimelineItemSeverity,
    WorkbenchTimelineItemStatus,
} from '@/web/components/conversation/messages/workbenchTimelineModel';

import type { ComponentType, SVGProps } from 'react';

export interface WorkbenchStatusRowItem {
    workbenchItemId: string;
    code: 'received' | 'stalled' | 'failed_before_output';
    label: string;
    status: WorkbenchTimelineItemStatus;
    severity: WorkbenchTimelineItemSeverity;
    icon: WorkbenchTimelineIconToken;
    title: string;
    defaultCollapsed: boolean;
    summary?: string;
    elapsedMs?: number;
}

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

const iconByToken = {
    message: MessageCircle,
    reasoning: CircleDot,
    activity: LoaderCircle,
    tool: CircleDot,
    terminal: CircleDot,
    artifact: CircleDot,
    image: CircleDot,
    error: AlertCircle,
    approval: CheckCircle2,
    file: CircleDot,
    diff: CircleDot,
    plan: CircleDot,
    web: CircleDot,
    queue: Clock3,
} satisfies Record<WorkbenchTimelineIconToken, LucideIcon>;

const severityToneClassName = {
    neutral: 'border-border/70 bg-background/70 text-muted-foreground',
    info: 'border-primary/20 bg-primary/5 text-primary',
    success: 'border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
    warning: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
    error: 'border-destructive/35 bg-destructive/10 text-destructive',
} satisfies Record<WorkbenchTimelineItemSeverity, string>;

function formatElapsedMs(elapsedMs: number): string {
    if (elapsedMs < 1000) {
        return `${String(elapsedMs)} ms`;
    }

    const seconds = elapsedMs / 1000;
    if (seconds < 60) {
        return `${seconds.toFixed(seconds >= 10 ? 0 : 1)} s`;
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${String(minutes)} min ${String(remainingSeconds)} s`;
}

function statusLabel(status: WorkbenchTimelineItemStatus): string {
    if (status === 'running') {
        return 'Running';
    }
    if (status === 'pending') {
        return 'Pending';
    }
    if (status === 'failed') {
        return 'Failed';
    }
    if (status === 'sending') {
        return 'Sending';
    }
    return 'Completed';
}

export function WorkbenchStatusRow({ item }: { item: WorkbenchStatusRowItem }) {
    const [isExpanded, setIsExpanded] = useState(!item.defaultCollapsed);
    const Icon = iconByToken[item.icon];
    const detailsId = `${item.workbenchItemId}-details`;
    const isRunning = item.status === 'running' || item.status === 'pending' || item.status === 'sending';
    const indicatorClassName = isRunning ? 'motion-safe:animate-pulse motion-reduce:animate-none' : '';

    return (
        <section className={`rounded-lg border text-sm ${severityToneClassName[item.severity]}`}>
            <button
                type='button'
                className='flex w-full items-center justify-between gap-3 px-3 py-2 text-left'
                aria-expanded={isExpanded}
                aria-controls={detailsId}
                onClick={() => {
                    setIsExpanded((current) => !current);
                }}>
                <span className='flex min-w-0 items-center gap-2'>
                    <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center ${indicatorClassName}`}>
                        <Icon className='h-4 w-4' aria-hidden='true' />
                    </span>
                    <span className='min-w-0'>
                        <span className='block truncate text-xs font-semibold'>{item.title}</span>
                        <span className='block truncate text-xs opacity-85'>{item.label}</span>
                    </span>
                </span>
                <span className='flex shrink-0 items-center gap-2 text-[11px] font-medium opacity-80'>
                    {item.elapsedMs !== undefined ? <span>{formatElapsedMs(item.elapsedMs)}</span> : null}
                    <ChevronDown
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        aria-hidden='true'
                    />
                </span>
            </button>
            <div
                id={detailsId}
                role='region'
                aria-label={`${item.title} details`}
                hidden={!isExpanded}
                className='border-t border-current/15 px-3 py-2 text-xs'>
                <dl className='grid gap-1 sm:grid-cols-[auto_1fr]'>
                    <dt className='font-medium opacity-75'>Status</dt>
                    <dd>{statusLabel(item.status)}</dd>
                    <dt className='font-medium opacity-75'>Summary</dt>
                    <dd>{item.summary ?? item.label}</dd>
                    {item.elapsedMs !== undefined ? (
                        <>
                            <dt className='font-medium opacity-75'>Elapsed</dt>
                            <dd>{formatElapsedMs(item.elapsedMs)}</dd>
                        </>
                    ) : null}
                </dl>
            </div>
        </section>
    );
}
