import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type {
    ComposerAttachmentInput,
    EntityId,
    SessionAttachmentPayload,
    SessionAttachmentSummary,
} from '@/app/backend/runtime/contracts';
import { composerTextFileAttachmentEncodings } from '@/app/backend/runtime/contracts';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

function toUint8Array(bytes: ArrayBuffer | Uint8Array): Uint8Array {
    return bytes instanceof Uint8Array ? Uint8Array.from(bytes) : new Uint8Array(bytes);
}

function mapAttachmentSummary(row: {
    id: string;
    kind: string;
    file_name: string | null;
    mime_type: string;
    sha256: string;
    byte_size: number;
    width: number | null;
    height: number | null;
    encoding: string | null;
    created_at: string;
}): SessionAttachmentSummary {
    const kind = parseEnumValue(row.kind, 'conversation_attachments.kind', [
        'image_attachment',
        'text_file_attachment',
    ] as const);
    return {
        id: parseEntityId(row.id, 'conversation_attachments.id', 'att'),
        kind,
        ...(row.file_name ? { fileName: row.file_name } : {}),
        mimeType: row.mime_type,
        sha256: row.sha256,
        byteSize: row.byte_size,
        ...(row.width !== null ? { width: row.width } : {}),
        ...(row.height !== null ? { height: row.height } : {}),
        ...(row.encoding
            ? {
                  encoding: parseEnumValue(
                      row.encoding,
                      'conversation_attachments.encoding',
                      composerTextFileAttachmentEncodings
                  ),
              }
            : {}),
        createdAt: row.created_at,
    };
}

function mapAttachmentPayload(row: {
    id: string;
    kind: string;
    file_name: string | null;
    mime_type: string;
    sha256: string;
    byte_size: number;
    width: number | null;
    height: number | null;
    encoding: string | null;
    bytes_blob: Uint8Array | null;
    text_content: string | null;
    created_at: string;
}): SessionAttachmentPayload {
    const summary = mapAttachmentSummary(row);
    if (summary.kind === 'image_attachment') {
        if (!row.bytes_blob || summary.width === undefined || summary.height === undefined) {
            throw new DataCorruptionError('Image attachment payload is missing bytes or dimensions.');
        }
        return {
            ...summary,
            kind: 'image_attachment',
            bytesBase64: Buffer.from(toUint8Array(row.bytes_blob)).toString('base64'),
        };
    }
    if (!row.text_content || !summary.encoding) {
        throw new DataCorruptionError('Text attachment payload is missing text or encoding.');
    }
    return {
        ...summary,
        kind: 'text_file_attachment',
        text: row.text_content,
    };
}

export class ConversationAttachmentStore {
    async createSnapshot(input: {
        profileId: string;
        sessionId: EntityId<'sess'>;
        attachment: ComposerAttachmentInput;
        messagePartId?: EntityId<'part'>;
    }): Promise<SessionAttachmentSummary> {
        const { db } = getPersistence();
        const now = nowIso();
        const attachmentId = createEntityId('att');

        if (input.attachment.kind === 'text_file_attachment') {
            const inserted = await db
                .insertInto('conversation_attachments')
                .values({
                    id: attachmentId,
                    profile_id: input.profileId,
                    session_id: input.sessionId,
                    message_part_id: input.messagePartId ?? null,
                    kind: 'text_file_attachment',
                    file_name: input.attachment.fileName,
                    mime_type: input.attachment.mimeType,
                    sha256: input.attachment.sha256,
                    byte_size: input.attachment.byteSize,
                    width: null,
                    height: null,
                    encoding: input.attachment.encoding,
                    bytes_blob: null,
                    text_content: input.attachment.text,
                    created_at: now,
                    updated_at: now,
                })
                .returning([
                    'id',
                    'kind',
                    'file_name',
                    'mime_type',
                    'sha256',
                    'byte_size',
                    'width',
                    'height',
                    'encoding',
                    'created_at',
                ])
                .executeTakeFirstOrThrow();
            return mapAttachmentSummary(inserted);
        }

        const inserted = await db
            .insertInto('conversation_attachments')
            .values({
                id: attachmentId,
                profile_id: input.profileId,
                session_id: input.sessionId,
                message_part_id: input.messagePartId ?? null,
                kind: 'image_attachment',
                file_name: input.attachment.fileName ?? null,
                mime_type: input.attachment.mimeType,
                sha256: input.attachment.sha256,
                byte_size: input.attachment.byteSize ?? Buffer.from(input.attachment.bytesBase64, 'base64').byteLength,
                width: input.attachment.width,
                height: input.attachment.height,
                encoding: null,
                bytes_blob: Uint8Array.from(Buffer.from(input.attachment.bytesBase64, 'base64')),
                text_content: null,
                created_at: now,
                updated_at: now,
            })
            .returning([
                'id',
                'kind',
                'file_name',
                'mime_type',
                'sha256',
                'byte_size',
                'width',
                'height',
                'encoding',
                'created_at',
            ])
            .executeTakeFirstOrThrow();

        return mapAttachmentSummary(inserted);
    }

