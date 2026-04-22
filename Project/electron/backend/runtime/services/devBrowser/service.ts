import { sessionDevBrowserStore, threadStore } from '@/app/backend/persistence/stores';
import type {
    BrowserContextPacket,
    BrowserContextPacketComment,
    BrowserContextPacketDesignerDraft,
    BrowserContextSummary,
    BrowserDesignerApplyStatus,
    BrowserSelectionRecord,
    BrowserSelectionSnapshotInput,
    DevBrowserTarget,
    DevBrowserTargetDraft,
    SessionBuildBrowserContextPacketResult,
    SessionDevBrowserState,
} from '@/app/backend/runtime/contracts';
import { buildBrowserContextSummary, resolveBrowserContextEnrichmentMode } from '@/app/backend/runtime/services/devBrowser/browserContext';
import {
    normalizeDevBrowserTargetDraft,
    validateLocalDevBrowserTarget,
} from '@/app/backend/runtime/services/devBrowser/localTargetPolicy';

import type { EntityId } from '@/shared/contracts';

function buildInitialTargetState(input: {
    targetDraft: DevBrowserTargetDraft;
    validation: Awaited<ReturnType<typeof validateLocalDevBrowserTarget>>;
}): DevBrowserTarget {
    return {
        ...input.targetDraft,
        validation: input.validation,
        browserAvailability: 'unavailable',
    };
}

function buildPacketFromState(input: {
    state: SessionDevBrowserState;
    commentDraftIds?: EntityId<'bcmt'>[];
}): SessionBuildBrowserContextPacketResult {
    if (!input.state.target) {
        return {
            available: false,
            reason: 'missing_target',
            message: 'The browser context packet cannot be built until a dev browser target is set.',
        };
    }

    const commentDrafts = input.state.commentDrafts
        .filter((draft) =>
            input.commentDraftIds && input.commentDraftIds.length > 0
                ? input.commentDraftIds.includes(draft.id)
                : draft.inclusionState === 'included'
        )
        .sort((left, right) => left.sequence - right.sequence);
    const designerDrafts = input.state.designerDrafts.filter((draft) => draft.inclusionState === 'included');

    if (commentDrafts.length === 0 && designerDrafts.length === 0) {
        return {
            available: false,
            reason: 'missing_context',
            message: 'Stage at least one browser comment or designer preview before sending or queueing browser context.',
        };
    }

    const selectionById = new Map(input.state.selections.map((selection) => [selection.id, selection]));
    const packetSelections: BrowserSelectionRecord[] = [];
    const packetComments: BrowserContextPacketComment[] = [];
    const packetDesignerDrafts: BrowserContextPacketDesignerDraft[] = [];

    const pushSelection = (selectionId: EntityId<'bsel'>): BrowserSelectionRecord | undefined => {
        const selection = selectionById.get(selectionId);
        if (!selection) {
            return undefined;
        }
        if (!packetSelections.some((candidate) => candidate.id === selection.id)) {
            packetSelections.push(selection);
        }
        return selection;
    };

    for (const draft of commentDrafts) {
        const selection = pushSelection(draft.selectionId);
        if (!selection) {
            return {
                available: false,
                reason: 'missing_selection',
                message: 'One or more staged browser comments lost their element selection snapshot.',
            };
        }
        packetComments.push({
            draftId: draft.id,
            selectionId: draft.selectionId,
            pageIdentity: draft.pageIdentity,
            commentText: draft.commentText,
            sequence: draft.sequence,
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
        });
    }

    for (const draft of designerDrafts) {
        const selection = pushSelection(draft.selectionId);
        if (!selection) {
            return {
                available: false,
                reason: 'missing_selection',
                message: 'One or more designer previews lost their element selection snapshot.',
            };
        }
        packetDesignerDrafts.push({
            draftId: draft.id,
            selectionId: draft.selectionId,
            pageIdentity: draft.pageIdentity,
            applyMode: draft.applyMode,
            applyStatus: draft.applyStatus,
            ...(draft.blockedReasonMessage ? { blockedReasonMessage: draft.blockedReasonMessage } : {}),
            stylePatches: draft.stylePatches,
            ...(draft.textContentOverride ? { textContentOverride: draft.textContentOverride } : {}),
            createdAt: draft.createdAt,
            updatedAt: draft.updatedAt,
        });
    }

    const packet: BrowserContextPacket = {
        target: input.state.target,
        selections: packetSelections,
        comments: packetComments,
        cropAttachmentIds: packetSelections
            .map((selection) => selection.cropAttachmentId)
            .filter((attachmentId): attachmentId is EntityId<'att'> => attachmentId !== undefined),
        designerDrafts: packetDesignerDrafts,
        enrichmentMode: resolveBrowserContextEnrichmentMode(packetSelections.map((selection) => selection.enrichmentMode)),
    };
    const summary: BrowserContextSummary = buildBrowserContextSummary(packet);

    return {
        available: true,
        packet,
        summary,
    };
}

