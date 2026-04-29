import { FileText, LoaderCircle, X } from 'lucide-react';

import { Button } from '@/web/components/ui/button';

export interface PendingDocumentCardView {
    clientId: string;
    fileName: string;
    status: 'preparing' | 'ready' | 'failed';
    byteSize?: number;
    errorMessage?: string;
    attachment?: {
        mimeType: 'application/pdf';
        pageCount?: number;
        extractedTextTokenCount: number;
    };
}

interface PendingDocumentsListProps {
    pendingDocuments: PendingDocumentCardView[];
    onRemovePendingDocument: (clientId: string) => void;
    formatByteSize: (value?: number) => string | undefined;
}

export function PendingDocumentsList({
    pendingDocuments,
    onRemovePendingDocument,
    formatByteSize,
}: PendingDocumentsListProps) {
    if (pendingDocuments.length === 0) {
        return null;
    }

    return (
        <div className='border-border space-y-2 border-b px-4 py-4'>
            {pendingDocuments.map((document) => {
                const byteLabel = formatByteSize(document.byteSize);
                return (
                    <div
                        key={document.clientId}
                        className='border-border bg-background/80 flex items-start justify-between gap-3 rounded-2xl border px-3 py-3'>
                        <div className='min-w-0 flex-1 space-y-1'>
                            <p className='flex items-center gap-2 truncate text-xs font-medium'>
                                <FileText className='h-3.5 w-3.5 shrink-0' />
                                <span className='truncate'>{document.fileName}</span>
                            </p>
                            <p className='text-muted-foreground text-[11px]'>
                                PDF
                                {document.attachment?.pageCount ? ` · ${String(document.attachment.pageCount)} pages` : ''}
                                {document.attachment
                                    ? ` · ~${String(document.attachment.extractedTextTokenCount)} extracted tokens`
                                    : ''}
                                {byteLabel ? ` · ${byteLabel}` : ''}
                            </p>
                            {document.errorMessage ? (
                                <p className='text-destructive text-[11px]'>{document.errorMessage}</p>
                            ) : (
                                <p className='text-muted-foreground text-[11px]'>
                                    {document.status === 'preparing'
                                        ? 'Extracting PDF text.'
                                        : document.status === 'ready'
                                          ? 'PDF extracted text is ready for bounded context planning.'
                                          : 'PDF attachment is waiting for action.'}
                                </p>
                            )}
                        </div>
                        <div className='flex items-center gap-1'>
                            {document.status === 'preparing' ? (
                                <span className='text-muted-foreground inline-flex items-center gap-1 px-2 text-[11px]'>
                                    <LoaderCircle className='h-3.5 w-3.5 animate-spin' />
                                    Extracting
                                </span>
                            ) : null}
                            <Button
                                type='button'
                                size='sm'
                                variant='outline'
                                className='h-7 px-2 text-[11px]'
                                onClick={() => {
                                    onRemovePendingDocument(document.clientId);
                                }}>
                                <X className='h-3.5 w-3.5' />
                                Remove
                            </Button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
