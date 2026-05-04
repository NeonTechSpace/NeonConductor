import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    CircleDot,
    Clock3,
    FileText,
    GitPullRequestArrow,
    Image,
    LoaderCircle,
    MessageCircle,
    ScrollText,
    Terminal,
} from 'lucide-react';
import { useState } from 'react';

import type {
    WorkbenchTimelineIconToken,
    WorkbenchTimelineItemSeverity,
} from '@/web/components/conversation/messages/workbenchTimelineModel';

import type { ComponentType, ReactNode, SVGProps } from 'react';

type LucideIcon = ComponentType<SVGProps<SVGSVGElement>>;

const iconByToken = {
    message: MessageCircle,
    reasoning: CircleDot,
    activity: LoaderCircle,
    tool: CircleDot,
    terminal: Terminal,
    artifact: ScrollText,
    image: Image,
    error: AlertCircle,
    approval: CheckCircle2,
    file: FileText,
    diff: GitPullRequestArrow,
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

export interface WorkbenchRowShellProps {
    id: string;
    icon: WorkbenchTimelineIconToken;
    severity: WorkbenchTimelineItemSeverity;
    title: string;
    summary?: string;
    defaultCollapsed: boolean;
    isRunning?: boolean;
    meta?: ReactNode;
    children?: ReactNode;
}

export function WorkbenchRowShell({
    id,
    icon,
    severity,
    title,
    summary,
    defaultCollapsed,
    isRunning = false,
    meta,
    children,
}: WorkbenchRowShellProps) {
    const [isExpanded, setIsExpanded] = useState(!defaultCollapsed);
    const Icon = iconByToken[icon];
    const detailsId = `${id}-details`;
    const indicatorClassName = isRunning ? 'motion-safe:animate-pulse motion-reduce:animate-none' : '';

    return (
        <section className={`rounded-lg border text-sm ${severityToneClassName[severity]}`}>
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
                        <span className='block truncate text-xs font-semibold'>{title}</span>
                        {summary ? <span className='block truncate text-xs opacity-85'>{summary}</span> : null}
                    </span>
                </span>
                <span className='flex shrink-0 items-center gap-2 text-[11px] font-medium opacity-80'>
                    {meta}
                    <ChevronDown
                        className={`h-4 w-4 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        aria-hidden='true'
                    />
                </span>
            </button>
            <div
                id={detailsId}
                role='region'
                aria-label={`${title} details`}
                hidden={!isExpanded}
                className='border-t border-current/15 px-3 py-2 text-xs'>
                {children}
            </div>
        </section>
    );
}
