import { err, ok, type Result } from 'neverthrow';

import type { ComposerTextFileAttachmentInput } from '@/shared/contracts';

const MAX_TEXT_FILE_ATTACHMENT_BYTES = 256 * 1024;

const textFileExtensions = new Set([
    '.txt',
    '.md',
    '.markdown',
    '.json',
    '.yml',
    '.yaml',
    '.toml',
    '.ini',
    '.conf',
    '.env',
    '.xml',
    '.html',
    '.htm',
    '.css',
    '.scss',
    '.less',
    '.js',
    '.jsx',
    '.ts',
    '.tsx',
    '.mjs',
    '.cjs',
    '.py',
    '.rb',
    '.go',
    '.rs',
    '.java',
    '.kt',
    '.c',
    '.cc',
    '.cpp',
    '.h',
    '.hpp',
    '.cs',
    '.php',
    '.sql',
    '.sh',
    '.ps1',
    '.bat',
    '.cmd',
    '.graphql',
    '.gql',
    '.dockerfile',
]);

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

function getFileExtension(fileName: string): string {
    const lastDotIndex = fileName.lastIndexOf('.');
    if (lastDotIndex < 0) {
        return '';
    }
    return fileName.slice(lastDotIndex).toLowerCase();
}

function isLikelyTextFile(file: File): boolean {
    if (file.type.startsWith('text/')) {
        return true;
    }
    if (file.type === 'application/json' || file.type === 'application/xml') {
        return true;
    }
    return textFileExtensions.has(getFileExtension(file.name));
}

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
    clientId: string
): Promise<PreparedComposerTextFileAttachmentResult> {
    if (!isLikelyTextFile(file)) {
        return err({
            message: `"${file.name}" is not a supported UTF-8 text/code file.`,
        });
    }
    if (file.size > MAX_TEXT_FILE_ATTACHMENT_BYTES) {
        return err({
            message: `"${file.name}" exceeds the 256 KB text attachment limit.`,
        });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const decoded = decodeUtf8Text(bytes);
    if (!decoded) {
        return err({
            message: `"${file.name}" is not valid UTF-8 text.`,
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
