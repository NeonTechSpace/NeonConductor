import { conversationAttachmentStore } from '@/app/backend/persistence/stores';
import { createTextPart } from '@/app/backend/runtime/services/runExecution/contextParts';
import type { RunContextMessage, RunContextPart } from '@/app/backend/runtime/services/runExecution/types';

import type { BrowserCommentPacket, EntityId } from '@/shared/contracts';

export function formatBrowserSelectionBlock(packet: BrowserCommentPacket): string {
    const lines: string[] = [];
    lines.push(`Browser target: ${packet.target.currentPage?.url ?? packet.target.validation.normalizedUrl ?? packet.target.host}`);
    lines.push(`Browser enrichment mode: ${packet.enrichmentMode}`);
    lines.push('');
    lines.push('Selected elements:');
    for (const [index, selection] of packet.selections.entries()) {
        lines.push(`${String(index + 1)}. Selector: ${selection.selector.primary}`);
        if (selection.accessibleRole) {
            lines.push(`Role: ${selection.accessibleRole}`);
        }
        if (selection.accessibleLabel) {
            lines.push(`Label: ${selection.accessibleLabel}`);
        }
        if (selection.textExcerpt) {
            lines.push(`Text: ${selection.textExcerpt}`);
        }
        lines.push(
            `Bounds: x=${String(selection.bounds.x)}, y=${String(selection.bounds.y)}, width=${String(selection.bounds.width)}, height=${String(selection.bounds.height)}`
        );
        lines.push('');
    }
    return lines.join('\n').trim();
}

export function formatBrowserCommentBlock(packet: BrowserCommentPacket): string {
    const lines: string[] = [];
    lines.push('Staged browser comments:');
    for (const [index, comment] of packet.comments.entries()) {
        const selection = packet.selections.find((candidate) => candidate.id === comment.selectionId);
        lines.push(`${String(index + 1)}. ${comment.commentText}`);
        lines.push(`Selection: ${selection?.selector.primary ?? comment.selectionId}`);
        lines.push('');
    }
    return lines.join('\n').trim();
}

async function loadBrowserCropImageParts(packet: BrowserCommentPacket): Promise<RunContextPart[]> {
    const parts: RunContextPart[] = [];
    for (const attachmentId of packet.cropAttachmentIds) {
        const payload = await conversationAttachmentStore.getPayload(attachmentId as EntityId<'att'>);
        if (!payload || payload.kind !== 'image_attachment') {
            continue;
        }
        parts.push({
            type: 'image',
            attachmentId,
            sha256: payload.sha256,
            mimeType: payload.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
            width: payload.width ?? 1,
            height: payload.height ?? 1,
        });
    }
    return parts;
}

export async function buildBrowserContextParts(packet: BrowserCommentPacket): Promise<RunContextPart[]> {
    const parts: RunContextPart[] = [];
    const selectionPart = createTextPart(formatBrowserSelectionBlock(packet));
    if (selectionPart) {
        parts.push(selectionPart);
    }
    const commentPart = createTextPart(formatBrowserCommentBlock(packet));
    if (commentPart) {
        parts.push(commentPart);
    }
    parts.push(...(await loadBrowserCropImageParts(packet)));
    return parts;
}

export async function appendBrowserContextMessage(input: {
    messages: RunContextMessage[];
    browserContext?: BrowserCommentPacket;
    mergeIntoLastUserMessage?: boolean;
}): Promise<RunContextMessage[]> {
    if (!input.browserContext) {
        return input.messages;
    }

    const parts = await buildBrowserContextParts(input.browserContext);
    if (parts.length === 0) {
        return input.messages;
    }

    if (
        input.mergeIntoLastUserMessage === true &&
        input.messages.length > 0 &&
        input.messages[input.messages.length - 1]?.role === 'user'
    ) {
        const lastMessage = input.messages[input.messages.length - 1];
        if (!lastMessage) {
            return input.messages;
        }
        return [
            ...input.messages.slice(0, -1),
            {
                role: lastMessage.role,
                parts: [...lastMessage.parts, ...parts],
            },
        ];
    }

    return [
        ...input.messages,
        {
            role: 'user',
            parts,
        },
    ];
}
