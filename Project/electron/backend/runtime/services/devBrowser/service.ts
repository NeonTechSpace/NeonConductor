import { sessionDevBrowserStore } from '@/app/backend/persistence/stores';
import type {
    BrowserCommentPacket,
    BrowserCommentPacketComment,
    BrowserContextSummary,
    BrowserSelectionRecord,
    BrowserSelectionSnapshotInput,
    DevBrowserTarget,
    DevBrowserTargetDraft,
    SessionBuildBrowserCommentPacketResult,
    SessionDevBrowserState,
} from '@/app/backend/runtime/contracts';
import { buildBrowserContextSummary } from '@/app/backend/runtime/services/devBrowser/browserContext';
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
    draftIds?: EntityId<'bcmt'>[];
}): SessionBuildBrowserCommentPacketResult {
    if (!input.state.target) {
        return {
            available: false,
            reason: 'missing_target',
            message: 'The browser packet cannot be built until a dev browser target is set.',
        };
    }

    const commentDrafts = input.state.commentDrafts
        .filter((draft) =>
            input.draftIds && input.draftIds.length > 0
                ? input.draftIds.includes(draft.id)
                : draft.inclusionState === 'included'
        )
        .sort((left, right) => left.sequence - right.sequence);
    if (commentDrafts.length === 0) {
        return {
            available: false,
            reason: 'missing_comments',
            message: 'Select at least one staged browser comment before sending or queueing a browser packet.',
        };
    }

    const selectionById = new Map(input.state.selections.map((selection) => [selection.id, selection]));
    const packetSelections: BrowserSelectionRecord[] = [];
    const packetComments: BrowserCommentPacketComment[] = [];
    for (const draft of commentDrafts) {
        const selection = selectionById.get(draft.selectionId);
        if (!selection) {
            return {
                available: false,
                reason: 'missing_selection',
                message: 'One or more staged browser comments lost their element selection snapshot.',
            };
        }
        if (!packetSelections.some((candidate) => candidate.id === selection.id)) {
            packetSelections.push(selection);
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

    const packet: BrowserCommentPacket = {
        target: input.state.target,
        selections: packetSelections,
        comments: packetComments,
        cropAttachmentIds: packetSelections
            .map((selection) => selection.cropAttachmentId)
            .filter((attachmentId): attachmentId is EntityId<'att'> => attachmentId !== undefined),
        enrichmentMode: packetSelections[0]?.enrichmentMode ?? 'dom_only',
    };
    const summary: BrowserContextSummary = buildBrowserContextSummary(packet);

    return {
        available: true,
        packet,
        summary,
    };
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

    async clearStale(profileId: string, sessionId: EntityId<'sess'>): Promise<SessionDevBrowserState> {
        return sessionDevBrowserStore.clearStale(profileId, sessionId);
    }

    async buildPacket(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftIds?: EntityId<'bcmt'>[];
    }): Promise<SessionBuildBrowserCommentPacketResult> {
        const state = await sessionDevBrowserStore.getState(input.profileId, input.sessionId);
        return buildPacketFromState({ state, ...(input.draftIds ? { draftIds: input.draftIds } : {}) });
    }
}

export const sessionDevBrowserService = new SessionDevBrowserService();
