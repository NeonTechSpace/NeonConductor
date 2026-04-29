import { beforeEach, describe, expect, it } from 'vitest';

import { getDefaultProfileId, resetPersistenceForTests } from '@/app/backend/persistence/db';
import {
    conversationStore,
    documentArtifactStore,
    sessionStore,
    threadStore,
    workspaceRootStore,
} from '@/app/backend/persistence/stores';
import type { ComposerDocumentAttachmentInput, EntityId } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { documentArtifactService } from '@/app/backend/runtime/services/documentArtifacts/service';

async function createSession(profileId: string): Promise<EntityId<'sess'>> {
    const workspaceRoot = await workspaceRootStore.resolveOrCreate(profileId, 'C:\\NeonConductor\\pdf-doc-tests');
    const bucket = await conversationStore.createOrGetBucket({
        profileId,
        scope: 'workspace',
        workspaceFingerprint: workspaceRoot.fingerprint,
        title: 'PDF Document Tests',
    });
    if (bucket.isErr()) {
        throw new Error(bucket.error.message);
    }

    const thread = await threadStore.create({
        profileId,
        conversationId: bucket.value.id,
        title: 'PDF Document Thread',
        topLevelTab: 'chat',
    });
    if (thread.isErr()) {
        throw new Error(thread.error.message);
    }

    const session = await sessionStore.create(profileId, thread.value.id, 'local');
    if (!session.created) {
        throw new Error(`Expected session creation to succeed, received "${session.reason}".`);
    }

    return session.session.id;
}

async function createExtractedDocument(input: {
    profileId: string;
    sessionId: EntityId<'sess'>;
    fileName: string;
    pages: Array<{ pageNumber: number; text: string; tokens: number }>;
}): Promise<ComposerDocumentAttachmentInput> {
    const documentArtifactId = createEntityId('doc');
    const sha256 = `sha-${documentArtifactId}`;
    const byteSize = 2048;
    await documentArtifactStore.createDraft({
        documentArtifactId,
        profileId: input.profileId,
        sessionId: input.sessionId,
        fileName: input.fileName,
        sha256,
        byteSize,
        storageRelativePath: `${input.profileId}/${input.sessionId}/${documentArtifactId}.pdf`,
    });
    await documentArtifactStore.updateExtraction({
        documentArtifactId,
        pageCount: input.pages.length,
        extractionState: 'extracted',
        extractedTextByteSize: input.pages.reduce((total, page) => total + Buffer.byteLength(page.text, 'utf8'), 0),
        extractedTextTokenCount: input.pages.reduce((total, page) => total + page.tokens, 0),
        pages: input.pages.map((page) => ({
            pageNumber: page.pageNumber,
            textContent: page.text,
            textByteSize: Buffer.byteLength(page.text, 'utf8'),
            estimatedTokenCount: page.tokens,
        })),
    });

    return {
        clientId: `client-${documentArtifactId}`,
        kind: 'document_attachment',
        documentArtifactId,
        fileName: input.fileName,
        mimeType: 'application/pdf',
        sha256,
        byteSize,
        pageCount: input.pages.length,
        extractionState: 'extracted',
        extractedTextByteSize: input.pages.reduce((total, page) => total + Buffer.byteLength(page.text, 'utf8'), 0),
        extractedTextTokenCount: input.pages.reduce((total, page) => total + page.tokens, 0),
    };
}

describe('documentArtifactService', () => {
    beforeEach(() => {
        resetPersistenceForTests();
    });

    it('selects extracted PDF text in attachment order within the run-context budget', async () => {
        const profileId = getDefaultProfileId();
        const sessionId = await createSession(profileId);
        const firstDocument = await createExtractedDocument({
            profileId,
            sessionId,
            fileName: 'architecture.pdf',
            pages: [
                { pageNumber: 1, text: 'Architecture page one.', tokens: 40 },
                { pageNumber: 2, text: 'Architecture page two.', tokens: 40 },
            ],
        });
        const secondDocument = await createExtractedDocument({
            profileId,
            sessionId,
            fileName: 'roadmap.pdf',
            pages: [{ pageNumber: 1, text: 'Roadmap page one.', tokens: 40 }],
        });

        const result = await documentArtifactService.resolveRunContexts({
            profileId,
            sessionId,
            thresholdTokens: 160,
            attachments: [firstDocument, secondDocument],
        });

        expect(result.isOk()).toBe(true);
        if (result.isErr()) {
            throw new Error(result.error.message);
        }
        expect(result.value).toHaveLength(2);
        expect(result.value[0]?.summary.selectedPageRanges).toEqual([{ startPage: 1, endPage: 1 }]);
        expect(result.value[0]?.summary.omittedPageCount).toBe(1);
        expect(result.value[1]?.summary.selectedPageRanges).toEqual([]);
        expect(result.value[1]?.summary.omittedPageCount).toBe(1);
        expect(result.value[0]?.contextText).toContain('Trust: user-supplied document context.');
        expect(result.value[0]?.contextText).toContain('Architecture page one.');
    });

    it('fails closed when a PDF has no extracted text', async () => {
        const profileId = getDefaultProfileId();
        const sessionId = await createSession(profileId);
        const documentArtifactId = createEntityId('doc');
        await documentArtifactStore.createDraft({
            documentArtifactId,
            profileId,
            sessionId,
            fileName: 'scanned.pdf',
            sha256: 'sha-empty',
            byteSize: 1000,
            storageRelativePath: `${profileId}/${sessionId}/${documentArtifactId}.pdf`,
        });
        await documentArtifactStore.updateExtraction({
            documentArtifactId,
            pageCount: 1,
            extractionState: 'empty',
            extractedTextByteSize: 0,
            extractedTextTokenCount: 0,
            pages: [],
        });

        const result = await documentArtifactService.validateComposerAttachments({
            profileId,
            sessionId,
            attachments: [
                {
                    kind: 'document_attachment',
                    documentArtifactId,
                    sha256: 'sha-empty',
                    byteSize: 1000,
                },
            ],
        });

        expect(result.isErr()).toBe(true);
        if (result.isOk()) {
            throw new Error('Expected empty PDF validation to fail.');
        }
        expect(result.error.code).toBe('document_empty');
    });
});
