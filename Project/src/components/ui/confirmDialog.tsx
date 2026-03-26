import { useId, useRef } from 'react';

import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type { ReactNode } from 'react';

interface ConfirmDialogProps {
    open: boolean;
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    busy?: boolean;
    confirmDisabled?: boolean;
    children?: ReactNode;
    onConfirm: () => void;
    onCancel: () => void;
}

export function ConfirmDialog({
    open,
    title,
    message,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    destructive = false,
    busy = false,
    confirmDisabled = false,
    children,
    onConfirm,
    onCancel,
}: ConfirmDialogProps): ReactNode {
    const titleId = useId();
    const descriptionId = useId();
    const cancelButtonRef = useRef<HTMLButtonElement>(null);

    if (!open) {
        return null;
    }

    return (
        <DialogSurface
            open={open}
            titleId={titleId}
            descriptionId={descriptionId}
            initialFocusRef={cancelButtonRef}
            onClose={() => {
                if (!busy) {
                    onCancel();
                }
            }}>
            <div className='border-border bg-card text-card-foreground w-full max-w-[32rem] rounded-2xl border p-6 shadow-xl'>
                <h2 id={titleId} className='text-base font-semibold'>
                    {title}
                </h2>
                <p id={descriptionId} className='text-muted-foreground mt-2 text-sm leading-6 text-balance break-words'>
                    {message}
                </p>
                {children ? <div className='mt-4'>{children}</div> : null}
                <div className='mt-6 flex flex-wrap justify-end gap-2'>
                    <button
                        ref={cancelButtonRef}
                        type='button'
                        className='border-border bg-background hover:bg-accent focus-visible:ring-ring min-h-11 rounded-xl border px-4 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none'
                        onClick={onCancel}
                        disabled={busy}>
                        {cancelLabel}
                    </button>
                    <button
                        type='button'
                        className={`focus-visible:ring-ring min-h-11 rounded-xl px-4 py-2 text-sm text-white focus-visible:ring-2 focus-visible:outline-none ${
                            destructive ? 'bg-destructive hover:bg-destructive/85' : 'bg-primary hover:bg-primary/85'
                        }`}
                        onClick={onConfirm}
                        disabled={busy || confirmDisabled}>
                        {busy ? 'Working...' : confirmLabel}
                    </button>
                </div>
            </div>
        </DialogSurface>
    );
}
