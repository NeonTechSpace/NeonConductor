import { LoaderCircle, X } from 'lucide-react';

import { Button } from '@/web/components/ui/button';

export interface PendingTextFileCardView {
    clientId: string;
    fileName: string;
    status: 'reading' | 'ready' | 'failed';
    byteSize?: number;
    errorMessage?: string;
    attachment?: {
        mimeType: string;
        encoding: 'utf-8' | 'utf-8-bom';
    };
}

interface PendingTextFilesListProps {
    pendingTextFiles: PendingTextFileCardView[];
    onRemovePendingTextFile: (clientId: string) => void;
    formatByteSize: (value?: number) => string | undefined;
}

export function PendingTextFilesList({
    pendingTextFiles,
    onRemovePendingTextFile,
    formatByteSize,
}: PendingTextFilesListProps) {
    if (pendingTextFiles.length === 0) {
        return null;
    }

    return (
        <div className='border-border space-y-2 border-b px-4 py-4'>
            {pendingTextFiles.map((file) => (
                <div
                    key={file.clientId}
                    className='border-border bg-background/80 flex items-start justify-between gap-3 rounded-2xl border px-3 py-3'>
                    <div className='min-w-0 flex-1 space-y-1'>
                        <p className='truncate text-xs font-medium'>{file.fileName}</p>
                        <p className='text-muted-foreground text-[11px]'>
                            {file.attachment ? `${file.attachment.mimeType} · ${file.attachment.encoding}` : 'Reading file…'}
                            {formatByteSize(file.byteSize) ? ` · ${formatByteSize(file.byteSize)}` : ''}
                        </p>
                        {file.errorMessage ? (
                            <p className='text-destructive text-[11px]'>{file.errorMessage}</p>
                        ) : (
                            <p className='text-muted-foreground text-[11px]'>
                                {file.status === 'reading'
                                    ? 'Preparing text attachment.'
                                    : file.status === 'ready'
                                      ? 'Text attachment is ready to be sent with this message.'
                                      : 'Text attachment is waiting for action.'}
                            </p>
                        )}
                    </div>
                    <div className='flex items-center gap-1'>
                        {file.status === 'reading' ? (
                            <span className='text-muted-foreground inline-flex items-center gap-1 px-2 text-[11px]'>
                                <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
                                Reading
                            </span>
                        ) : null}
                        <Button
                            type='button'
                            size='sm'
                            variant='outline'
                            className='h-7 px-2 text-[11px]'
                            onClick={() => {
                                onRemovePendingTextFile(file.clientId);
                            }}>
                            <X className='h-3.5 w-3.5' />
                            Remove
                        </Button>
                    </div>
                </div>
            ))}
        </div>
    );
}
