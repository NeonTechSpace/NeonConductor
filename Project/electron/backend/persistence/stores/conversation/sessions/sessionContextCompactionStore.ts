import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { SessionContextCompactionRecord } from '@/app/backend/persistence/types';

function mapSessionContextCompaction(row: {
    session_id: string;
    profile_id: string;
    cutoff_message_id: string;
    summary_text: string;
    source: 'auto' | 'manual';
    threshold_tokens: number;
    estimated_input_tokens: number;
    created_at: string;
    updated_at: string;
}): SessionContextCompactionRecord {
    return {
        profileId: row.profile_id,
        sessionId: parseEntityId(row.session_id, 'session_context_compactions.session_id', 'sess'),
        cutoffMessageId: parseEntityId(row.cutoff_message_id, 'session_context_compactions.cutoff_message_id', 'msg'),
        summaryText: row.summary_text,
        source: row.source,
        thresholdTokens: row.threshold_tokens,
        estimatedInputTokens: row.estimated_input_tokens,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class SessionContextCompactionStore {
    async get(profileId: string, sessionId: string): Promise<SessionContextCompactionRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('session_context_compactions')
            .select([
                'session_id',
                'profile_id',
                'cutoff_message_id',
                'summary_text',
                'source',
                'threshold_tokens',
                'estimated_input_tokens',
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .executeTakeFirst();

        return row ? mapSessionContextCompaction(row) : null;
    }

    async upsert(input: {
        profileId: string;
        sessionId: string;
        cutoffMessageId: string;
        summaryText: string;
        source: 'auto' | 'manual';
        thresholdTokens: number;
        estimatedInputTokens: number;
    }): Promise<SessionContextCompactionRecord> {
        const { db } = getPersistence();
        const existing = await this.get(input.profileId, input.sessionId);
        const timestamp = nowIso();
        await db
            .insertInto('session_context_compactions')
            .values({
                session_id: input.sessionId,
                profile_id: input.profileId,
                cutoff_message_id: input.cutoffMessageId,
                summary_text: input.summaryText,
                source: input.source,
                threshold_tokens: input.thresholdTokens,
                estimated_input_tokens: input.estimatedInputTokens,
                created_at: existing?.createdAt ?? timestamp,
                updated_at: timestamp,
            })
            .onConflict((oc) =>
                oc.column('session_id').doUpdateSet({
                    cutoff_message_id: input.cutoffMessageId,
                    summary_text: input.summaryText,
                    source: input.source,
                    threshold_tokens: input.thresholdTokens,
                    estimated_input_tokens: input.estimatedInputTokens,
                    updated_at: timestamp,
                })
            )
            .execute();

        return {
            profileId: input.profileId,
            sessionId: parseEntityId(input.sessionId, 'sessionId', 'sess'),
            cutoffMessageId: parseEntityId(input.cutoffMessageId, 'cutoffMessageId', 'msg'),
            summaryText: input.summaryText,
            source: input.source,
            thresholdTokens: input.thresholdTokens,
            estimatedInputTokens: input.estimatedInputTokens,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
        };
    }

    async deleteBySession(profileId: string, sessionId: string): Promise<void> {
        const { db } = getPersistence();
        await db
            .deleteFrom('session_context_compactions')
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .execute();
    }

    async deleteByProfile(profileId: string): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('session_context_compactions')
            .where('profile_id', '=', profileId)
            .returning('session_id')
            .execute();
        return rows.length;
    }

    async deleteAll(): Promise<number> {
        const { db } = getPersistence();
        const rows = await db.deleteFrom('session_context_compactions').returning('session_id').execute();
        return rows.length;
    }
}

export const sessionContextCompactionStore = new SessionContextCompactionStore();
