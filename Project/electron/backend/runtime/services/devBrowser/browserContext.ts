import { createHash } from 'node:crypto';

import type {
    BrowserCommentPacket,
    BrowserContextSummary,
    DevBrowserTarget,
} from '@/app/backend/runtime/contracts/types/devBrowser';

function buildTargetUrl(target: Pick<DevBrowserTarget, 'scheme' | 'host' | 'port' | 'path'>): string {
    const defaultPort = target.scheme === 'https' ? 443 : 80;
    const portSegment = target.port !== undefined && target.port !== defaultPort ? `:${String(target.port)}` : '';
    return `${target.scheme}://${target.host}${portSegment}${target.path}`;
}

function buildTargetLabel(target: DevBrowserTarget): string {
    if (target.currentPage?.title && target.currentPage.title.trim().length > 0) {
        return target.currentPage.title.trim();
    }
    return target.host;
}

export function buildBrowserContextSummary(packet: BrowserCommentPacket): BrowserContextSummary {
    const normalized = {
        targetUrl: packet.target.currentPage?.url ?? buildTargetUrl(packet.target),
        targetLabel: buildTargetLabel(packet.target),
        enrichmentMode: packet.enrichmentMode,
        selections: packet.selections.map((selection) => ({
            id: selection.id,
            pageIdentity: selection.pageIdentity,
            selector: selection.selector,
            textExcerpt: selection.textExcerpt ?? '',
            cropAttachmentId: selection.cropAttachmentId ?? null,
        })),
        comments: packet.comments.map((comment) => ({
            draftId: comment.draftId,
            selectionId: comment.selectionId,
            pageIdentity: comment.pageIdentity,
            commentText: comment.commentText,
            sequence: comment.sequence,
        })),
        cropAttachmentIds: packet.cropAttachmentIds,
    };
    const digest = createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 32);

    return {
        targetUrl: normalized.targetUrl,
        targetLabel: normalized.targetLabel,
        selectedElementCount: packet.selections.length,
        commentCount: packet.comments.length,
        captureCount: packet.cropAttachmentIds.length,
        enrichmentMode: packet.enrichmentMode,
        digest: `browserctx-${digest}`,
    };
}

export function buildDevBrowserTargetUrl(target: Pick<DevBrowserTarget, 'scheme' | 'host' | 'port' | 'path'>): string {
    return buildTargetUrl(target);
}
