import { describe, expect, it } from 'vitest';

import {
    MAX_EXTERNAL_CONTEXT_CAPTURE_BYTES,
    createExternalContextCaptureDraft,
    measureExternalContextCaptureBytes,
    prepareExternalContextCapture,
} from '@/web/components/conversation/hooks/composerExternalContextCapture';

describe('prepareExternalContextCapture', () => {
    it('normalizes text and prepares source-labeled external context', async () => {
        const prepared = await prepareExternalContextCapture({
            sourceType: 'log_excerpt',
            sourceLabel: 'Build log excerpt',
            originDetail: 'pnpm test',
            text: '  line one\r\nline two  ',
        });

        expect(prepared.isOk()).toBe(true);
        if (prepared.isErr()) {
            return;
        }

        expect(prepared.value).toMatchObject({
            kind: 'external_context_capture',
            sourceType: 'log_excerpt',
            sourceLabel: 'Build log excerpt',
            originDetail: 'pnpm test',
            text: 'line one\nline two',
            byteSize: measureExternalContextCaptureBytes('line one\nline two'),
        });
        expect(prepared.value.sha256).toMatch(/^[a-f0-9]{64}$/);
    });

    it('rejects missing labels, empty text, and oversized captures', async () => {
        const missingLabel = await prepareExternalContextCapture({
            ...createExternalContextCaptureDraft(),
            text: 'content',
        });
        expect(missingLabel.isErr()).toBe(true);
        expect(missingLabel._unsafeUnwrapErr().message).toBe('Add a source label before attaching external context.');

        const missingText = await prepareExternalContextCapture({
            ...createExternalContextCaptureDraft(),
            sourceLabel: 'Log',
        });
        expect(missingText.isErr()).toBe(true);
        expect(missingText._unsafeUnwrapErr().message).toBe('Paste external text before attaching it.');

        const oversized = await prepareExternalContextCapture({
            sourceType: 'clipboard',
            sourceLabel: 'Large paste',
            originDetail: '',
            text: 'a'.repeat(MAX_EXTERNAL_CONTEXT_CAPTURE_BYTES + 1),
        });
        expect(oversized.isErr()).toBe(true);
        expect(oversized._unsafeUnwrapErr().message).toBe('External context captures are limited to 256 KB.');
    });
});
