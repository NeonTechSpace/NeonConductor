import { getPersistence } from '@/app/backend/persistence/db';
import { parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    BrowserCommentDraft,
    BrowserCommentPacket,
    BrowserCommentPacketComment,
    BrowserContextSummary,
    BrowserSelectionRecord,
    BrowserSelectionSnapshotInput,
    DevBrowserTarget,
    SessionDevBrowserState,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import {
    buildBrowserContextSummary,
} from '@/app/backend/runtime/services/devBrowser/browserContext';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';
import {
    parseBrowserCommentDraft,
    parseBrowserSelectionRecord,
    parseDevBrowserTarget,
} from '@/app/backend/runtime/contracts/parsers/devBrowser';

import type { EntityId } from '@/shared/contracts';

type BrowserStateRow = {
    session_id: string;
    profile_id: string;
    scheme: string | null;
    host: string | null;
    port: number | null;
    path: string | null;
    source_kind: string | null;
    browser_availability: string;
    validation_json: string | null;
    current_page_json: string | null;
    picker_active: 0 | 1;
    created_at: string;
    updated_at: string;
};

type BrowserSelectionRow = {
    id: string;
    profile_id: string;
    session_id: string;
    page_identity: string;
    page_url: string;
    page_title: string | null;
    selector_json: string;
    ancestry_trail_json: string;
    accessible_label: string | null;
    accessible_role: string | null;
    text_excerpt: string | null;
    bounds_json: string;
    crop_attachment_id: string | null;
    enrichment_mode: string;
    stale: 0 | 1;
    created_at: string;
};

type BrowserCommentDraftRow = {
    id: string;
    profile_id: string;
    session_id: string;
    selection_id: string;
    page_identity: string;
    comment_text: string;
    inclusion_state: string;
    sequence: number;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
};

function mapTarget(row: BrowserStateRow | undefined): DevBrowserTarget | undefined {
    if (!row || row.scheme === null || row.host === null || row.path === null || row.source_kind === null) {
        return undefined;
    }

    return parseDevBrowserTarget(
        {
            scheme: row.scheme,
            host: row.host,
            ...(row.port !== null ? { port: row.port } : {}),
            path: row.path,
            sourceKind: row.source_kind,
            browserAvailability: row.browser_availability,
            validation: row.validation_json ? parseJsonRecord(row.validation_json) : { status: 'blocked', resolvedAddresses: [] },
            ...(row.current_page_json ? { currentPage: parseJsonRecord(row.current_page_json) } : {}),
        },
        'session_dev_browser_state.target'
    );
}

function mapSelection(row: BrowserSelectionRow): BrowserSelectionRecord {
    return parseBrowserSelectionRecord(
        {
            id: row.id,
            pageIdentity: row.page_identity,
            pageUrl: row.page_url,
            ...(row.page_title ? { pageTitle: row.page_title } : {}),
            selector: parseJsonRecord(row.selector_json),
            ancestryTrail: JSON.parse(row.ancestry_trail_json) as unknown,
            ...(row.accessible_label ? { accessibleLabel: row.accessible_label } : {}),
            ...(row.accessible_role ? { accessibleRole: row.accessible_role } : {}),
            ...(row.text_excerpt ? { textExcerpt: row.text_excerpt } : {}),
            bounds: parseJsonRecord(row.bounds_json),
            ...(row.crop_attachment_id ? { cropAttachmentId: row.crop_attachment_id } : {}),
            enrichmentMode: row.enrichment_mode,
            stale: row.stale === 1,
            createdAt: row.created_at,
        },
        'session_dev_browser_selections'
    );
}

function mapCommentDraft(row: BrowserCommentDraftRow): BrowserCommentDraft {
    return parseBrowserCommentDraft(
        {
            id: row.id,
            selectionId: row.selection_id,
            pageIdentity: row.page_identity,
            commentText: row.comment_text,
            inclusionState: row.inclusion_state,
            sequence: row.sequence,
            stale: row.stale === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        },
        'session_dev_browser_comment_drafts'
    );
}

function buildLiveSummary(input: {
    target?: DevBrowserTarget;
    selections: BrowserSelectionRecord[];
    commentDrafts: BrowserCommentDraft[];
}): BrowserContextSummary | undefined {
    if (!input.target) {
        return undefined;
    }

    const includedDrafts = input.commentDrafts
        .filter((draft) => draft.inclusionState === 'included')
        .sort((left, right) => left.sequence - right.sequence);
    if (includedDrafts.length === 0) {
        return undefined;
    }

    const selectionById = new Map(input.selections.map((selection) => [selection.id, selection]));
    const packetSelections: BrowserSelectionRecord[] = [];
    const packetComments: BrowserCommentPacketComment[] = [];
    for (const draft of includedDrafts) {
        const selection = selectionById.get(draft.selectionId);
        if (!selection) {
            return undefined;
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
        target: input.target,
        selections: packetSelections,
        comments: packetComments,
        cropAttachmentIds: packetSelections
            .map((selection) => selection.cropAttachmentId)
            .filter((attachmentId): attachmentId is EntityId<'att'> => attachmentId !== undefined),
        enrichmentMode: packetSelections[0]?.enrichmentMode ?? 'dom_only',
    };
    return buildBrowserContextSummary(packet);
}

export class SessionDevBrowserStore {
    private async getTargetRow(profileId: string, sessionId: EntityId<'sess'>): Promise<BrowserStateRow | undefined> {
        const { db } = getPersistence();
        return (await db
            .selectFrom('session_dev_browser_state')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .executeTakeFirst()) as BrowserStateRow | undefined;
    }

    private async listSelectionRows(profileId: string, sessionId: EntityId<'sess'>): Promise<BrowserSelectionRow[]> {
        const { db } = getPersistence();
        return (await db
            .selectFrom('session_dev_browser_selections')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('created_at', 'asc')
            .execute()) as BrowserSelectionRow[];
    }

    private async listCommentDraftRows(profileId: string, sessionId: EntityId<'sess'>): Promise<BrowserCommentDraftRow[]> {
        const { db } = getPersistence();
        return (await db
            .selectFrom('session_dev_browser_comment_drafts')
            .selectAll()
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .orderBy('sequence', 'asc')
            .execute()) as BrowserCommentDraftRow[];
    }

    private async getSelectionRow(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selectionId: EntityId<'bsel'>;
    }): Promise<BrowserSelectionRow | undefined> {
        const { db } = getPersistence();
        return (await db
            .selectFrom('session_dev_browser_selections')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.selectionId)
            .executeTakeFirst()) as BrowserSelectionRow | undefined;
    }

    private async getCommentDraftRow(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
    }): Promise<BrowserCommentDraftRow | undefined> {
        const { db } = getPersistence();
        return (await db
            .selectFrom('session_dev_browser_comment_drafts')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.draftId)
            .executeTakeFirst()) as BrowserCommentDraftRow | undefined;
    }

    async getState(profileId: string, sessionId: EntityId<'sess'>): Promise<SessionDevBrowserState> {
        const [targetRow, selectionRows, commentRows] = await Promise.all([
            this.getTargetRow(profileId, sessionId),
            this.listSelectionRows(profileId, sessionId),
            this.listCommentDraftRows(profileId, sessionId),
        ]);
        const target = mapTarget(targetRow);
        const selections = selectionRows.map(mapSelection);
        const commentDrafts = commentRows.map(mapCommentDraft);
        const summary = buildLiveSummary(target ? { target, selections, commentDrafts } : { selections, commentDrafts });

        return {
            sessionId,
            ...(target ? { target } : {}),
            pickerActive: targetRow?.picker_active === 1,
            selections,
            commentDrafts,
            ...(summary ? { summary } : {}),
        };
    }

    async saveTarget(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        target?: DevBrowserTarget;
        pickerActive?: boolean;
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        const existing = await this.getTargetRow(input.profileId, input.sessionId);
        const now = nowIso();
        const target = input.target;
        await db
            .insertInto('session_dev_browser_state')
            .values({
                session_id: input.sessionId,
                profile_id: input.profileId,
                scheme: target?.scheme ?? null,
                host: target?.host ?? null,
                port: target?.port ?? null,
                path: target?.path ?? null,
                source_kind: target?.sourceKind ?? null,
                browser_availability: target?.browserAvailability ?? existing?.browser_availability ?? 'unavailable',
                validation_json: target ? JSON.stringify(target.validation) : null,
                current_page_json: target?.currentPage ? JSON.stringify(target.currentPage) : null,
                picker_active: input.pickerActive !== undefined ? (input.pickerActive ? 1 : 0) : (existing?.picker_active ?? 0),
                created_at: existing?.created_at ?? now,
                updated_at: now,
            })
            .onConflict((oc) =>
                oc.column('session_id').doUpdateSet({
                    scheme: target?.scheme ?? null,
                    host: target?.host ?? null,
                    port: target?.port ?? null,
                    path: target?.path ?? null,
                    source_kind: target?.sourceKind ?? null,
                    browser_availability: target?.browserAvailability ?? existing?.browser_availability ?? 'unavailable',
                    validation_json: target ? JSON.stringify(target.validation) : null,
                    current_page_json: target?.currentPage ? JSON.stringify(target.currentPage) : null,
                    picker_active:
                        input.pickerActive !== undefined ? (input.pickerActive ? 1 : 0) : (existing?.picker_active ?? 0),
                    updated_at: now,
                })
            )
            .execute();

        return this.getState(input.profileId, input.sessionId);
    }

    async setPickerActive(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        pickerActive: boolean;
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        const existing = await this.getTargetRow(input.profileId, input.sessionId);
        const now = nowIso();
        await db
            .insertInto('session_dev_browser_state')
            .values({
                session_id: input.sessionId,
                profile_id: input.profileId,
                scheme: existing?.scheme ?? null,
                host: existing?.host ?? null,
                port: existing?.port ?? null,
                path: existing?.path ?? null,
                source_kind: existing?.source_kind ?? null,
                browser_availability: existing?.browser_availability ?? 'unavailable',
                validation_json: existing?.validation_json ?? null,
                current_page_json: existing?.current_page_json ?? null,
                picker_active: input.pickerActive ? 1 : 0,
                created_at: existing?.created_at ?? now,
                updated_at: now,
            })
            .onConflict((oc) =>
                oc.column('session_id').doUpdateSet({
                    picker_active: input.pickerActive ? 1 : 0,
                    updated_at: now,
                })
            )
            .execute();

        return this.getState(input.profileId, input.sessionId);
    }

    async createSelection(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selection: BrowserSelectionSnapshotInput;
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        await db
            .insertInto('session_dev_browser_selections')
            .values({
                id: createEntityId('bsel'),
                profile_id: input.profileId,
                session_id: input.sessionId,
                page_identity: input.selection.pageIdentity,
                page_url: input.selection.pageUrl,
                page_title: input.selection.pageTitle ?? null,
                selector_json: JSON.stringify(input.selection.selector),
                ancestry_trail_json: JSON.stringify(input.selection.ancestryTrail),
                accessible_label: input.selection.accessibleLabel ?? null,
                accessible_role: input.selection.accessibleRole ?? null,
                text_excerpt: input.selection.textExcerpt ?? null,
                bounds_json: JSON.stringify(input.selection.bounds),
                crop_attachment_id: input.selection.cropAttachmentId ?? null,
                enrichment_mode: input.selection.enrichmentMode,
                stale: 0,
                created_at: nowIso(),
            })
            .execute();

        return this.getState(input.profileId, input.sessionId);
    }

    async markSelectionsStaleForCurrentPage(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        activePageIdentity?: string;
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        const query = db
            .updateTable('session_dev_browser_selections')
            .set({ stale: 1 })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId);
        await (input.activePageIdentity
            ? query.where('page_identity', '!=', input.activePageIdentity)
            : query).execute();

        const commentQuery = db
            .updateTable('session_dev_browser_comment_drafts')
            .set({ stale: 1, updated_at: nowIso() })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId);
        await (input.activePageIdentity
            ? commentQuery.where('page_identity', '!=', input.activePageIdentity)
            : commentQuery).execute();

        return this.getState(input.profileId, input.sessionId);
    }

    async createCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selectionId: EntityId<'bsel'>;
        commentText: string;
        inclusionState: BrowserCommentDraft['inclusionState'];
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        const selectionRow = await this.getSelectionRow({
            profileId: input.profileId,
            sessionId: input.sessionId,
            selectionId: input.selectionId,
        });
        if (!selectionRow) {
            throw new DataCorruptionError('Browser comment draft cannot be created because the selection is missing.');
        }

        const last = await db
            .selectFrom('session_dev_browser_comment_drafts')
            .select('sequence')
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .orderBy('sequence', 'desc')
            .executeTakeFirst();
        const now = nowIso();
        await db
            .insertInto('session_dev_browser_comment_drafts')
            .values({
                id: createEntityId('bcmt'),
                profile_id: input.profileId,
                session_id: input.sessionId,
                selection_id: input.selectionId,
                page_identity: selectionRow.page_identity,
                comment_text: input.commentText,
                inclusion_state: input.inclusionState,
                sequence: (last?.sequence ?? -1) + 1,
                stale: selectionRow.stale,
                created_at: now,
                updated_at: now,
            })
            .execute();

        return this.getState(input.profileId, input.sessionId);
    }

    async updateCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
        commentText: string;
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        await db
            .updateTable('session_dev_browser_comment_drafts')
            .set({
                comment_text: input.commentText,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.draftId)
            .execute();

        return this.getState(input.profileId, input.sessionId);
    }

    async setCommentDraftInclusion(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
        inclusionState: BrowserCommentDraft['inclusionState'];
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        await db
            .updateTable('session_dev_browser_comment_drafts')
            .set({
                inclusion_state: input.inclusionState,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.draftId)
            .execute();

        return this.getState(input.profileId, input.sessionId);
    }

    async deleteCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
    }): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        await db
            .deleteFrom('session_dev_browser_comment_drafts')
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.draftId)
            .execute();

        const remaining = await this.listCommentDraftRows(input.profileId, input.sessionId);
        const now = nowIso();
        await Promise.all(
            remaining.map((row, sequence) =>
                db
                    .updateTable('session_dev_browser_comment_drafts')
                    .set({ sequence, updated_at: now })
                    .where('id', '=', row.id)
                    .execute()
            )
        );
        return this.getState(input.profileId, input.sessionId);
    }

    async moveCommentDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        draftId: EntityId<'bcmt'>;
        direction: 'up' | 'down';
    }): Promise<{ state?: SessionDevBrowserState; reason?: 'not_found' | 'boundary' }> {
        const current = await this.getCommentDraftRow(input);
        if (!current) {
            return { reason: 'not_found' };
        }

        const rows = await this.listCommentDraftRows(input.profileId, input.sessionId);
        const index = rows.findIndex((row) => row.id === input.draftId);
        if (index === -1) {
            return { reason: 'not_found' };
        }
        const otherIndex = input.direction === 'up' ? index - 1 : index + 1;
        const other = rows[otherIndex];
        if (!other) {
            return { reason: 'boundary' };
        }

        const { db } = getPersistence();
        const now = nowIso();
        await db.transaction().execute(async (tx) => {
            await tx
                .updateTable('session_dev_browser_comment_drafts')
                .set({ sequence: -1, updated_at: now })
                .where('id', '=', current.id)
                .execute();
            await tx
                .updateTable('session_dev_browser_comment_drafts')
                .set({ sequence: current.sequence, updated_at: now })
                .where('id', '=', other.id)
                .execute();
            await tx
                .updateTable('session_dev_browser_comment_drafts')
                .set({ sequence: other.sequence, updated_at: now })
                .where('id', '=', current.id)
                .execute();
        });

        return { state: await this.getState(input.profileId, input.sessionId) };
    }

    async clearStale(profileId: string, sessionId: EntityId<'sess'>): Promise<SessionDevBrowserState> {
        const { db } = getPersistence();
        await db
            .deleteFrom('session_dev_browser_comment_drafts')
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .where('stale', '=', 1)
            .execute();
        await db
            .deleteFrom('session_dev_browser_selections')
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .where('stale', '=', 1)
            .execute();

        return this.getState(profileId, sessionId);
    }
}

export const sessionDevBrowserStore = new SessionDevBrowserStore();
