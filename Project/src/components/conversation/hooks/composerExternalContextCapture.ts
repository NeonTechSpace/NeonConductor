import { err, ok, type Result } from 'neverthrow';

import type { ComposerExternalContextCaptureInput, ExternalContextCaptureSourceType } from '@/shared/contracts';

export const MAX_EXTERNAL_CONTEXT_CAPTURE_BYTES = 256 * 1024;

export interface ComposerExternalContextCaptureDraft {
    sourceType: ExternalContextCaptureSourceType;
    sourceLabel: string;
    originDetail: string;
    text: string;
}

export type PrepareExternalContextCaptureResult = Result<
    ComposerExternalContextCaptureInput,
    {
        message: string;
    }
>;

function normalizeCaptureText(value: string): string {
    return value.replace(/\r\n/g, '\n').trim();
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digestInput = new Uint8Array(bytes.byteLength);
    digestInput.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', digestInput);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createExternalContextCaptureDraft(): ComposerExternalContextCaptureDraft {
    return {
        sourceType: 'clipboard',
        sourceLabel: '',
        originDetail: '',
        text: '',
    };
}

export function measureExternalContextCaptureBytes(text: string): number {
    return new TextEncoder().encode(normalizeCaptureText(text)).byteLength;
}

export async function prepareExternalContextCapture(
    draft: ComposerExternalContextCaptureDraft
): Promise<PrepareExternalContextCaptureResult> {
    const sourceLabel = draft.sourceLabel.trim();
    if (sourceLabel.length === 0) {
        return err({ message: 'Add a source label before attaching external context.' });
    }

    const text = normalizeCaptureText(draft.text);
    if (text.length === 0) {
        return err({ message: 'Paste external text before attaching it.' });
    }

    const bytes = new TextEncoder().encode(text);
    if (bytes.byteLength > MAX_EXTERNAL_CONTEXT_CAPTURE_BYTES) {
        return err({ message: 'External context captures are limited to 256 KB.' });
    }

    return ok({
        clientId: crypto.randomUUID(),
        kind: 'external_context_capture',
        sourceType: draft.sourceType,
        sourceLabel,
        ...(draft.originDetail.trim().length > 0 ? { originDetail: draft.originDetail.trim() } : {}),
        text,
        sha256: await sha256Hex(bytes),
        byteSize: bytes.byteLength,
    });
}