    async getPayloadForProfile(profileId: string, attachmentId: EntityId<'att'>): Promise<SessionAttachmentPayload | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('conversation_attachments')
            .select([
                'id',
                'kind',
                'file_name',
                'mime_type',
                'sha256',
                'byte_size',
                'width',
                'height',
                'encoding',
                'bytes_blob',
                'text_content',
                'created_at',
            ])
            .where('id', '=', attachmentId)
            .where('profile_id', '=', profileId)
            .executeTakeFirst();

        return row ? mapAttachmentPayload(row) : null;
    }

    async getPayload(attachmentId: EntityId<'att'>): Promise<SessionAttachmentPayload | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('conversation_attachments')
            .select([
                'id',
                'kind',
                'file_name',
                'mime_type',
                'sha256',
                'byte_size',
                'width',
                'height',
                'encoding',
                'bytes_blob',
                'text_content',
                'created_at',
            ])
            .where('id', '=', attachmentId)
            .executeTakeFirst();

        return row ? mapAttachmentPayload(row) : null;
    }

    async listPayloadsByOutboxEntry(entryId: EntityId<'outbox'>): Promise<SessionAttachmentPayload[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('session_outbox_entry_attachments')
            .innerJoin('conversation_attachments', 'conversation_attachments.id', 'session_outbox_entry_attachments.attachment_id')
            .select([
                'conversation_attachments.id as id',
                'conversation_attachments.kind as kind',
                'conversation_attachments.file_name as file_name',
                'conversation_attachments.mime_type as mime_type',
                'conversation_attachments.sha256 as sha256',
                'conversation_attachments.byte_size as byte_size',
                'conversation_attachments.width as width',
                'conversation_attachments.height as height',
                'conversation_attachments.encoding as encoding',
                'conversation_attachments.bytes_blob as bytes_blob',
                'conversation_attachments.text_content as text_content',
                'conversation_attachments.created_at as created_at',
                'session_outbox_entry_attachments.sequence as sequence',
            ])
            .where('session_outbox_entry_attachments.outbox_entry_id', '=', entryId)
            .orderBy('session_outbox_entry_attachments.sequence', 'asc')
            .execute();

        return rows.map((row) => mapAttachmentPayload(row));
    }

    async replaceOutboxEntryAttachments(input: {
        outboxEntryId: EntityId<'outbox'>;
        attachmentIds: EntityId<'att'>[];
    }): Promise<void> {
        const { db } = getPersistence();
        await db.deleteFrom('session_outbox_entry_attachments').where('outbox_entry_id', '=', input.outboxEntryId).execute();

        if (input.attachmentIds.length === 0) {
            return;
        }

        const now = nowIso();
        await db
            .insertInto('session_outbox_entry_attachments')
            .values(
                input.attachmentIds.map((attachmentId, sequence) => ({
                    outbox_entry_id: input.outboxEntryId,
                    attachment_id: attachmentId,
                    sequence,
                    created_at: now,
                }))
            )
            .execute();
    }

    async attachToMessagePart(input: { attachmentId: EntityId<'att'>; messagePartId: EntityId<'part'> }): Promise<void> {
        const { db } = getPersistence();
        await db
            .updateTable('conversation_attachments')
            .set({
                message_part_id: input.messagePartId,
                updated_at: nowIso(),
            })
            .where('id', '=', input.attachmentId)
            .execute();
    }
}

export const conversationAttachmentStore = new ConversationAttachmentStore();
