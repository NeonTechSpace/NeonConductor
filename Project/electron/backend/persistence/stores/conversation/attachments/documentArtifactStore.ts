import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    DocumentArtifactLifecycleState,
    DocumentArtifactPageSummary,
    DocumentArtifactSummary,
    DocumentExtractionState,
    EntityId,
} from '@/app/backend/runtime/contracts';
import {
    composerDocumentAttachmentMimeTypes,
    documentArtifactLifecycleStates,
    documentExtractionStates,
} from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';

interface DocumentArtifactRow {
    id: string;
    profile_id: string;
    session_id: string;
    file_name: string;
    mime_type: string;
    sha256: string;
    byte_size: number;
    storage_relative_path: string;
    page_count: number | null;
    extraction_state: string;
    lifecycle_state: string;
    extracted_text_byte_size: number;
    extracted_text_token_count: number;
    error_code: string | null;
    error_message: string | null;
    created_at: string;
    updated_at: string;
}

interface DocumentArtifactPageRow {
    document_artifact_id: string;
    page_number: number;
    text_content: string;
    text_sha256: string | null;
    text_byte_size: number;
    estimated_token_count: number;
    created_at: string;
}

export interface DocumentArtifactStorageRecord extends DocumentArtifactSummary {
    storageRelativePath: string;
}

export interface DocumentArtifactPageWrite {
    pageNumber: number;
    textContent: string;
    textSha256?: string;
    textByteSize: number;
    estimatedTokenCount: number;
}

function mapPage(row: DocumentArtifactPageRow): DocumentArtifactPageSummary {
    return {
        pageNumber: row.page_number,
        textByteSize: row.text_byte_size,
        estimatedTokenCount: row.estimated_token_count,
        ...(row.text_sha256 ? { textSha256: row.text_sha256 } : {}),
        hasText: row.text_content.trim().length > 0,
    };
}

