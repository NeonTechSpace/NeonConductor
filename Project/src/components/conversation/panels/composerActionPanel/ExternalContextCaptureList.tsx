import { X } from 'lucide-react';

import { formatAttachmentBytes } from '@/web/components/conversation/panels/composerActionPanel/helpers';

import type { ComposerExternalContextCaptureInput } from '@/shared/contracts';

interface ExternalContextCaptureListProps {
    captures: ComposerExternalContextCaptureInput[];
    onRemoveCapture: (clientId: string) => void;
}

export function ExternalContextCaptureList({ captures, onRemoveCapture }: ExternalContextCaptureListProps) {
    if (captures.length === 0) {
        return null;
    }

    return (
        <div className='border-border/60 grid gap-2 border-b px-4 py-3 sm:grid-cols-2'>
            {captures.map((capture) => (
                <div key={capture.clientId} className='bg-background/70 min-w-0 rounded-xl border px-3 py-2'>
                    <div className='flex min-w-0 items-start justify-between gap-3'>
                        <div className='min-w-0'>
                            <p className='truncate text-xs font-semibold'>{capture.sourceLabel}</p>
                            <p className='text-muted-foreground truncate text-[11px]'>
                                {capture.sourceType.replaceAll('_', ' ')} ·{' '}
                                {formatAttachmentBytes(capture.byteSize) ?? '0 B'} · external context
                            </p>
                            {capture.originDetail ? (
                                <p className='text-muted-foreground mt-1 truncate text-[11px]'>
                                    {capture.originDetail}
                                </p>
                            ) : null}
                        </div>
                        <button
                            type='button'
                            className='text-muted-foreground hover:text-foreground focus-visible:ring-ring rounded-md p-1 focus-visible:ring-2 focus-visible:outline-none'
                            aria-label={`Remove ${capture.sourceLabel}`}
                            onClick={() => {
                                onRemoveCapture(capture.clientId);
                            }}>
                            <X className='h-3.5 w-3.5' aria-hidden='true' />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );
}
