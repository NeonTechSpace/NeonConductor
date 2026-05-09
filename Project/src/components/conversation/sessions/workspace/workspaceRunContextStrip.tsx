import { Activity, Folder, GitBranch, ShieldCheck, TerminalSquare } from 'lucide-react';

import { cn } from '@/web/lib/utils';

import type {
    RunContextStripItem,
    RunContextStripModel,
    WorkspaceInspectorSectionId,
} from '@/web/components/conversation/sessions/workspaceShellModel';

interface WorkspaceRunContextStripProps {
    model: RunContextStripModel;
    onOpenInspectorSection: (sectionId: WorkspaceInspectorSectionId) => void;
}

const itemIcon = {
    workspace: Folder,
    'execution-root': TerminalSquare,
    authority: ShieldCheck,
    'branch-worktree': GitBranch,
    run: Activity,
} satisfies Record<RunContextStripItem['id'], typeof Folder>;

function getItemClassName(tone: RunContextStripItem['tone']): string {
    if (tone === 'attention') {
        return 'border-amber-500/45 bg-amber-500/10 text-amber-100 hover:bg-amber-500/15';
    }

    if (tone === 'success') {
        return 'border-emerald-500/35 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15';
    }

    if (tone === 'muted') {
        return 'border-border/70 bg-background/45 text-muted-foreground hover:bg-background/65';
    }

    return 'border-border bg-background/70 text-foreground hover:bg-background';
}

export function WorkspaceRunContextStrip({ model, onOpenInspectorSection }: WorkspaceRunContextStripProps) {
    return (
        <div aria-label='Run context' className='grid gap-2 sm:grid-cols-2 xl:grid-cols-5'>
            {model.items.map((item) => {
                const Icon = itemIcon[item.id];

                return (
                    <button
                        key={item.id}
                        type='button'
                        className={cn(
                            'min-h-16 min-w-0 rounded-xl border px-3 py-2 text-left transition-colors',
                            'focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
                            getItemClassName(item.tone)
                        )}
                        title={`${item.label}: ${item.value}. ${item.detail}`}
                        aria-label={item.ariaLabel}
                        data-inspector-section={item.inspectorSectionId}
                        onClick={() => {
                            onOpenInspectorSection(item.inspectorSectionId);
                        }}>
                        <span className='flex min-w-0 items-center gap-2'>
                            <Icon className='size-3.5 shrink-0' aria-hidden='true' />
                            <span className='text-muted-foreground min-w-0 truncate text-[11px] font-medium'>
                                {item.label}
                            </span>
                        </span>
                        <span className='mt-1 block min-w-0 truncate text-sm font-semibold'>{item.value}</span>
                        <span className='text-muted-foreground mt-0.5 block min-w-0 truncate text-xs'>
                            {item.detail}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}
