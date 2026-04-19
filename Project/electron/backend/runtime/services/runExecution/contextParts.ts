import { Buffer } from 'node:buffer';

import type { ProviderRuntimePart } from '@/app/backend/providers/types';
import type { RunContextMessage, RunContextPart } from '@/app/backend/runtime/services/runExecution/types';

import type { ComposerAttachmentInput, ComposerImageAttachmentInput, ComposerTextFileAttachmentInput } from '@/shared/contracts';

export function createTextPart(text: string): RunContextPart | null {
    const normalized = text.trim();
    if (normalized.length === 0) {
        return null;
    }

    return {
        type: 'text',
        text: normalized,
    };
}

export function createToolCallPart(input: { callId: string; toolName: string; argumentsText: string }): RunContextPart {
    return {
        type: 'tool_call',
        callId: input.callId,
        toolName: input.toolName,
        argumentsText: input.argumentsText,
    };
}

export function createToolResultPart(input: {
    callId: string;
    toolName: string;
    outputText: string;
    isError: boolean;
}): RunContextPart {
    return {
        type: 'tool_result',
        callId: input.callId,
        toolName: input.toolName,
        outputText: input.outputText,
        isError: input.isError,
    };
}

function readOptionalString(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readOptionalNumber(value: unknown): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readReasoningMetadata(payload: Record<string, unknown>) {
    return {
        ...(readOptionalString(payload['detailType']) ? { detailType: readOptionalString(payload['detailType']) } : {}),
        ...(readOptionalString(payload['detailId']) ? { detailId: readOptionalString(payload['detailId']) } : {}),
        ...(readOptionalString(payload['detailFormat'])
            ? { detailFormat: readOptionalString(payload['detailFormat']) }
            : {}),
        ...(readOptionalString(payload['detailSignature'])
            ? { detailSignature: readOptionalString(payload['detailSignature']) }
            : {}),
        ...(readOptionalNumber(payload['detailIndex']) !== undefined
            ? { detailIndex: readOptionalNumber(payload['detailIndex']) }
            : {}),
    };
}

export function createReasoningTextPart(input: {
    type: 'reasoning' | 'reasoning_summary';
    text: string;
    detailType?: string;
    detailId?: string;
    detailFormat?: string;
    detailSignature?: string;
    detailIndex?: number;
}): RunContextPart | null {
    const normalized = input.text.trim();
    if (normalized.length === 0) {
        return null;
    }

    return {
        type: input.type,
        text: normalized,
        ...(input.detailType ? { detailType: input.detailType } : {}),
        ...(input.detailId ? { detailId: input.detailId } : {}),
        ...(input.detailFormat ? { detailFormat: input.detailFormat } : {}),
        ...(input.detailSignature ? { detailSignature: input.detailSignature } : {}),
        ...(input.detailIndex !== undefined ? { detailIndex: input.detailIndex } : {}),
    };
}

export function createReasoningEncryptedPart(input: {
    opaque: unknown;
    detailType?: string;
    detailId?: string;
    detailFormat?: string;
    detailSignature?: string;
    detailIndex?: number;
}): RunContextPart | null {
    if (input.opaque === undefined || input.opaque === null) {
        return null;
    }

    return {
        type: 'reasoning_encrypted',
        opaque: input.opaque,
        ...(input.detailType ? { detailType: input.detailType } : {}),
        ...(input.detailId ? { detailId: input.detailId } : {}),
        ...(input.detailFormat ? { detailFormat: input.detailFormat } : {}),
        ...(input.detailSignature ? { detailSignature: input.detailSignature } : {}),
        ...(input.detailIndex !== undefined ? { detailIndex: input.detailIndex } : {}),
    };
}

export function createReasoningPartFromProviderPart(
    part: ProviderRuntimePart
): Extract<RunContextPart, { type: 'reasoning' | 'reasoning_summary' | 'reasoning_encrypted' }> | null {
    const metadata = readReasoningMetadata(part.payload);
    if (part.partType === 'reasoning' || part.partType === 'reasoning_summary') {
        const text = typeof part.payload['text'] === 'string' ? part.payload['text'] : '';
        const reasoningPart = createReasoningTextPart({
            type: part.partType,
            text,
            ...(metadata.detailType ? { detailType: metadata.detailType } : {}),
            ...(metadata.detailId ? { detailId: metadata.detailId } : {}),
            ...(metadata.detailFormat ? { detailFormat: metadata.detailFormat } : {}),
            ...(metadata.detailSignature ? { detailSignature: metadata.detailSignature } : {}),
            ...(metadata.detailIndex !== undefined ? { detailIndex: metadata.detailIndex } : {}),
        });
        return reasoningPart && reasoningPart.type === part.partType ? reasoningPart : null;
    }

    if (part.partType === 'reasoning_encrypted') {
        const encryptedPart = createReasoningEncryptedPart({
            opaque: part.payload['opaque'],
            ...(metadata.detailType ? { detailType: metadata.detailType } : {}),
            ...(metadata.detailId ? { detailId: metadata.detailId } : {}),
            ...(metadata.detailFormat ? { detailFormat: metadata.detailFormat } : {}),
            ...(metadata.detailSignature ? { detailSignature: metadata.detailSignature } : {}),
            ...(metadata.detailIndex !== undefined ? { detailIndex: metadata.detailIndex } : {}),
        });
        return encryptedPart && encryptedPart.type === 'reasoning_encrypted' ? encryptedPart : null;
    }

    return null;
}

export function createTextMessage(role: RunContextMessage['role'], text: string): RunContextMessage {
    const textPart = createTextPart(text);
    return {
        role,
        parts: textPart ? [textPart] : [],
    };
}

export function appendPromptMessage(input: {
    messages: RunContextMessage[];
    prompt: string;
    attachments?: ComposerAttachmentInput[];
}): RunContextMessage[] {
    const parts: RunContextPart[] = [];
    const promptPart = createTextPart(input.prompt);
    if (promptPart) {
        parts.push(promptPart);
    }

    for (const attachment of input.attachments ?? []) {
        if (attachment.kind !== 'text_file_attachment') {
            parts.push({
                type: 'image',
                dataUrl: `data:${attachment.mimeType};base64,${attachment.bytesBase64}`,
                sha256: attachment.sha256,
                mimeType: attachment.mimeType,
                width: attachment.width,
                height: attachment.height,
            });
            continue;
        }

        parts.push({
            type: 'text',
            text: formatTextFileAttachmentForPrompt(attachment),
        });
    }

    if (parts.length === 0) {
        return input.messages;
    }

    return [
        ...input.messages,
        {
            role: 'user',
            parts,
        },
    ];
}

export function extractTextFromParts(parts: RunContextPart[]): string {
    return parts
        .map((part) => {
            if (part.type === 'text') {
                return part.text;
            }

            if (part.type === 'reasoning' || part.type === 'reasoning_summary') {
                return part.text;
            }

            if (part.type === 'tool_call') {
                return `${part.toolName}\n${part.argumentsText}`;
            }

            if (part.type === 'tool_result') {
                return part.outputText;
            }

            return null;
        })
        .filter((part): part is string => typeof part === 'string')
        .join('\n\n')
        .trim();
}

export function hasImageParts(messages: RunContextMessage[]): boolean {
    return messages.some((message) => message.parts.some((part) => part.type === 'image'));
}

function formatTextFileAttachmentForPrompt(attachment: ComposerTextFileAttachmentInput): string {
    const normalizedText = attachment.text.replace(/\r\n/g, '\n').trimEnd();
    return [
        `Attached text file: ${attachment.fileName}`,
        `MIME type: ${attachment.mimeType}`,
        `Encoding: ${attachment.encoding}`,
        '',
        normalizedText,
    ].join('\n');
}

export function hashablePartContent(part: RunContextPart): string {
    if (part.type === 'text') {
        return part.text;
    }

    if (part.type === 'reasoning' || part.type === 'reasoning_summary') {
        return [
            part.type,
            part.text,
            part.detailType ?? '',
            part.detailId ?? '',
            part.detailFormat ?? '',
            part.detailSignature ?? '',
            String(part.detailIndex ?? ''),
        ].join('|');
    }

    if (part.type === 'reasoning_encrypted') {
        return [
            part.type,
            JSON.stringify(part.opaque),
            part.detailType ?? '',
            part.detailId ?? '',
            part.detailFormat ?? '',
            part.detailSignature ?? '',
            String(part.detailIndex ?? ''),
        ].join('|');
    }

    if (part.type === 'tool_call') {
        return [part.callId, part.toolName, part.argumentsText].join('|');
    }

    if (part.type === 'tool_result') {
        return [part.callId, part.toolName, part.outputText, String(part.isError)].join('|');
    }

    return [part.mediaId ?? '', part.sha256 ?? '', part.mimeType, String(part.width), String(part.height)].join('|');
}

export function decodeAttachmentBytes(attachment: ComposerImageAttachmentInput): Uint8Array {
    return Uint8Array.from(Buffer.from(attachment.bytesBase64, 'base64'));
}

