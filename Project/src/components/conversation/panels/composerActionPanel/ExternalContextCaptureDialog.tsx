import { useId, useRef, useState } from 'react';

import {
    createExternalContextCaptureDraft,
    measureExternalContextCaptureBytes,
    prepareExternalContextCapture,
    type ComposerExternalContextCaptureDraft,
} from '@/web/components/conversation/hooks/composerExternalContextCapture';
import { formatAttachmentBytes } from '@/web/components/conversation/panels/composerActionPanel/helpers';
import { DialogSurface } from '@/web/components/ui/dialogSurface';

import type { ComposerExternalContextCaptureInput, ExternalContextCaptureSourceType } from '@/shared/contracts';
import { externalContextCaptureSourceTypes } from '@/shared/contracts';

const sourceTypeLabels: Record<ExternalContextCaptureSourceType, string> = {
    clipboard: 'Clipboard',
    command_output: 'Command output',
    log_excerpt: 'Log excerpt',
    stack_trace: 'Stack trace',
    other: 'Other',
};

interface ExternalContextCaptureDialogProps {
    open: boolean;
    onClose: () => void;
    onAddCapture: (capture: ComposerExternalContextCaptureInput) => void;
}

export function ExternalContextCaptureDialog({ open, onClose, onAddCapture }: ExternalContextCaptureDialogProps) {
    const titleId = useId();
    const descriptionId = useId();
    const initialFocusRef = useRef<HTMLInputElement>(null);
    const [draft, setDraft] = useState<ComposerExternalContextCaptureDraft>(createExternalContextCaptureDraft);
    const [validationMessage, setValidationMessage] = useState<string | undefined>(undefined);
    const [isPreparing, setIsPreparing] = useState(false);
    const byteSize = measureExternalContextCaptureBytes(draft.text);

    function updateDraft(update: Partial<ComposerExternalContextCaptureDraft>) {
        setDraft((current) => ({ ...current, ...update }));
        setValidationMessage(undefined);
    }

    async function handleAdd() {
        setIsPreparing(true);
        const prepared = await prepareExternalContextCapture(draft);
        setIsPreparing(false);
        if (prepared.isErr()) {
            setValidationMessage(prepared.error.message);
            return;
        }
        onAddCapture(prepared.value);
        setDraft(createExternalContextCaptureDraft());
        setValidationMessage(undefined);
        onClose();
    }

    return (
        <DialogSurface
            open={open}
            titleId={titleId}
            descriptionId={descriptionId}
            initialFocusRef={initialFocusRef}
            onClose={onClose}>
            <div className='bg-card text-card-foreground w-[min(720px,calc(100vw-2rem))] rounded-2xl border p-4 shadow-xl'>
                <div className='mb-4'>
                    <h2 id={titleId} className='text-base font-semibold'>
                        External Context
                    </h2>
                    <p id={descriptionId} className='text-muted-foreground text-sm'>
                        Attach source-labeled external text as context for the next executable run.
                    </p>
                </div>
                <div className='grid gap-3 text-sm'>
                    <div className='grid gap-3 sm:grid-cols-[180px_minmax(0,1fr)]'>
                        <label className='space-y-1'>
                            <span className='text-muted-foreground text-xs'>Source type</span>
                            <select
                                className='border-input bg-background h-9 w-full rounded-md border px-2'
                                value={draft.sourceType}
                                onChange={(event) => {
                                    updateDraft({ sourceType: event.target.value as ExternalContextCaptureSourceType });
                                }}>
                                {externalContextCaptureSourceTypes.map((sourceType) => (
                                    <option key={sourceType} value={sourceType}>
                                        {sourceTypeLabels[sourceType]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className='space-y-1'>
                            <span className='text-muted-foreground text-xs'>Source label</span>
                            <input
                                ref={initialFocusRef}
                                className='border-input bg-background h-9 w-full rounded-md border px-3'
                                value={draft.sourceLabel}
                                onChange={(event) => {
                                    updateDraft({ sourceLabel: event.target.value });
                                }}
                                placeholder='Build log excerpt'
                            />
                        </label>
                    </div>
                    <label className='space-y-1'>
                        <span className='text-muted-foreground text-xs'>Origin detail</span>
                        <input
                            className='border-input bg-background h-9 w-full rounded-md border px-3'
                            value={draft.originDetail}
                            onChange={(event) => {
                                updateDraft({ originDetail: event.target.value });
                            }}
                            placeholder='Optional command, file, URL, or tool name'
                        />
                    </label>
                    <label className='space-y-1'>
                        <span className='text-muted-foreground text-xs'>External text</span>
                        <textarea
                            className='border-input bg-background min-h-56 w-full resize-y rounded-md border px-3 py-2 leading-5'
                            value={draft.text}
                            onChange={(event) => {
                                updateDraft({ text: event.target.value });
                            }}
                            placeholder='Paste external context here'
                        />
                    </label>
                    <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
                        <p className='text-muted-foreground'>{formatAttachmentBytes(byteSize) ?? '0 B'}</p>
                        {validationMessage ? <p className='text-destructive'>{validationMessage}</p> : null}
                    </div>
                    <div className='flex justify-end gap-2'>
                        <button
                            type='button'
                            className='rounded-md border px-3 py-2 text-sm'
                            onClick={onClose}
                            disabled={isPreparing}>
                            Cancel
                        </button>
                        <button
                            type='button'
                            className='bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm disabled:opacity-60'
                            disabled={isPreparing}
                            onClick={() => {
                                void handleAdd();
                            }}>
                            Add
                        </button>
                    </div>
                </div>
            </div>
        </DialogSurface>
    );
}
