import {
    CircleHelp,
    FileText,
    FileStack,
    Gauge,
    Globe2,
    Paperclip,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';

import type {
    ComposerControlSurfaceAction,
    ComposerControlSurfaceItem,
    ComposerControlSurfaceItemId,
    ComposerControlSurfaceModel,
} from '@/web/components/conversation/panels/composerActionPanel/composerControlSurfaceModel';
import type { WorkspaceInspectorSectionId } from '@/web/components/conversation/sessions/workspaceShellModel';

const iconByItemId: Record<ComposerControlSurfaceItemId, typeof Paperclip> = {
    files: Paperclip,
    'context-assets': FileStack,
    'browser-context': Globe2,
    'external-context': FileText,
    'model-role': Sparkles,
    approvals: ShieldCheck,
    questions: CircleHelp,
    'run-intent': Gauge,
};

function readItemClassName(item: ComposerControlSurfaceItem): string {
    const base =
        'border-border/70 bg-background/70 min-h-[76px] min-w-0 rounded-2xl border px-3 py-2 text-left transition';
    const interactive = item.action && !item.disabled ? ' hover:bg-accent/70 focus-visible:ring-ring focus-visible:ring-2' : '';
    const tone =
        item.tone === 'attention'
            ? ' border-amber-500/35 bg-amber-500/10'
            : item.tone === 'success'
              ? ' border-emerald-500/25 bg-emerald-500/10'
              : item.tone === 'muted'
                ? ' text-muted-foreground'
                : '';

    return `${base}${interactive}${tone}`;
}

function ComposerControlItem({
    item,
    onAction,
}: {
    item: ComposerControlSurfaceItem;
    onAction: (action: ComposerControlSurfaceAction) => void;
}) {
    const Icon = iconByItemId[item.id];
    const content = (
        <>
            <div className='flex min-w-0 items-center gap-2'>
                <Icon className='h-3.5 w-3.5 shrink-0' aria-hidden='true' />
                <span className='truncate text-[11px] font-semibold tracking-[0.08em] uppercase'>{item.label}</span>
            </div>
            <p className='mt-1 truncate text-xs font-semibold text-foreground'>{item.value}</p>
            <p className='text-muted-foreground mt-0.5 line-clamp-2 text-[11px] leading-4'>{item.detail}</p>
        </>
    );

    if (!item.action) {
        return (
            <div className={readItemClassName(item)} aria-label={item.ariaLabel}>
                {content}
            </div>
        );
    }

    return (
        <button
            type='button'
            className={readItemClassName(item)}
            disabled={item.disabled}
            aria-label={item.ariaLabel}
            onClick={() => {
                if (!item.disabled && item.action) {
                    onAction(item.action);
                }
            }}>
            {content}
        </button>
    );
}

export function ComposerControlSurfaceStrip({
    model,
    onOpenFilePicker,
    onOpenBrowserSurface,
    onOpenExternalContextCapture,
    onOpenInspectorSection,
}: {
    model: ComposerControlSurfaceModel;
    onOpenFilePicker: () => void;
    onOpenBrowserSurface?: () => void;
    onOpenExternalContextCapture?: () => void;
    onOpenInspectorSection?: (sectionId: WorkspaceInspectorSectionId) => void;
}) {
    function handleAction(action: ComposerControlSurfaceAction) {
        if (action.kind === 'open-file-picker') {
            onOpenFilePicker();
            return;
        }
        if (action.kind === 'open-browser-surface') {
            onOpenBrowserSurface?.();
            return;
        }
        if (action.kind === 'open-external-context-capture') {
            onOpenExternalContextCapture?.();
            return;
        }
        onOpenInspectorSection?.(action.sectionId);
    }

    return (
        <section aria-label='Composer control surface' className='grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-4'>
            {model.items.map((item) => (
                <ComposerControlItem key={item.id} item={item} onAction={handleAction} />
            ))}
        </section>
    );
}
