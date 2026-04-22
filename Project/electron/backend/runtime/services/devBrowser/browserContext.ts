import { createHash } from 'node:crypto';

import type {
    BrowserContextPacket,
    BrowserContextSummaryDesignerApplyIntentStatus,
    BrowserContextSummary,
    DevBrowserTarget,
    DevBrowserEnrichmentMode,
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

export function resolveBrowserContextEnrichmentMode(modes: DevBrowserEnrichmentMode[]): DevBrowserEnrichmentMode {
    if (modes.includes('react_source_enriched')) {
        return 'react_source_enriched';
    }
    if (modes.includes('react_component_enriched')) {
        return 'react_component_enriched';
    }
    return 'dom_only';
}

function resolveDesignerApplyIntentStatus(packet: BrowserContextPacket): BrowserContextSummaryDesignerApplyIntentStatus {
    const includedApplyModes = packet.designerDrafts.map((draft) => draft.applyMode);
    if (includedApplyModes.length === 0) {
        return 'none';
    }
    const hasPreviewOnly = includedApplyModes.includes('preview_only');
    const hasApplyWithAgent = includedApplyModes.includes('apply_with_agent');
    if (hasPreviewOnly && hasApplyWithAgent) {
        return 'mixed';
    }
    return hasApplyWithAgent ? 'apply_with_agent' : 'preview_only';
}

export function buildBrowserContextSummary(packet: BrowserContextPacket): BrowserContextSummary {
    const designerPatchCount = packet.designerDrafts.reduce((total, draft) => {
        const stylePatchCount = Object.keys(draft.stylePatches).length;
        return total + stylePatchCount + (draft.textContentOverride ? 1 : 0);
    }, 0);
    const resolvedEnrichmentMode = resolveBrowserContextEnrichmentMode(packet.selections.map((selection) => selection.enrichmentMode));
    const normalized = {
        targetUrl: packet.target.currentPage?.url ?? buildTargetUrl(packet.target),
        targetLabel: buildTargetLabel(packet.target),
        enrichmentMode: resolvedEnrichmentMode,
        selections: packet.selections.map((selection) => ({
            id: selection.id,
            pageIdentity: selection.pageIdentity,
            selector: selection.selector,
            textExcerpt: selection.textExcerpt ?? '',
            cropAttachmentId: selection.cropAttachmentId ?? null,
            enrichmentMode: selection.enrichmentMode,
            reactEnrichment: selection.reactEnrichment ?? null,
        })),
        comments: packet.comments.map((comment) => ({
            draftId: comment.draftId,
            selectionId: comment.selectionId,
            pageIdentity: comment.pageIdentity,
            commentText: comment.commentText,
            sequence: comment.sequence,
        })),
        cropAttachmentIds: packet.cropAttachmentIds,
        designerDrafts: packet.designerDrafts.map((draft) => ({
            draftId: draft.draftId,
            selectionId: draft.selectionId,
            applyMode: draft.applyMode,
            applyStatus: draft.applyStatus,
            stylePatches: draft.stylePatches,
            textContentOverride: draft.textContentOverride ?? null,
        })),
    };
    const digest = createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 32);

    return {
        targetUrl: normalized.targetUrl,
        targetLabel: normalized.targetLabel,
        selectedElementCount: packet.selections.length,
        commentCount: packet.comments.length,
        captureCount: packet.cropAttachmentIds.length,
        enrichmentMode: resolvedEnrichmentMode,
        designerDraftCount: packet.designerDrafts.length,
        designerPatchCount,
        designerApplyIntentStatus: resolveDesignerApplyIntentStatus(packet),
        digest: `browserctx-${digest}`,
    };
}

export function buildDevBrowserTargetUrl(target: Pick<DevBrowserTarget, 'scheme' | 'host' | 'port' | 'path'>): string {
    return buildTargetUrl(target);
}
