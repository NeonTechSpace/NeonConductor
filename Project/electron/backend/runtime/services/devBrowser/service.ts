import { sessionDevBrowserDesignerStore, sessionDevBrowserStore, threadStore } from '@/app/backend/persistence/stores';
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
    SessionAcceptBrowserDesignerVariantInput,
    SessionActivateBrowserDesignerVariantInput,
    SessionCreateBrowserDesignerAnnotationInput,
    SessionCreateBrowserDesignerLiveSessionInput,
    SessionDevBrowserState,
    SessionDiscardBrowserDesignerVariantInput,
    SessionStartBrowserDesignerVariantGenerationInput,
    SessionTuneBrowserDesignerVariantInput,
} from '@/app/backend/runtime/contracts';
import {
    buildBrowserContextSummary,
    resolveBrowserContextEnrichmentMode,
} from '@/app/backend/runtime/services/devBrowser/browserContext';
import {
    normalizeDevBrowserTargetDraft,
    validateLocalDevBrowserTarget,
} from '@/app/backend/runtime/services/devBrowser/localTargetPolicy';
import { runExecutionService } from '@/app/backend/runtime/services/runExecution/service';

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
            message:
                'Stage at least one browser comment or designer preview before sending or queueing browser context.',
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
        enrichmentMode: resolveBrowserContextEnrichmentMode(
            packetSelections.map((selection) => selection.enrichmentMode)
        ),
    };
    const summary: BrowserContextSummary = buildBrowserContextSummary(packet);

    return {
        available: true,
        packet,
        summary,
    };
}

