import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso, parseJsonValue, isJsonRecord, isJsonUnknownArray } from '@/app/backend/persistence/stores/shared/utils';
import type { RunContractPreview, SessionOutboxEntry, SessionOutboxEntryState, SteeringSnapshot } from '@/app/backend/runtime/contracts';
import { sessionOutboxEntryStates } from '@/app/backend/runtime/contracts';
import { parseBrowserContextPacket } from '@/app/backend/runtime/contracts/parsers/devBrowser';
import { createEntityId } from '@/app/backend/runtime/identity/entityIds';
import { buildBrowserContextSummary } from '@/app/backend/runtime/services/devBrowser/browserContext';
import { DataCorruptionError } from '@/app/backend/runtime/services/common/fatalErrors';

function mapOutboxState(value: string): SessionOutboxEntryState {
    return parseEnumValue(value, 'session_outbox_entries.state', sessionOutboxEntryStates);
}

function isRunContractPreview(value: unknown): value is RunContractPreview {
    return isJsonRecord(value);
}

function isSteeringSnapshot(value: unknown): value is SteeringSnapshot {
    return isJsonRecord(value);
}

function mapOutboxEntry(row: {
    id: string;
    profile_id: string;
    session_id: string;
    state: string;
    sequence: number;
    prompt: string;
    steering_snapshot_json: string;
    browser_context_packet_json: string | null;
    latest_run_contract_json: string | null;
    latest_receipt_id: string | null;
    active_permission_request_id: string | null;
    paused_reason: string | null;
    attachment_ids_json?: unknown;
    created_at: string;
    updated_at: string;
}): SessionOutboxEntry {
    const steeringSnapshot = parseJsonValue(
        row.steering_snapshot_json,
        undefined as SteeringSnapshot | undefined,
        isSteeringSnapshot
    );
    if (!steeringSnapshot || !('providerId' in steeringSnapshot) || !('modelId' in steeringSnapshot)) {
        throw new DataCorruptionError('Outbox entry steering snapshot is invalid.');
    }

    const attachmentIds = typeof row.attachment_ids_json === 'string'
        ? parseJsonValue(row.attachment_ids_json, [], isJsonUnknownArray)
              .filter((candidate): candidate is string => typeof candidate === 'string')
              .map((attachmentId) => parseEntityId(attachmentId, 'session_outbox_entry_attachments.attachment_id', 'att'))
        : [];

    const latestRunContract =
        row.latest_run_contract_json !== null
            ? parseJsonValue(
                  row.latest_run_contract_json,
                  undefined as RunContractPreview | undefined,
                  isRunContractPreview
              )
            : undefined;
    const browserContext =
        row.browser_context_packet_json !== null
            ? parseBrowserContextPacket(
                  parseJsonValue(row.browser_context_packet_json, {}, isJsonRecord),
                  'session_outbox_entries.browser_context_packet_json'
              )
            : undefined;

    return {
        id: parseEntityId(row.id, 'session_outbox_entries.id', 'outbox'),
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'session_outbox_entries.session_id', 'sess'),
        state: mapOutboxState(row.state),
        sequence: row.sequence,
        prompt: row.prompt,
        attachmentIds,
        ...(browserContext ? { browserContext, browserContextSummary: buildBrowserContextSummary(browserContext) } : {}),
        steeringSnapshot: steeringSnapshot as SteeringSnapshot,
        ...(latestRunContract ? { latestRunContract } : {}),
        ...(row.latest_receipt_id
            ? { latestReceiptId: parseEntityId(row.latest_receipt_id, 'session_outbox_entries.latest_receipt_id', 'rcpt') }
            : {}),
        ...(row.active_permission_request_id
            ? {
                  activePermissionRequestId: parseEntityId(
                      row.active_permission_request_id,
                      'session_outbox_entries.active_permission_request_id',
                      'perm'
                  ),
              }
            : {}),
        ...(row.paused_reason ? { pausedReason: row.paused_reason } : {}),
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

const outboxColumns = [
    'session_outbox_entries.id as id',
    'session_outbox_entries.profile_id as profile_id',
    'session_outbox_entries.session_id as session_id',
    'session_outbox_entries.state as state',
    'session_outbox_entries.sequence as sequence',
    'session_outbox_entries.prompt as prompt',
    'session_outbox_entries.steering_snapshot_json as steering_snapshot_json',
    'session_outbox_entries.browser_context_packet_json as browser_context_packet_json',
    'session_outbox_entries.latest_run_contract_json as latest_run_contract_json',
    'session_outbox_entries.latest_receipt_id as latest_receipt_id',
    'session_outbox_entries.active_permission_request_id as active_permission_request_id',
    'session_outbox_entries.paused_reason as paused_reason',
    'session_outbox_entries.created_at as created_at',
    'session_outbox_entries.updated_at as updated_at',
] as const;

export class SessionOutboxStore {
    async create(input: {
        profileId: string;
        sessionId: SessionOutboxEntry['sessionId'];
        prompt: string;
        steeringSnapshot: SteeringSnapshot;
        attachmentIds: SessionOutboxEntry['attachmentIds'];
        browserContext?: SessionOutboxEntry['browserContext'];
        latestRunContract?: RunContractPreview;
    }): Promise<SessionOutboxEntry> {
        const { db } = getPersistence();
        const now = nowIso();
        const last = await db
            .selectFrom('session_outbox_entries')
            .select('sequence')
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .orderBy('sequence', 'desc')
            .executeTakeFirst();
        const sequence = (last?.sequence ?? -1) + 1;

        await db
            .insertInto('session_outbox_entries')
            .values({
                id: createEntityId('outbox'),
                profile_id: input.profileId,
                session_id: input.sessionId,
                state: 'queued',
                sequence,
                prompt: input.prompt,
                steering_snapshot_json: JSON.stringify(input.steeringSnapshot),
                browser_context_packet_json: input.browserContext ? JSON.stringify(input.browserContext) : null,
                latest_run_contract_json: input.latestRunContract ? JSON.stringify(input.latestRunContract) : null,
                latest_receipt_id: null,
                active_permission_request_id: null,
                paused_reason: null,
                created_at: now,
                updated_at: now,
            })
            .execute();

        const created = await this.getBySequence({
            profileId: input.profileId,
            sessionId: input.sessionId,
            sequence,
        });
        if (!created) {
            throw new DataCorruptionError('Outbox entry could not be reloaded after creation.');
        }
        return created;
    }

    private async getBySequence(input: {
        profileId: string;
        sessionId: SessionOutboxEntry['sessionId'];
        sequence: number;
    }): Promise<SessionOutboxEntry | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('session_outbox_entries')
            .leftJoin(
                db
                    .selectFrom('session_outbox_entry_attachments')
                    .select('outbox_entry_id')
                    .select((eb) => eb.fn('json_group_array', ['attachment_id']).as('attachment_ids_json'))
                    .groupBy('outbox_entry_id')
                    .as('attachment_lists'),
                'attachment_lists.outbox_entry_id',
                'session_outbox_entries.id'
            )
            .select([...outboxColumns, 'attachment_lists.attachment_ids_json as attachment_ids_json'])
            .where('session_outbox_entries.profile_id', '=', input.profileId)
            .where('session_outbox_entries.session_id', '=', input.sessionId)
            .where('session_outbox_entries.sequence', '=', input.sequence)
            .executeTakeFirst();
        return row ? mapOutboxEntry(row) : null;
    }

    async getById(input: {
        profileId: string;
        sessionId: SessionOutboxEntry['sessionId'];
        entryId: SessionOutboxEntry['id'];
    }): Promise<SessionOutboxEntry | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('session_outbox_entries')
            .leftJoin(
                db
                    .selectFrom('session_outbox_entry_attachments')
                    .select('outbox_entry_id')
                    .select((eb) => eb.fn('json_group_array', ['attachment_id']).as('attachment_ids_json'))
                    .groupBy('outbox_entry_id')
                    .as('attachment_lists'),
                'attachment_lists.outbox_entry_id',
                'session_outbox_entries.id'
            )
            .select([...outboxColumns, 'attachment_lists.attachment_ids_json as attachment_ids_json'])
            .where('session_outbox_entries.profile_id', '=', input.profileId)
            .where('session_outbox_entries.session_id', '=', input.sessionId)
            .where('session_outbox_entries.id', '=', input.entryId)
            .executeTakeFirst();
        return row ? mapOutboxEntry(row) : null;
    }

    async listBySession(profileId: string, sessionId: SessionOutboxEntry['sessionId']): Promise<SessionOutboxEntry[]> {
        const { db } = getPersistence();
        const rows = await db
            .selectFrom('session_outbox_entries')
            .leftJoin(
                db
                    .selectFrom('session_outbox_entry_attachments')
                    .select('outbox_entry_id')
                    .select((eb) => eb.fn('json_group_array', ['attachment_id']).as('attachment_ids_json'))
                    .groupBy('outbox_entry_id')
                    .as('attachment_lists'),
                'attachment_lists.outbox_entry_id',
                'session_outbox_entries.id'
            )
            .select([...outboxColumns, 'attachment_lists.attachment_ids_json as attachment_ids_json'])
            .where('session_outbox_entries.profile_id', '=', profileId)
            .where('session_outbox_entries.session_id', '=', sessionId)
            .orderBy('session_outbox_entries.sequence', 'asc')
            .execute();
        return rows.map(mapOutboxEntry);
    }

    async getNextQueued(profileId: string, sessionId: SessionOutboxEntry['sessionId']): Promise<SessionOutboxEntry | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('session_outbox_entries')
            .leftJoin(
                db
                    .selectFrom('session_outbox_entry_attachments')
                    .select('outbox_entry_id')
                    .select((eb) => eb.fn('json_group_array', ['attachment_id']).as('attachment_ids_json'))
                    .groupBy('outbox_entry_id')
                    .as('attachment_lists'),
                'attachment_lists.outbox_entry_id',
                'session_outbox_entries.id'
            )
            .select([...outboxColumns, 'attachment_lists.attachment_ids_json as attachment_ids_json'])
            .where('session_outbox_entries.profile_id', '=', profileId)
            .where('session_outbox_entries.session_id', '=', sessionId)
            .where('session_outbox_entries.state', '=', 'queued')
            .orderBy('session_outbox_entries.sequence', 'asc')
            .executeTakeFirst();
        return row ? mapOutboxEntry(row) : null;
    }

    async update(input: {
        profileId: string;
        sessionId: SessionOutboxEntry['sessionId'];
        entryId: SessionOutboxEntry['id'];
        prompt?: string;
        state?: SessionOutboxEntryState;
        browserContext?: SessionOutboxEntry['browserContext'] | null;
        latestRunContract?: RunContractPreview | null;
        latestReceiptId?: SessionOutboxEntry['latestReceiptId'] | null;
        activePermissionRequestId?: SessionOutboxEntry['activePermissionRequestId'] | null;
        pausedReason?: string | null;
    }): Promise<SessionOutboxEntry | null> {
        const { db } = getPersistence();
        const row = await db
            .updateTable('session_outbox_entries')
            .set({
                ...(input.prompt !== undefined ? { prompt: input.prompt } : {}),
                ...(input.state !== undefined ? { state: input.state } : {}),
                ...(input.browserContext !== undefined
                    ? {
                          browser_context_packet_json: input.browserContext
                              ? JSON.stringify(input.browserContext)
                              : null,
                      }
                    : {}),
                ...(input.latestRunContract !== undefined
                    ? {
                          latest_run_contract_json: input.latestRunContract
                              ? JSON.stringify(input.latestRunContract)
                              : null,
                      }
                    : {}),
                ...(input.latestReceiptId !== undefined ? { latest_receipt_id: input.latestReceiptId ?? null } : {}),
                ...(input.activePermissionRequestId !== undefined
                    ? { active_permission_request_id: input.activePermissionRequestId ?? null }
                    : {}),
                ...(input.pausedReason !== undefined ? { paused_reason: input.pausedReason ?? null } : {}),
                updated_at: nowIso(),
            })
            .where('profile_id', '=', input.profileId)
            .where('session_id', '=', input.sessionId)
            .where('id', '=', input.entryId)
            .returning('sequence')
            .executeTakeFirst();
        if (!row) {
            return null;
        }
        return this.getBySequence({
            profileId: input.profileId,
            sessionId: input.sessionId,
            sequence: row.sequence,
        });
    }

    async move(input: {
        profileId: string;
        sessionId: SessionOutboxEntry['sessionId'];
        entryId: SessionOutboxEntry['id'];
        direction: 'up' | 'down';
    }): Promise<{ entry: SessionOutboxEntry } | { reason: 'not_found' | 'boundary' }> {
        const current = await this.getById(input);
        if (!current) {
            return { reason: 'not_found' };
        }
        const entries = await this.listBySession(input.profileId, input.sessionId);
        const index = entries.findIndex((entry) => entry.id === input.entryId);
        if (index === -1) {
            return { reason: 'not_found' };
        }
        const otherIndex = input.direction === 'up' ? index - 1 : index + 1;
        const other = entries[otherIndex];
        if (!other) {
            return { reason: 'boundary' };
        }

        const { db } = getPersistence();
        const now = nowIso();
        await db.transaction().execute(async (tx) => {
            await tx
                .updateTable('session_outbox_entries')
                .set({ sequence: -1, updated_at: now })
                .where('id', '=', current.id)
                .execute();
            await tx
                .updateTable('session_outbox_entries')
                .set({ sequence: current.sequence, updated_at: now })
                .where('id', '=', other.id)
                .execute();
            await tx
                .updateTable('session_outbox_entries')
                .set({ sequence: other.sequence, updated_at: now })
                .where('id', '=', current.id)
                .execute();
        });

        const updated = await this.getById(input);
        if (!updated) {
            throw new DataCorruptionError('Outbox entry disappeared after reorder.');
        }
        return { entry: updated };
    }
}

export const sessionOutboxStore = new SessionOutboxStore();
