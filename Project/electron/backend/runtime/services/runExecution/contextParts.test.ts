import { describe, expect, it } from 'vitest';

import { appendPromptMessage } from '@/app/backend/runtime/services/runExecution/contextParts';

describe('appendPromptMessage', () => {
    it('adds selected PDF document text as user context without emitting raw document attachments', () => {
        const messages = appendPromptMessage({
            messages: [],
            prompt: 'Summarize this PDF.',
            attachments: [
                {
                    clientId: 'doc-client',
                    kind: 'document_attachment',
                    documentArtifactId: 'doc_context',
                    fileName: 'context.pdf',
                    mimeType: 'application/pdf',
                    sha256: 'sha-context',
                    byteSize: 1024,
                    extractionState: 'extracted',
                    extractedTextByteSize: 256,
                    extractedTextTokenCount: 64,
                },
            ],
            documentContexts: [
                {
                    summary: {
                        documentArtifactId: 'doc_context',
                        fileName: 'context.pdf',
                        mimeType: 'application/pdf',
                        byteSize: 1024,
                        extractionState: 'extracted',
                        contextMode: 'selected_text',
                        countingState: 'exact_text_estimate',
                        selectedPageRanges: [{ startPage: 1, endPage: 1 }],
                        selectedTokenCount: 64,
                        selectedTextByteSize: 256,
                        omittedPageCount: 0,
                    },
                    contextText: 'Attached PDF document: context.pdf\n\n[Page 1]\nPDF text.',
                },
            ],
        });

        expect(messages).toHaveLength(1);
        expect(messages[0]?.parts).toEqual([
            {
                type: 'text',
                text: 'Summarize this PDF.',
            },
            {
                type: 'text',
                text: 'Attached PDF document: context.pdf\n\n[Page 1]\nPDF text.',
            },
        ]);
    });
});