function buildDesignerGenerationPrompt(input: {
    state: SessionDevBrowserState;
    designerSessionId: EntityId<'bdsess'>;
}): string {
    const designerSession = input.state.designerLiveSessions.find((session) => session.id === input.designerSessionId);
    if (!designerSession) {
        throw new Error('Designer generation cannot start because the live designer session is missing.');
    }
    const selection = input.state.selections.find((candidate) => candidate.id === designerSession.selectionId);
    if (!selection) {
        throw new Error('Designer generation cannot start because the selected element snapshot is missing.');
    }
    const annotations = input.state.designerAnnotations
        .filter((annotation) => annotation.designerSessionId === designerSession.id && !annotation.stale)
        .sort((left, right) => left.sequence - right.sequence);
    const action = designerSession.actionChip ? `Action chip: ${designerSession.actionChip}\n` : '';
    const annotationLines =
        annotations.length > 0
            ? annotations
                  .map((annotation, index) => {
                      const text = annotation.text ? ` ${annotation.text}` : '';
                      return `${String(index + 1)}. ${annotation.kind} at x=${String(annotation.geometry.x)}, y=${String(annotation.geometry.y)}.${text}`;
                  })
                  .join('\n')
            : 'None.';

    return [
        'Generate browser designer variants for the selected rendered UI element.',
        '',
        'Return strict JSON only. Do not wrap it in Markdown.',
        `The JSON must have a top-level "variants" array with exactly ${String(designerSession.requestedVariantCount)} items.`,
        'Each variant item must include "name", "summaryMarkdown", "rationaleMarkdown", "stylePatches", and may include "textContentOverride".',
        'Use only safe style patch keys already supported by NeonConductor. Do not propose source edits, file writes, scripts, or package installs.',
        '',
        action.trimEnd(),
        `Intent: ${designerSession.intentText}`,
        `Selector: ${selection.selector.primary}`,
        selection.accessibleRole ? `Role: ${selection.accessibleRole}` : '',
        selection.accessibleLabel ? `Label: ${selection.accessibleLabel}` : '',
        selection.textExcerpt ? `Text: ${selection.textExcerpt}` : '',
        `Bounds: x=${String(selection.bounds.x)}, y=${String(selection.bounds.y)}, width=${String(selection.bounds.width)}, height=${String(selection.bounds.height)}`,
        selection.reactEnrichment
            ? `React chain: ${selection.reactEnrichment.componentChain.map((component) => component.displayName).join(' -> ')}`
            : '',
        '',
        'Annotations:',
        annotationLines,
    ]
        .filter((line) => line.length > 0)
        .join('\n');
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
            blockedReasonMessage:
                'This selection does not have a workspace source anchor yet, so code apply is unavailable.',
        };
    }
    if (sourceAnchor.status === 'outside_current_workspace') {
        return {
            status: 'blocked_outside_current_workspace',
            blockedReasonMessage:
                'This selection resolves outside the current workspace, so apply-through-agent is blocked.',
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
        const validation = validateLocalDevBrowserTarget({
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

    async createDesignerLiveSession(input: SessionCreateBrowserDesignerLiveSessionInput): Promise<SessionDevBrowserState> {
        const requestedVariantCount = input.requestedVariantCount ?? 3;
        if (requestedVariantCount < 1 || requestedVariantCount > 6) {
            throw new Error('Designer variant count must be between 1 and 6.');
        }
        await sessionDevBrowserDesignerStore.createLiveSession({
            profileId: input.profileId,
            sessionId: input.sessionId,
            selectionId: input.selectionId,
            ...(input.actionChip ? { actionChip: input.actionChip } : {}),
            intentText: input.intentText,
            requestedVariantCount,
        });
        return sessionDevBrowserStore.getState(input.profileId, input.sessionId);
    }

    async createDesignerAnnotation(input: SessionCreateBrowserDesignerAnnotationInput): Promise<SessionDevBrowserState> {
        await sessionDevBrowserDesignerStore.createAnnotation(input);
        return sessionDevBrowserStore.getState(input.profileId, input.sessionId);
    }

    async startDesignerVariantGeneration(
        input: SessionStartBrowserDesignerVariantGenerationInput
    ): Promise<Awaited<ReturnType<typeof runExecutionService.startRun>>> {
        const state = await sessionDevBrowserStore.getState(input.profileId, input.sessionId);
        const designerSession = state.designerLiveSessions.find((session) => session.id === input.designerSessionId);
        if (!designerSession) {
            throw new Error('Designer generation cannot start because the live designer session is missing.');
        }
        if (designerSession.stale) {
            throw new Error('Designer generation cannot start from stale browser context.');
        }
        if (designerSession.generationStatus === 'generating') {
            throw new Error('Designer generation is already running for this live session.');
        }
        if (!state.target || state.target.validation.status !== 'allowed') {
            throw new Error('Designer generation requires an allowed local dev-browser target.');
        }
        const selection = state.selections.find((candidate) => candidate.id === designerSession.selectionId);
        if (!selection || selection.stale) {
            throw new Error('Designer generation requires a current selected element snapshot.');
        }

        const prompt = buildDesignerGenerationPrompt({
            state,
            designerSessionId: input.designerSessionId,
        });
        const browserContext: BrowserContextPacket = {
            target: state.target,
            selections: [selection],
            comments: [],
            cropAttachmentIds: selection.cropAttachmentId ? [selection.cropAttachmentId] : [],
            designerDrafts: [],
            enrichmentMode: selection.enrichmentMode,
        };

        const started = await runExecutionService.startRun({
            profileId: input.profileId,
            sessionId: input.sessionId,
            prompt,
            browserContext,
            topLevelTab: input.topLevelTab,
            modeKey: input.modeKey,
            ...(input.workspaceFingerprint ? { workspaceFingerprint: input.workspaceFingerprint } : {}),
            ...(input.sandboxId ? { sandboxId: input.sandboxId } : {}),
            runtimeOptions: input.runtimeOptions,
            ...(input.providerId ? { providerId: input.providerId } : {}),
            ...(input.modelId ? { modelId: input.modelId } : {}),
        });
        if (started.accepted) {
            await sessionDevBrowserDesignerStore.markGenerationStarted({
                profileId: input.profileId,
                sessionId: input.sessionId,
                designerSessionId: input.designerSessionId,
                runId: started.runId,
            });
        }
        return started;
    }

    async activateDesignerVariant(input: SessionActivateBrowserDesignerVariantInput): Promise<SessionDevBrowserState> {
        await sessionDevBrowserDesignerStore.activateVariant(input);
        return sessionDevBrowserStore.getState(input.profileId, input.sessionId);
    }

    async tuneDesignerVariant(input: SessionTuneBrowserDesignerVariantInput): Promise<SessionDevBrowserState> {
        await sessionDevBrowserDesignerStore.tuneVariant(input);
        return sessionDevBrowserStore.getState(input.profileId, input.sessionId);
    }

    async acceptDesignerVariant(input: SessionAcceptBrowserDesignerVariantInput): Promise<SessionDevBrowserState> {
        const variant = await sessionDevBrowserDesignerStore.getVariant(input);
        if (!variant || variant.status === 'discarded') {
            throw new Error('Designer variant cannot be accepted because it is missing or discarded.');
        }
        await this.upsertDesignerDraft({
            profileId: input.profileId,
            sessionId: input.sessionId,
            selectionId: variant.selectionId,
            inclusionState: input.inclusionState ?? 'included',
            applyMode: input.applyMode,
            stylePatches: variant.stylePatches,
            ...(variant.textContentOverride ? { textContentOverride: variant.textContentOverride } : {}),
        });
        await sessionDevBrowserDesignerStore.markAccepted(input);
        return sessionDevBrowserStore.getState(input.profileId, input.sessionId);
    }

    async discardDesignerVariant(input: SessionDiscardBrowserDesignerVariantInput): Promise<SessionDevBrowserState> {
        await sessionDevBrowserDesignerStore.discardVariant(input);
        return sessionDevBrowserStore.getState(input.profileId, input.sessionId);
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
        return buildPacketFromState({
            state,
            ...(input.commentDraftIds ? { commentDraftIds: input.commentDraftIds } : {}),
        });
    }
}

export const sessionDevBrowserService = new SessionDevBrowserService();