async function resolveDesignerApplyStatus(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    selection: BrowserSelectionRecord;
}): Promise<{ status: BrowserDesignerApplyStatus; blockedReasonMessage?: string }> {
    const sessionThread = await threadStore.getBySessionId(input.profileId, input.sessionId);
    if (!sessionThread?.workspaceFingerprint) {
        return {
            status: 'blocked_no_workspace',
            blockedReasonMessage: 'Agent-applied designer changes are only available for workspace-backed sessions.',
        };
    }

    const sourceAnchor = input.selection.reactEnrichment?.sourceAnchor;
    if (!sourceAnchor || sourceAnchor.status === 'unresolved') {
        return {
            status: 'blocked_missing_source_anchor',
            blockedReasonMessage: 'This selection does not have a workspace source anchor yet, so code apply is unavailable.',
        };
    }
    if (sourceAnchor.status === 'outside_current_workspace') {
        return {
            status: 'blocked_outside_current_workspace',
            blockedReasonMessage: 'This selection resolves outside the current workspace, so apply-through-agent is blocked.',
        };
    }
    return { status: 'eligible' };
}

export class SessionDevBrowserService {
    async getState(profileId: string, sessionId: EntityId<'sess'>): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.getState(profileId, sessionId);
    }

    async setTarget(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        target: DevBrowserTargetDraft;
    }): Promise<SessionDevBrowserState> {
        const normalizedTarget = normalizeDevBrowserTargetDraft(input.target);
        const validation = await validateLocalDevBrowserTarget({
            target: normalizedTarget,
            source: 'input',
        });
        return sessionDevBrowserStore.saveTarget({
            profileId: input.profileId,
            sessionId: input.sessionId,
            target: buildInitialTargetState({
                targetDraft: normalizedTarget,
                validation,
            }),
        });
    }

    async syncObservedTarget(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        target: DevBrowserTarget;
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.saveTarget(input);
    }

    async setPickerActive(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        active: boolean;
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.setPickerActive({
            profileId: input.profileId,
            sessionId: input.sessionId,
            pickerActive: input.active,
        });
    }

    async persistSelection(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selection: BrowserSelectionSnapshotInput;
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.createSelection(input);
    }

    async markStaleForCurrentPage(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        activePageIdentity?: string;
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.markSelectionsStaleForCurrentPage(input);
    }

    async createCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selectionId: EntityId<'bsel'>;
        commentText: string;
        inclusionState?: 'included' | 'excluded';
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.createCommentDraft({
            ...input,
            inclusionState: input.inclusionState ?? 'included',
        });
    }

    async updateCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
        commentText: string;
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.updateCommentDraft(input);
    }

    async deleteCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.deleteCommentDraft(input);
    }

    async moveCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
        direction: 'up' | 'down';
    }): Promise<SessionDevBrowserState> {
        const moved = await sessionDevBrowserStore.moveCommentDraft(input);
        if (moved.state) {
            return moved.state;
        }
        return sessionDevBrowserStore.getState(input.profileId, input.sessionId);
    }

    async setCommentDraftInclusion(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
        inclusionState: 'included' | 'excluded';
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.setCommentDraftInclusion(input);
    }

    async upsertDesignerDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selectionId: EntityId<'bsel'>;
        inclusionState?: 'included' | 'excluded';
        applyMode: 'preview_only' | 'apply_with_agent';
        stylePatches: Record<string, string>;
        textContentOverride?: string;
    }): Promise<SessionDevBrowserState> {
        const state = await sessionDevBrowserStore.getState(input.profileId, input.sessionId);
        const selection = state.selections.find((candidate) => candidate.id === input.selectionId);
        if (!selection) {
            throw new Error('Designer draft cannot be saved because the selection no longer exists.');
        }

        const eligibility = await resolveDesignerApplyStatus({
            profileId: input.profileId,
            sessionId: input.sessionId,
            selection,
        });
        const applyMode =
            input.applyMode === 'apply_with_agent' && eligibility.status === 'eligible'
                ? 'apply_with_agent'
                : 'preview_only';

        return sessionDevBrowserStore.upsertDesignerDraft({
            profileId: input.profileId,
            sessionId: input.sessionId,
            selectionId: input.selectionId,
            inclusionState: input.inclusionState ?? 'included',
            applyMode,
            applyStatus: eligibility.status,
            ...(eligibility.blockedReasonMessage ? { blockedReasonMessage: eligibility.blockedReasonMessage } : {}),
            stylePatches: input.stylePatches,
            ...(input.textContentOverride ? { textContentOverride: input.textContentOverride } : {}),
        });
    }

    async deleteDesignerDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bdsn'>;
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.deleteDesignerDraft(input);
    }

    async setDesignerDraftInclusion(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bdsn'>;
        inclusionState: 'included' | 'excluded';
    }): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.setDesignerDraftInclusion(input);
    }

    async clearStale(profileId: string, sessionId: EntityId<'sess'>): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.clearStale(profileId, sessionId);
    }

    async buildPacket(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        commentDraftIds?: EntityId<'bcmt'>[];
    }): Promise<SessionBuildBrowserContextPacketResult> {
        const state = await sessionDevBrowserStore.getState(input.profileId, input.sessionId);
        return buildPacketFromState({ state, ...(input.commentDraftIds ? { commentDraftIds: input.commentDraftIds } : {}) });
    }
}

export const sessionDevBrowserService = new SessionDevBrowserService();
