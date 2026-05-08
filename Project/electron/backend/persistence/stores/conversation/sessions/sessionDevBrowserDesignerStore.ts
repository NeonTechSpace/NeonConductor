import { getPersistence } from '@/app/backend/persistence/db';
import { parseJsonRecord } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import {
    parseBrowserDesignerAnnotation,
    parseBrowserDesignerLiveSession,
    parseBrowserDesignerVariant,
} from '@/app/backend/runtime/contracts/parsers/devBrowser';
import type {
    BrowserDesignerAnnotation,
    BrowserDesignerAnnotationGeometry,
    BrowserDesignerLiveSession,
    BrowserDesignerStylePatchSet,
    BrowserDesignerVariant,
} from '@/app/backend/runtime/contracts/types/devBrowser';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

import type { EntityId } from '@/shared/contracts';

type DesignerSessionRow = {
    id: string;
    profile_id: string;
    session_id: string;
    selection_id: string;
    page_identity: string;
    action_chip: string | null;
    intent_text: string;
    requested_variant_count: number;
    generation_status: string;
    active_variant_id: string | null;
    accepted_variant_id: string | null;
    generation_run_id: string | null;
    error_message: string | null;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
};

type DesignerAnnotationRow = {
    id: string;
    profile_id: string;
    session_id: string;
    designer_session_id: string;
    selection_id: string;
    page_identity: string;
    kind: string;
    text: string | null;
    geometry_json: string;
    crop_attachment_id: string | null;
    sequence: number;
    stale: 0 | 1;
    created_at: string;
    updated_at: string;
};

type DesignerVariantRow = {
    id: string;
    profile_id: string;
    session_id: string;
    designer_session_id: string;
    selection_id: string;
    page_identity: string;
    name: string;
    summary_markdown: string;
    rationale_markdown: string;
    style_patches_json: string;
    text_content_override: string | null;
    status: string;
    created_at: string;
    updated_at: string;
};

type SelectionRow = {
    id: string;
    profile_id: string;
    session_id: string;
    page_identity: string;
    stale: 0 | 1;
};

function mapDesignerSession(row: DesignerSessionRow): BrowserDesignerLiveSession {
    return parseBrowserDesignerLiveSession(
        {
            id: row.id,
            selectionId: row.selection_id,
            pageIdentity: row.page_identity,
            ...(row.action_chip ? { actionChip: row.action_chip } : {}),
            intentText: row.intent_text,
            requestedVariantCount: row.requested_variant_count,
            generationStatus: row.generation_status,
            ...(row.active_variant_id ? { activeVariantId: row.active_variant_id } : {}),
            ...(row.accepted_variant_id ? { acceptedVariantId: row.accepted_variant_id } : {}),
            ...(row.generation_run_id ? { generationRunId: row.generation_run_id } : {}),
            ...(row.error_message ? { errorMessage: row.error_message } : {}),
            stale: row.stale === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        },
        'session_dev_browser_designer_sessions'
    );
}

function mapDesignerAnnotation(row: DesignerAnnotationRow): BrowserDesignerAnnotation {
    return parseBrowserDesignerAnnotation(
        {
            id: row.id,
            designerSessionId: row.designer_session_id,
            selectionId: row.selection_id,
            pageIdentity: row.page_identity,
            kind: row.kind,
            ...(row.text ? { text: row.text } : {}),
            geometry: parseJsonRecord(row.geometry_json),
            ...(row.crop_attachment_id ? { cropAttachmentId: row.crop_attachment_id } : {}),
            sequence: row.sequence,
            stale: row.stale === 1,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        },
        'session_dev_browser_designer_annotations'
    );
}

function mapDesignerVariant(row: DesignerVariantRow): BrowserDesignerVariant {
    return parseBrowserDesignerVariant(
        {
            id: row.id,
            designerSessionId: row.designer_session_id,
            selectionId: row.selection_id,
            pageIdentity: row.page_identity,
            name: row.name,
            summaryMarkdown: row.summary_markdown,
            rationaleMarkdown: row.rationale_markdown,
            stylePatches: parseJsonRecord(row.style_patches_json),
            ...(row.text_content_override ? { textContentOverride: row.text_content_override } : {}),
            status: row.status,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        },
        'session_dev_browser_designer_variants'
    );
}

