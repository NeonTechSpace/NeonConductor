import { err, ok, type Result } from 'neverthrow';

import type {
    ComposerDocumentAttachmentInput,
    DocumentArtifactSummary,
    ResolvedFileReadGuardPolicy,
} from '@/shared/contracts';
import { evaluateFileReadGuard, formatFileReadGuardDecisionMessage } from '@/shared/fileReadGuardPolicy';

export interface ComposerPendingDocument {
    clientId: string;
    fileName: string;
    status: 'preparing' | 'ready' | 'failed';
    byteSize?: number;
    errorMessage?: string;
    attachment?: ComposerDocumentAttachmentInput;
    document?: DocumentArtifactSummary;
}

export interface PreparedComposerDocumentPayload {
    clientId: string;
    fileName: string;
    mimeType: 'application/pdf';
    byteSize: number;
    sha256: string;
    bytesBase64: string;
}

export type PreparedComposerDocumentPayloadResult = Result<
    PreparedComposerDocumentPayload,
    {
        message: string;
    }
>;

function bytesToBase64(bytes: Uint8Array): string {
    let binary = '';
    const chunkSize = 0x8000;
    for (let index = 0; index < bytes.length; index += chunkSize) {
        const chunk = bytes.subarray(index, index + chunkSize);
        binary += String.fromCharCode(...chunk);
    }
    return btoa(binary);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digestInput = new Uint8Array(bytes.byteLength);
    digestInput.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', digestInput);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createPendingDocument(file: File): ComposerPendingDocument {
    return {
        clientId: crypto.randomUUID(),
        fileName: file.name,
        status: 'preparing',
        byteSize: file.size,
    };
}

export async function prepareComposerDocumentPayload(
    file: File,
    clientId: string,
    policy: ResolvedFileReadGuardPolicy
): Promise<PreparedComposerDocumentPayloadResult> {
    const decision = evaluateFileReadGuard({
        fileNameOrPath: file.name,
        mimeType: file.type || 'application/pdf',
        byteSize: file.size,
        policy,
    });
    if (!decision.allowed) {
        return err({
            message: formatFileReadGuardDecisionMessage(file.name, decision),
        });
    }
    if (decision.fileKind !== 'pdf') {
        return err({
            message: `"${file.name}" is not a supported PDF document.`,
        });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    return ok({
        clientId,
        fileName: file.name,
        mimeType: 'application/pdf',
        byteSize: bytes.byteLength,
        sha256: await sha256Hex(bytes),
        bytesBase64: bytesToBase64(bytes),
    });
}