function mapArtifact(row: DocumentArtifactRow, pages: DocumentArtifactPageRow[]): DocumentArtifactStorageRecord {
    return {
        id: parseEntityId(row.id, 'document_artifacts.id', 'doc'),
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'document_artifacts.session_id', 'sess'),
        fileName: row.file_name,
        mimeType: parseEnumValue(row.mime_type, 'document_artifacts.mime_type', composerDocumentAttachmentMimeTypes),
        sha256: row.sha256,
        byteSize: row.byte_size,
        storageRelativePath: row.storage_relative_path,
        ...(row.page_count !== null ? { pageCount: row.page_count } : {}),
        extractionState: parseEnumValue(
            row.extraction_state,
            'document_artifacts.extraction_state',
            documentExtractionStates
        ),
        lifecycleState: parseEnumValue(
            row.lifecycle_state,
            'document_artifacts.lifecycle_state',
            documentArtifactLifecycleStates
        ),
        extractedTextByteSize: row.extracted_text_byte_size,
        extractedTextTokenCount: row.extracted_text_token_count,
        ...(row.error_code ? { errorCode: row.error_code } : {}),
        ...(row.error_message ? { errorMessage: row.error_message } : {}),
        pages: pages.map(mapPage),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class DocumentArtifactStore {
    async createDraft(input: {
        documentArtifactId?: EntityId<'doc'>;
        profileId: string;
        sessionId: EntityId<'sess'>;
        fileName: string;
        sha256: string;
        byteSize: number;
        storageRelativePath: string;
    }): Promise<EntityId<'doc'>> {
        const { db } = getPersistence();
        const documentArtifactId = input.documentArtifactId ?? createEntityId('doc');
        const now = nowIso();

        await db
            .insertInto('document_artifacts')
            .values({
                id: documentArtifactId,
                profile_id: input.profileId,
                session_id: input.sessionId,
                file_name: input.fileName,
                mime_type: 'application/pdf',
                sha256: input.sha256,
                byte_size: input.byteSize,
                storage_relative_path: input.storageRelativePath,
                page_count: null,
                extraction_state: 'pending',
                lifecycle_state: 'draft',
                extracted_text_byte_size: 0,
                extracted_text_token_count: 0,
                error_code: null,
                error_message: null,
                created_at: now,
                updated_at: now,
            })
            .execute();

        return documentArtifactId;
    }

    async updateExtraction(input: {
        documentArtifactId: EntityId<'doc'>;
        pageCount?: number;
        extractionState: DocumentExtractionState;
        extractedTextByteSize: number;
        extractedTextTokenCount: number;
        errorCode?: string;
        errorMessage?: string;
        pages: DocumentArtifactPageWrite[];
    }): Promise<void> {
        const { db } = getPersistence();
        const now = nowIso();
        await db.transaction().execute(async (transaction) => {
            await transaction
                .deleteFrom('document_artifact_pages')
                .where('document_artifact_id', '=', input.documentArtifactId)
                .execute();

            if (input.pages.length > 0) {
                await transaction
                    .insertInto('document_artifact_pages')
                    .values(
                        input.pages.map((page) => ({
                            document_artifact_id: input.documentArtifactId,
                            page_number: page.pageNumber,
                            text_content: page.textContent,
                            text_sha256: page.textSha256 ?? null,
                            text_byte_size: page.textByteSize,
                            estimated_token_count: page.estimatedTokenCount,
                            created_at: now,
                        }))
                    )
                    .execute();
            }

            await transaction
                .updateTable('document_artifacts')
                .set({
                    page_count: input.pageCount ?? null,
                    extraction_state: input.extractionState,
                    extracted_text_byte_size: input.extractedTextByteSize,
                    extracted_text_token_count: input.extractedTextTokenCount,
                    error_code: input.errorCode ?? null,
                    error_message: input.errorMessage ?? null,
                    updated_at: now,
                })
                .where('id', '=', input.documentArtifactId)
                .execute();
        });
    }

    async getById(input: {
        profileId: string;
        documentArtifactId: EntityId<'doc'>;
        sessionId?: EntityId<'sess'>;
    }): Promise<DocumentArtifactStorageRecord | null> {
        const { db } = getPersistence();
        let query = db
            .selectFrom('document_artifacts')
            .selectAll()
            .where('profile_id', '=', input.profileId)
            .where('id', '=', input.documentArtifactId);
        if (input.sessionId) {
            query = query.where('session_id', '=', input.sessionId);
        }

        const row = await query.executeTakeFirst();
        if (!row) {
            return null;
        }

        const pages = await db
            .selectFrom('document_artifact_pages')
            .selectAll()
            .where('document_artifact_id', '=', input.documentArtifactId)
            .orderBy('page_number', 'asc')
            .execute();

        return mapArtifact(row, pages);
    }

    async listPagesWithText(documentArtifactId: EntityId<'doc'>): Promise<DocumentArtifactPageWrite[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('document_artifact_pages')
            .selectAll()
            .where('document_artifact_id', '=', documentArtifactId)
            .orderBy('page_number', 'asc')
            .execute();

        return rows.map((row) => ({
            pageNumber: row.page_number,
            textContent: row.text_content,
            ...(row.text_sha256 ? { textSha256: row.text_sha256 } : {}),
            textByteSize: row.text_byte_size,
            estimatedTokenCount: row.estimated_token_count,
        }));
    }

    async markAttached(documentArtifactId: EntityId<'doc'>): Promise<void> {
        const { db } = getPersistence();
        await db
            .updateTable('document_artifacts')
            .set({
                lifecycle_state: 'attached',
                updated_at: nowIso(),
            })
            .where('id', '=', documentArtifactId)
            .where('lifecycle_state', '!=', 'deleted' satisfies DocumentArtifactLifecycleState)
            .execute();
    }

    async discardDraft(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        documentArtifactId: EntityId<'doc'>;
    }): Promise<{ discarded: true; storageRelativePath: string } | { discarded: false; reason: 'not_found' | 'already_attached' }> {
        const artifact = await this.getById(input);
        if (!artifact || artifact.lifecycleState === 'deleted') {
            return { discarded: false, reason: 'not_found' };
        }
        if (artifact.lifecycleState !== 'draft') {
            return { discarded: false, reason: 'already_attached' };
        }

        const { db } = getPersistence();
        await db
            .updateTable('document_artifacts')
            .set({
                lifecycle_state: 'deleted',
                updated_at: nowIso(),
            })
            .where('id', '=', input.documentArtifactId)
            .execute();

        return {
            discarded: true,
            storageRelativePath: artifact.storageRelativePath,
        };
    }

    async listExpiredDrafts(cutoffIso: string): Promise<DocumentArtifactStorageRecord[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('document_artifacts')
            .selectAll()
            .where('lifecycle_state', '=', 'draft')
            .where('updated_at', '<', cutoffIso)
            .execute();

        const results: DocumentArtifactStorageRecord[] = [];
        for (const row of rows) {
            const pages = await db
                .selectFrom('document_artifact_pages')
                .selectAll()
                .where('document_artifact_id', '=', row.id)
                .orderBy('page_number', 'asc')
                .execute();
            results.push(mapArtifact(row, pages));
        }
        return results;
    }

    async markDeleted(documentArtifactIds: EntityId<'doc'>[]): Promise<void> {
        if (documentArtifactIds.length === 0) {
            return;
        }
        const { db } = getPersistence();
        await db
            .updateTable('document_artifacts')
            .set({
                lifecycle_state: 'deleted',
                updated_at: nowIso(),
            })
            .where('id', 'in', documentArtifactIds)
            .execute();
    }
}

export const documentArtifactStore = new DocumentArtifactStore();