export interface SessionDevBrowserDesignerState {
    designerLiveSessions: BrowserDesignerLiveSession[];
    designerAnnotations: BrowserDesignerAnnotation[];
    designerVariants: BrowserDesignerVariant[];
}

export class SessionDevBrowserDesignerStore {
    private async getSelectionRow(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selectionId: EntityId<'bsel'>;
    }): Promise<SelectionRow | undefined> {
        const { db } = getPersistence();
        return (await db
            .selectFrom('session_dev_browser_selections')
            .select(['id', 'profile_id', 'session_id', 'page_identity', 'stale'])
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.selectionId)
            .executeTakeFirst()) as SelectionRow | undefined;
    }

    async listState(profileId: string, sessionId: EntityId<'sess'>): Promise<SessionDevBrowserDesignerState> {
        const { db } = getPersistence();
        const [sessionRows, annotationRows, variantRows] = await Promise.all([
            db
                .selectFrom('session_dev_browser_designer_sessions')
                .selectAll()
                .where('profile_id', '=', profileId)
                .where('session_id', '=', sessionId)
                .orderBy('updated_at', 'desc')
                .execute() as Promise<DesignerSessionRow[]>,
            db
                .selectFrom('session_dev_browser_designer_annotations')
                .selectAll()
                .where('profile_id', '=', profileId)
                .where('session_id', '=', sessionId)
                .orderBy('sequence', 'asc')
                .execute() as Promise<DesignerAnnotationRow[]>,
            db
                .selectFrom('session_dev_browser_designer_variants')
                .selectAll()
                .where('profile_id', '=', profileId)
                .where('session_id', '=', sessionId)
                .orderBy('created_at', 'asc')
                .execute() as Promise<DesignerVariantRow[]>,
        ]);
        return {
            designerLiveSessions: sessionRows.map(mapDesignerSession),
            designerAnnotations: annotationRows.map(mapDesignerAnnotation),
            designerVariants: variantRows.map(mapDesignerVariant),
        };
    }

    async getSession(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
    }): Promise<BrowserDesignerLiveSession | undefined> {
        const { db } = getPersistence();
        const row = (await db
            .selectFrom('session_dev_browser_designer_sessions')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.designerSessionId)
            .executeTakeFirst()) as DesignerSessionRow | undefined;
        return row ? mapDesignerSession(row) : undefined;
    }

    async getSessionByGenerationRunId(runId: EntityId<'run'>): Promise<BrowserDesignerLiveSession | undefined> {
        const { db } = getPersistence();
        const row = (await db
            .selectFrom('session_dev_browser_designer_sessions')
            .selectAll()
            .where('generation_run_id', '=', runId)
            .executeTakeFirst()) as DesignerSessionRow | undefined;
        return row ? mapDesignerSession(row) : undefined;
    }

    async getVariant(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        variantId: EntityId<'bdvar'>;
    }): Promise<BrowserDesignerVariant | undefined> {
        const { db } = getPersistence();
        const row = (await db
            .selectFrom('session_dev_browser_designer_variants')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('designer_session_id', '=', input.designerSessionId)
            .where('id', '=', input.variantId)
            .executeTakeFirst()) as DesignerVariantRow | undefined;
        return row ? mapDesignerVariant(row) : undefined;
    }

    async createLiveSession(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        selectionId: EntityId<'bsel'>;
        actionChip?: BrowserDesignerLiveSession['actionChip'];
        intentText: string;
        requestedVariantCount: number;
    }): Promise<BrowserDesignerLiveSession> {
        const selection = await this.getSelectionRow(input);
        if (!selection) {
            throw new DataCorruptionError('Browser designer session cannot be created because the selection is missing.');
        }
        const { db } = getPersistence();
        const now = nowIso();
        const id = createEntityId('bdsess');
        await db
            .insertInto('session_dev_browser_designer_sessions')
            .values({
                id,
                profile_id: input.profileId,
                session_id: input.sessionId,
                selection_id: input.selectionId,
                page_identity: selection.page_identity,
                action_chip: input.actionChip ?? null,
                intent_text: input.intentText,
                requested_variant_count: input.requestedVariantCount,
                generation_status: 'idle',
                active_variant_id: null,
                accepted_variant_id: null,
                generation_run_id: null,
                error_message: null,
                stale: selection.stale,
                created_at: now,
                updated_at: now,
            })
            .execute();
        const created = await this.getSession({ ...input, designerSessionId: id });
        if (!created) {
            throw new DataCorruptionError('Browser designer session disappeared after creation.');
        }
        return created;
    }

    async createAnnotation(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        kind: BrowserDesignerAnnotation['kind'];
        geometry: BrowserDesignerAnnotationGeometry;
        text?: string;
        cropAttachmentId?: EntityId<'att'>;
    }): Promise<BrowserDesignerAnnotation> {
        const designerSession = await this.getSession(input);
        if (!designerSession) {
            throw new DataCorruptionError('Browser designer annotation cannot be created because the session is missing.');
        }
        const { db } = getPersistence();
        const last = await db
            .selectFrom('session_dev_browser_designer_annotations')
            .select('sequence')
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('designer_session_id', '=', input.designerSessionId)
            .orderBy('sequence', 'desc')
            .executeTakeFirst();
        const now = nowIso();
        const id = createEntityId('bdann');
        await db
            .insertInto('session_dev_browser_designer_annotations')
            .values({
                id,
                profile_id: input.profileId,
                session_id: input.sessionId,
                designer_session_id: input.designerSessionId,
                selection_id: designerSession.selectionId,
                page_identity: designerSession.pageIdentity,
                kind: input.kind,
                text: input.text ?? null,
                geometry_json: JSON.stringify(input.geometry),
                crop_attachment_id: input.cropAttachmentId ?? null,
                sequence: (last?.sequence ?? -1) + 1,
                stale: designerSession.stale ? 1 : 0,
                created_at: now,
                updated_at: now,
            })
            .execute();
        const state = await this.listState(input.profileId, input.sessionId);
        const created = state.designerAnnotations.find((annotation) => annotation.id === id);
        if (!created) {
            throw new DataCorruptionError('Browser designer annotation disappeared after creation.');
        }
        return created;
    }

    async markGenerationStarted(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        runId: EntityId<'run'>;
    }): Promise<void> {
        const { db } = getPersistence();
        await db
            .updateTable('session_dev_browser_designer_sessions')
            .set({
                generation_status: 'generating',
                generation_run_id: input.runId,
                error_message: null,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.designerSessionId)
            .execute();
    }

    async recordGenerationFailure(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        status?: 'failed' | 'aborted';
        errorMessage: string;
    }): Promise<void> {
        const { db } = getPersistence();
        await db
            .updateTable('session_dev_browser_designer_sessions')
            .set({
                generation_status: input.status ?? 'failed',
                error_message: input.errorMessage,
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.designerSessionId)
            .execute();
    }

    async replaceGeneratedVariants(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        variants: Array<{
            name: string;
            summaryMarkdown: string;
            rationaleMarkdown: string;
            stylePatches: BrowserDesignerStylePatchSet;
            textContentOverride?: string;
        }>;
    }): Promise<void> {
        if (input.variants.length === 0) {
            throw new DataCorruptionError('Browser designer generation returned no variants.');
        }
        const designerSession = await this.getSession(input);
        if (!designerSession) {
            throw new DataCorruptionError('Browser designer variants cannot be saved because the session is missing.');
        }
        const { db } = getPersistence();
        const now = nowIso();
        await db.transaction().execute(async (transaction) => {
            await transaction
                .deleteFrom('session_dev_browser_designer_variants')
                .where('profile_id', '=', input.profileId)
                .where('session_id', '=', input.sessionId)
                .where('designer_session_id', '=', input.designerSessionId)
                .where('status', '!=', 'accepted')
                .execute();
            const firstVariantId = createEntityId('bdvar');
            for (const [index, variant] of input.variants.entries()) {
                await transaction
                    .insertInto('session_dev_browser_designer_variants')
                    .values({
                        id: index === 0 ? firstVariantId : createEntityId('bdvar'),
                        profile_id: input.profileId,
                        session_id: input.sessionId,
                        designer_session_id: input.designerSessionId,
                        selection_id: designerSession.selectionId,
                        page_identity: designerSession.pageIdentity,
                        name: variant.name,
                        summary_markdown: variant.summaryMarkdown,
                        rationale_markdown: variant.rationaleMarkdown,
                        style_patches_json: JSON.stringify(variant.stylePatches),
                        text_content_override: variant.textContentOverride ?? null,
                        status: index === 0 ? 'active' : 'generated',
                        created_at: now,
                        updated_at: now,
                    })
                    .execute();
            }
            await transaction
                .updateTable('session_dev_browser_designer_sessions')
                .set({
                    generation_status: 'generated',
                    active_variant_id: firstVariantId,
                    error_message: null,
                    updated_at: now,
                })
                .where('id', '=', input.designerSessionId)
                .execute();
        });
    }

    async activateVariant(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        variantId: EntityId<'bdvar'>;
    }): Promise<void> {
        const variant = await this.getVariant(input);
        if (!variant || variant.status === 'discarded') {
            throw new DataCorruptionError('Browser designer variant cannot be activated because it is missing or discarded.');
        }
        const { db } = getPersistence();
        const now = nowIso();
        await db.transaction().execute(async (transaction) => {
            await transaction
                .updateTable('session_dev_browser_designer_variants')
                .set({ status: 'generated', updated_at: now })
                .where('profile_id', '=', input.profileId)
                .where('session_id', '=', input.sessionId)
                .where('designer_session_id', '=', input.designerSessionId)
                .where('status', '=', 'active')
                .execute();
            await transaction
                .updateTable('session_dev_browser_designer_variants')
                .set({ status: 'active', updated_at: now })
                .where('id', '=', input.variantId)
                .execute();
            await transaction
                .updateTable('session_dev_browser_designer_sessions')
                .set({ active_variant_id: input.variantId, updated_at: now })
                .where('id', '=', input.designerSessionId)
                .execute();
        });
    }

    async tuneVariant(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        variantId: EntityId<'bdvar'>;
        stylePatches: BrowserDesignerStylePatchSet;
        textContentOverride?: string;
    }): Promise<void> {
        await this.activateVariant(input);
        const { db } = getPersistence();
        await db
            .updateTable('session_dev_browser_designer_variants')
            .set({
                style_patches_json: JSON.stringify(input.stylePatches),
                text_content_override: input.textContentOverride ?? null,
                updated_at: nowIso(),
            })
            .where('id', '=', input.variantId)
            .execute();
    }

    async markAccepted(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        variantId: EntityId<'bdvar'>;
    }): Promise<void> {
        const { db } = getPersistence();
        const now = nowIso();
        await db.transaction().execute(async (transaction) => {
            await transaction
                .updateTable('session_dev_browser_designer_variants')
                .set({ status: 'generated', updated_at: now })
                .where('profile_id', '=', input.profileId)
                .where('session_id', '=', input.sessionId)
                .where('designer_session_id', '=', input.designerSessionId)
                .where('status', '=', 'active')
                .execute();
            await transaction
                .updateTable('session_dev_browser_designer_variants')
                .set({ status: 'accepted', updated_at: now })
                .where('id', '=', input.variantId)
                .execute();
            await transaction
                .updateTable('session_dev_browser_designer_sessions')
                .set({
                    active_variant_id: input.variantId,
                    accepted_variant_id: input.variantId,
                    updated_at: now,
                })
                .where('id', '=', input.designerSessionId)
                .execute();
        });
    }

    async discardVariant(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        designerSessionId: EntityId<'bdsess'>;
        variantId: EntityId<'bdvar'>;
    }): Promise<void> {
        const { db } = getPersistence();
        await db
            .updateTable('session_dev_browser_designer_variants')
            .set({ status: 'discarded', updated_at: nowIso() })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('designer_session_id', '=', input.designerSessionId)
            .where('id', '=', input.variantId)
            .execute();
    }

    async markStaleForCurrentPage(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        activePageIdentity?: string;
    }): Promise<void> {
        const { db } = getPersistence();
        const now = nowIso();
        const sessionQuery = db
            .updateTable('session_dev_browser_designer_sessions')
            .set({ stale: 1, updated_at: now })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId);
        await (input.activePageIdentity ? sessionQuery.where('page_identity', '!=', input.activePageIdentity) : sessionQuery)
            .execute();
        const annotationQuery = db
            .updateTable('session_dev_browser_designer_annotations')
            .set({ stale: 1, updated_at: now })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId);
        await (input.activePageIdentity ? annotationQuery.where('page_identity', '!=', input.activePageIdentity) : annotationQuery)
            .execute();
    }

    async clearStale(profileId: string, sessionId: EntityId<'sess'>): Promise<void> {
        const { db } = getPersistence();
        await db
            .deleteFrom('session_dev_browser_designer_sessions')
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .where('stale', '=', 1)
            .execute();
    }
}

export const sessionDevBrowserDesignerStore = new SessionDevBrowserDesignerStore();
