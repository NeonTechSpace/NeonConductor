import { err, ok, type Result } from 'neverthrow';

import type { ComposerTextFileAttachmentInput, ResolvedFileReadGuardPolicy } from '@/shared/contracts';
import {
    evaluateFileReadGuard,
    formatFileReadGuardDecisionMessage,
} from '@/shared/fileReadGuardPolicy';


export interface ComposerPendingTextFile {
    clientId: string;
    fileName: string;
    status: 'reading' | 'ready' | 'failed';
    byteSize?: number;
    errorMessage?: string;
    attachment?: ComposerTextFileAttachmentInput;
}

export interface PreparedComposerTextFileAttachment {
    attachment: ComposerTextFileAttachmentInput;
}

export type PreparedComposerTextFileAttachmentResult = Result<
    PreparedComposerTextFileAttachment,
    {
        message: string;
    }
>;

function decodeUtf8Text(bytes: Uint8Array): { text: string; encoding: ComposerTextFileAttachmentInput['encoding'] } | null {
    const hasBom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf;
    const decoder = new TextDecoder('utf-8', { fatal: true });

    try {
        return {
            text: decoder.decode(hasBom ? bytes.subarray(3) : bytes),
            encoding: hasBom ? 'utf-8-bom' : 'utf-8',
        };
    } catch {
        return null;
    }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const digestInput = new Uint8Array(bytes.byteLength);
    digestInput.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', digestInput);
    return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
}

export function createPendingTextFile(file: File): ComposerPendingTextFile {
    return {
        clientId: crypto.randomUUID(),
        fileName: file.name,
        status: 'reading',
    };
}

export async function prepareComposerTextFileAttachment(
    file: File,
    clientId: string,
    policy: ResolvedFileReadGuardPolicy
): Promise<PreparedComposerTextFileAttachmentResult> {
    const preReadDecision = evaluateFileReadGuard({
        fileNameOrPath: file.name,
        mimeType: file.type,
        byteSize: file.size,
        policy,
    });
    if (!preReadDecision.allowed) {
        return err({
            message: formatFileReadGuardDecisionMessage(file.name, preReadDecision),
        });
    }
    if (preReadDecision.fileKind !== 'text') {
        return err({
            message: `"${file.name}" is not a supported UTF-8 text/code file.`,
        });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = decodeUtf8Text(bytes);
    if (!decoded) {
        const invalidUtf8Decision = evaluateFileReadGuard({
            fileNameOrPath: file.name,
            mimeType: file.type,
            byteSize: file.size,
            policy,
            utf8Valid: false,
        });
        return err({
            message: formatFileReadGuardDecisionMessage(file.name, invalidUtf8Decision),
        });
    }

    const sha256 = await sha256Hex(bytes);

    return ok({
        attachment: {
            clientId,
            kind: 'text_file_attachment',
            fileName: file.name,
            mimeType: file.type || 'text/plain',
            text: decoded.text,
            sha256,
            byteSize: bytes.byteLength,
            encoding: decoded.encoding,
        },
    });
}
