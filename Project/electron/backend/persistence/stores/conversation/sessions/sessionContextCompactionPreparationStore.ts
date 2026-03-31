import { getPersistence } from '@/app/backend/persistence/db';
import { parseEntityId, parseEnumValue } from '@/app/backend/persistence/stores/shared/rowParsers';
import { nowIso } from '@/app/backend/persistence/stores/shared/utils';
import type { SessionContextCompactionPreparationRecord } from '@/app/backend/persistence/types';
import { providerIds } from '@/app/backend/runtime/contracts';

function mapSessionContextCompactionPreparation(row: {
    session_id: string;
    profile_id: string;
    cutoff_message_id: string;
    source_digest: string;
    summary_text: string;
    summarizer_provider_id: string;
    summarizer_model_id: string;
    threshold_tokens: number;
    estimated_input_tokens: number;
    created_at: string;
    updated_at: string;
}): SessionContextCompactionPreparationRecord {
    return {
        profileId: row.profile_id,
        sessionId: parseEntityId(
            row.session_id,
            'session_context_compaction_preparations.session_id',
            'sess'
        ),
        cutoffMessageId: parseEntityId(
            row.cutoff_message_id,
            'session_context_compaction_preparations.cutoff_message_id',
            'msg'
        ),
        sourceDigest: row.source_digest,
        summaryText: row.summary_text,
        summarizerProviderId: parseEnumValue(
            row.summarizer_provider_id,
            'session_context_compaction_preparations.summarizer_provider_id',
            providerIds
        ),
        summarizerModelId: row.summarizer_model_id,
        thresholdTokens: row.threshold_tokens,
        estimatedInputTokens: row.estimated_input_tokens,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export class SessionContextCompactionPreparationStore {
    async get(profileId: string, sessionId: string): Promise<SessionContextCompactionPreparationRecord | null> {
        const { db } = getPersistence();
        const row = await db
            .selectFrom('session_context_compaction_preparations')
            .select([
                'session_id',
                'profile_id',
                'cutoff_message_id',
                'source_digest',
                'summary_text',
                'summarizer_provider_id',
                'summarizer_model_id',
                'threshold_tokens',
                'estimated_input_tokens',
                'created_at',
                'updated_at',
            ])
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .executeTakeFirst();

        return row ? mapSessionContextCompactionPreparation(row) : null;
    }

    async upsert(input: {
        profileId: string;
        sessionId: string;
        cutoffMessageId: string;
        sourceDigest: string;
        summaryText: string;
        summarizerProviderId: string;
        summarizerModelId: string;
        thresholdTokens: number;
        estimatedInputTokens: number;
    }): Promise<SessionContextCompactionPreparationRecord> {
        const { db } = getPersistence();
        const existing = await this.get(input.profileId, input.sessionId);
        const timestamp = nowIso();

        await db
            .insertInto('session_context_compaction_preparations')
            .values({
                session_id: input.sessionId,
                profile_id: input.profileId,
                cutoff_message_id: input.cutoffMessageId,
                source_digest: input.sourceDigest,
                summary_text: input.summaryText,
                summarizer_provider_id: input.summarizerProviderId,
                summarizer_model_id: input.summarizerModelId,
                threshold_tokens: input.thresholdTokens,
                estimated_input_tokens: input.estimatedInputTokens,
                created_at: existing?.createdAt ?? timestamp,
                updated_at: timestamp,
            })
            .onConflict((oc) =>
                oc.column('session_id').doUpdateSet({
                    cutoff_message_id: input.cutoffMessageId,
                    source_digest: input.sourceDigest,
                    summary_text: input.summaryText,
                    summarizer_provider_id: input.summarizerProviderId,
                    summarizer_model_id: input.summarizerModelId,
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
            sourceDigest: input.sourceDigest,
            summaryText: input.summaryText,
            summarizerProviderId: parseEnumValue(input.summarizerProviderId, 'summarizerProviderId', providerIds),
            summarizerModelId: input.summarizerModelId,
            thresholdTokens: input.thresholdTokens,
            estimatedInputTokens: input.estimatedInputTokens,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
        };
    }

    async deleteBySession(profileId: string, sessionId: string): Promise<void> {
        const { db } = getPersistence();
        await db
            .deleteFrom('session_context_compaction_preparations')
            .where('profile_id', '=', profileId)
            .where('session_id', '=', sessionId)
            .execute();
    }

    async deleteByProfile(profileId: string): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('session_context_compaction_preparations')
            .where('profile_id', '=', profileId)
            .returning('session_id')
            .execute();
        return rows.length;
    }

    async deleteAll(): Promise<number> {
        const { db } = getPersistence();
        const rows = await db
            .deleteFrom('session_context_compaction_preparations')
            .returning('session_id')
            .execute();
        return rows.length;
    }
}

export const sessionContextCompactionPreparationStore = new SessionContextCompactionPreparationStore();
